import { Queue, Worker, Job } from 'bullmq'
import { redis } from './redis.js'
import { trainingDeliveryService } from './training-delivery.js'
import { logger } from '../utils/logger.js'
import { i18n } from './i18n.js'
import { Telegram } from 'telegraf'
import type { BroadcastPayload } from '../bot/context.js'

const TRAINING_QUEUE_NAME = 'training-delivery'
const BROADCAST_QUEUE_NAME = 'admin-broadcast'

const defaultOptions = {
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 2000, // 2s start
    },
    removeOnComplete: true,
    removeOnFail: false, // Keep failed jobs for manual review if they exhausted retries
}

export const trainingQueue = new Queue(TRAINING_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: defaultOptions,
})

export const broadcastQueue = new Queue(BROADCAST_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: defaultOptions,
})

/**
 * Sends one broadcast item to a single recipient, dispatching by content kind.
 * Media is delivered by `fileId` (already uploaded to Telegram), so nothing is
 * re-uploaded per recipient. Video notes and stickers ignore captions because
 * Telegram does not support them for those types.
 */
export async function sendBroadcastItem(
    telegram: Telegram,
    chatId: number,
    payload: BroadcastPayload,
) {
    const caption = payload.caption
    const captionOpts = caption ? { caption, parse_mode: 'HTML' as const } : undefined

    switch (payload.kind) {
        case 'text':
            await telegram.sendMessage(chatId, payload.text || '', { parse_mode: 'HTML' })
            break
        case 'photo':
            await telegram.sendPhoto(chatId, payload.fileId!, captionOpts)
            break
        case 'video':
            await telegram.sendVideo(chatId, payload.fileId!, captionOpts)
            break
        case 'document':
            await telegram.sendDocument(chatId, payload.fileId!, captionOpts)
            break
        case 'voice':
            await telegram.sendVoice(chatId, payload.fileId!, captionOpts)
            break
        case 'audio':
            await telegram.sendAudio(chatId, payload.fileId!, captionOpts)
            break
        case 'animation':
            await telegram.sendAnimation(chatId, payload.fileId!, captionOpts)
            break
        case 'video_note':
            await telegram.sendVideoNote(chatId, payload.fileId!)
            break
        case 'sticker':
            await telegram.sendSticker(chatId, payload.fileId!)
            break
        default:
            throw new Error(`Unsupported broadcast kind: ${(payload as BroadcastPayload).kind}`)
    }

    // For media broadcasts, a long text can be attached as a separate message
    // (sent right after the file) so it is not constrained by the 1024-char
    // caption limit.
    if (payload.kind !== 'text' && payload.followupText) {
        await telegram.sendMessage(chatId, payload.followupText, { parse_mode: 'HTML' })
    }
}

// --- Broadcast delivery stats (per-broadcast counters in Redis) ---

type BroadcastOutcome = 'sent' | 'blocked' | 'failed'

const statsKey = (broadcastId: string) => `broadcast:stats:${broadcastId}`
const reportedKey = (broadcastId: string) => `broadcast:reported:${broadcastId}`
const STATS_TTL_SECONDS = 24 * 60 * 60

/** Initializes counters/meta for a broadcast before its jobs are enqueued. */
export async function initBroadcastStats(broadcastId: string, chatId: number, lang: string) {
    try {
        const key = statsKey(broadcastId)
        await redis.hset(key, { chatId: String(chatId), lang, sent: 0, blocked: 0, failed: 0 })
        await redis.expire(key, STATS_TTL_SECONDS)
    } catch (error) {
        logger.error('Error initializing broadcast stats:', error)
    }
}

/**
 * Sets the final recipient total (denominator) once all jobs are enqueued, then
 * checks whether the broadcast is already complete (covers tiny broadcasts).
 */
export async function finalizeBroadcastTotal(
    telegram: Telegram,
    broadcastId: string,
    total: number,
) {
    try {
        await redis.hset(statsKey(broadcastId), 'total', total)
        await maybeReportBroadcast(telegram, broadcastId)
    } catch (error) {
        logger.error('Error finalizing broadcast total:', error)
    }
}

