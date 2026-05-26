import { Middleware } from 'telegraf'
import { MyContext } from '../context.js'
import { redis } from '../../services/redis.js'
import { logger } from '../../utils/logger.js'

export const redisSession = (): Middleware<MyContext> => {
    return async (ctx, next) => {
        const key = `session:${ctx.from?.id}`

        // Load session from Redis
        const storedSession = await redis.get(key)
        if (storedSession) {
            try {
                ctx.session = JSON.parse(storedSession)
            } catch (err) {
                logger.error('Failed to parse session from Redis:', err)
                ctx.session = {} as any
            }
        } else {
            ctx.session = {} as any
        }

        // Capture the original state to check for changes
        const sessionSnapshot = JSON.stringify(ctx.session)

        await next()

        // Save session back to Redis if it was modified
        const newSessionState = JSON.stringify(ctx.session)
        if (newSessionState !== sessionSnapshot) {
            // Set session with 24 hours expiration
            await redis.set(key, newSessionState, 'EX', 24 * 60 * 60)
        }
    }
}
