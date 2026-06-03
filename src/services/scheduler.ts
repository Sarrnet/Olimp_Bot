import cron from 'node-cron'
import { prisma } from '../db/prisma.js'
import { trainingQueue } from './queue.js'
import { logger } from '../utils/logger.js'

export class SchedulerService {
    init() {
        // Every day at 9:00 AM
        cron.schedule('0 9 * * *', async () => {
            logger.info('Starting scheduled daily training distribution via queue...')
            await this.enqueueDailyTraining()
        })
    }

    async enqueueDailyTraining() {
        try {
            // Before enqueuing, check for streak resets and apply freeze skips
            await this.handleStreakResets()

            let cursor: string | undefined = undefined
            const batchSize = 100
            let totalEnqueued = 0

            while (true) {
                const users: any[] = await prisma.user.findMany({
                    take: batchSize,
                    skip: cursor ? 1 : 0,
                    cursor: cursor ? { id: cursor } : undefined,
                    where: {
                        paid: true,
                        onboardingCompleted: true,
                        notificationsEnabled: true,
                    },
                    orderBy: { id: 'asc' },
                    select: { id: true, telegramId: true },
                })

                if (users.length === 0) break

                for (const user of users) {
                    try {
                        await trainingQueue.add(
                            `training-${user.telegramId}-${new Date().toISOString().split('T')[0]}`,
                            { telegramId: user.telegramId.toString() },
                            { delay: totalEnqueued * 200 }, // Spreading load: 5 users per sec
                        )
                        totalEnqueued++
                    } catch (error) {
                        logger.error(
                            `Failed to enqueue training for user ${user.telegramId}:`,
                            error,
                        )
                    }
                }

                cursor = users[users.length - 1].id
            }

            logger.info(`Successfully enqueued training for ${totalEnqueued} users.`)
        } catch (error) {
            logger.error('Error in enqueueDailyTraining scheduler:', error)
        }
    }

    async handleStreakResets() {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        yesterday.setHours(0, 0, 0, 0)

        try {
            const usersWithStreaks = await prisma.user.findMany({
                where: {
                    trainingStreak: { gt: 0 },
                    onboardingCompleted: true,
                },
                select: {
                    id: true,
                    telegramId: true,
                    lastTrainingDate: true,
                    freezeCount: true,
                    trainingStreak: true,
                },
            })

            for (const user of usersWithStreaks) {
                if (!user.lastTrainingDate) continue

                const lastDate = new Date(user.lastTrainingDate)
                lastDate.setHours(0, 0, 0, 0)

                const diff = yesterday.getTime() - lastDate.getTime()
                const diffDays = Math.floor(diff / (1000 * 3600 * 24))

                if (diffDays >= 1) {
                    // User missed at least one full day
                    if (user.freezeCount > 0) {
                        await prisma.user.update({
                            where: { id: user.id },
                            data: {
                                freezeCount: { decrement: 1 },
                                // We don't increment streak, but we don't reset it either.
                                // We update lastTrainingDate to yesterday so they have another 24h window
                                lastTrainingDate: yesterday,
                            },
                        })
                        logger.info(
                            `Applied Freeze Skip for user ${user.telegramId}. Remaining: ${user.freezeCount - 1}`,
                        )
                    } else {
                        await prisma.user.update({
                            where: { id: user.id },
                            data: { trainingStreak: 0 },
                        })
                        logger.info(`Reset streak for user ${user.telegramId} due to inactivity.`)
                    }
                }
            }
        } catch (error) {
            logger.error('Error in handleStreakResets:', error)
        }
    }
}

export const schedulerService = new SchedulerService()
