import Redis from 'ioredis'
import { logger } from '../utils/logger.js'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
})

redis.on('error', (err) => {
    logger.error('Redis connection error:', err)
})

redis.on('connect', () => {
    logger.info('Connected to Redis')
})
