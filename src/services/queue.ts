import { Queue, Worker, Job } from 'bullmq'
import { redis } from './redis.js'
import { trainingDeliveryService } from './training-delivery.js'
import { logger } from '../utils/logger.js'
import { Telegram } from 'telegraf'

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
            const { telegramId, message } = job.data
            try {
                await telegram.sendMessage(Number(telegramId), message, { parse_mode: 'HTML' })
            } catch (error: any) {
                if (error.description?.includes('bot was blocked')) {
                    logger.info(`User ${telegramId} blocked the bot. Skipping broadcast.`)
                    return // Don't retry if blocked
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