/** Records one terminal outcome and reports the summary if the batch is done. */
async function recordBroadcastOutcome(
    telegram: Telegram,
    broadcastId: string | undefined,
    outcome: BroadcastOutcome,
) {
    if (!broadcastId) return // legacy jobs without a broadcastId are not tracked
    try {
        await redis.hincrby(statsKey(broadcastId), outcome, 1)
        await maybeReportBroadcast(telegram, broadcastId)
    } catch (error) {
        // Stats must never break delivery — swallow everything.
        logger.error('Error recording broadcast outcome:', error)
    }
}

/** Sends the admin a one-time summary once sent+blocked+failed reaches total. */
async function maybeReportBroadcast(telegram: Telegram, broadcastId: string) {
    const data = await redis.hgetall(statsKey(broadcastId))
    if (!data || data.total === undefined) return // total not set yet → not finished

    const total = parseInt(data.total, 10)
    const sent = parseInt(data.sent || '0', 10)
    const blocked = parseInt(data.blocked || '0', 10)
    const failed = parseInt(data.failed || '0', 10)
    if (sent + blocked + failed < total) return // still in progress

    // Ensure the summary is sent exactly once, even with 5 parallel workers.
    const reserved = await redis.set(reportedKey(broadcastId), '1', 'EX', STATS_TTL_SECONDS, 'NX')
    if (reserved !== 'OK') return

    const chatId = parseInt(data.chatId || '0', 10)
    const lang = data.lang || 'ru'
    if (chatId) {
        try {
            await telegram.sendMessage(
                chatId,
                i18n.t(lang, 'admin.broadcast_report', { total, sent, blocked, failed }),
                { parse_mode: 'HTML' },
            )
        } catch (error) {
            logger.error('Error sending broadcast report:', error)
        }
    }
    await redis.del(statsKey(broadcastId))
    logger.info(
        `Broadcast ${broadcastId} finished: total=${total} sent=${sent} blocked=${blocked} failed=${failed}`,
    )
}

export function setupQueues(telegram: Telegram) {
    // 1. Training Worker
    const trainingWorker = new Worker(
        TRAINING_QUEUE_NAME,
        async (job: Job) => {
            const { telegramId } = job.data
            await trainingDeliveryService.sendTrainingToUser(telegram, BigInt(telegramId))
        },
        { connection: redis, concurrency: 1 },
    )

    // 2. Broadcast Worker
    const broadcastWorker = new Worker(
        BROADCAST_QUEUE_NAME,
        async (job: Job) => {
            const { telegramId, broadcastId } = job.data
            // Backward compatible: legacy jobs carried a plain `message` string.
            const payload: BroadcastPayload = job.data.payload || {
                kind: 'text',
                text: job.data.message,
            }
            try {
                await sendBroadcastItem(telegram, Number(telegramId), payload)
                await recordBroadcastOutcome(telegram, broadcastId, 'sent')
            } catch (error: any) {
                const desc: string = error.description || error.message || ''
                if (
                    desc.includes('bot was blocked') ||
                    desc.includes('user is deactivated') ||
                    desc.includes('chat not found')
                ) {
                    logger.info(`User ${telegramId} unreachable (${desc}). Skipping broadcast.`)
                    await recordBroadcastOutcome(telegram, broadcastId, 'blocked')
                    return // Don't retry if the user can no longer be reached
                }
                throw error // Let BullMQ retry for other errors (network, 429, 5xx)
            }
        },
        { connection: redis, concurrency: 5 }, // Faster than training, 5 parallel messages
    )

    trainingWorker.on('failed', (job, err) => {
        logger.error(`Training job ${job?.id} failed: ${err.message}`)
    })

    broadcastWorker.on('failed', (job, err) => {
        logger.error(
            `Broadcast job ${job?.id} failed for user ${job?.data.telegramId}: ${err.message}`,
        )
        // Count only terminal failures (retries exhausted) toward the summary.
        if (job) {
            const maxAttempts = job.opts.attempts ?? 1
            if (job.attemptsMade >= maxAttempts) {
                void recordBroadcastOutcome(telegram, job.data.broadcastId, 'failed')
            }
        }
    })

    return { trainingWorker, broadcastWorker }
}
