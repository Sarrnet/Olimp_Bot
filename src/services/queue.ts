import { Queue, Worker, Job } from 'bullmq'
import { redis } from './redis.js'
import { trainingDeliveryService } from './training-delivery.js'
import { logger } from '../utils/logger.js'
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
            const { telegramId } = job.data
            // Backward compatible: legacy jobs carried a plain `message` string.
            const payload: BroadcastPayload = job.data.payload || {
                kind: 'text',
                text: job.data.message,
            }
            try {
                await sendBroadcastItem(telegram, Number(telegramId), payload)
            } catch (error: any) {
                const desc: string = error.description || error.message || ''
                if (
                    desc.includes('bot was blocked') ||
                    desc.includes('user is deactivated') ||
                    desc.includes('chat not found')
                ) {
                    logger.info(`User ${telegramId} unreachable (${desc}). Skipping broadcast.`)
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
    })

    return { trainingWorker, broadcastWorker }
}
