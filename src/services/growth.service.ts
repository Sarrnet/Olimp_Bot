import { prisma } from '../db/prisma.js'
import { logger } from '../utils/logger.js'
import { UserGrowthLog, DailyGrowthApplied } from '../types/index.js'

export class GrowthService {
    /**
     * Applies growth bonus (+0.01cm) for a specific category if not already applied today.
     */
    async applyInstantBonus(userId: string, category: keyof DailyGrowthApplied): Promise<boolean> {
        const today = new Date().toISOString().split('T')[0]
        
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, currentHeight: true, growthApplied: true, telegramId: true, onboardingData: true }
            })

            if (!user) return false

            const growthApplied = (user.growthApplied as UserGrowthLog) || {}
            if (!growthApplied[today]) {
                growthApplied[today] = {}
            }

            if (growthApplied[today][category]) {
                return false // Already applied today
            }

            const currentHeight = user.currentHeight || (user.onboardingData as any)?.current_height_cm || 0
            const newHeight = parseFloat((currentHeight + 0.01).toFixed(3))

            growthApplied[today][category] = true

            await prisma.user.update({
                where: { id: user.id },
                data: {
                    currentHeight: newHeight,
                    growthApplied: growthApplied as any,
                    analysisImageFileId: null // Clear cached image to trigger regeneration
                }
            })

            logger.info(`User ${user.telegramId} received instant growth bonus for ${category}: +0.01cm. New height: ${newHeight}`)
            return true
        } catch (error) {
            logger.error(`Error in applyInstantBonus for user ${userId}, category ${category}:`, error)
            return false
        }
    }

    /**
     * Calculates daily growth for all users based on yesterday's performance.
     * Each category (Water, Sleep, Exercise) adds 0.01cm.
     * DEPRECATED: Replaced by applyInstantBonus.
     */
    async calculateDailyGrowth() {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const dateKey = yesterday.toISOString().split('T')[0]

        try {
            const users = await prisma.user.findMany({
                where: { onboardingCompleted: true, paid: true },
            })

            for (const user of users) {
                let dailyBonus = 0

                // 1. Check Exercises
                const session = await prisma.trainingSession.findFirst({
                    where: {
                        userId: user.id,
                        completed: true,
                        date: {
                            gte: new Date(yesterday.setHours(0, 0, 0, 0)),
                            lte: new Date(yesterday.setHours(23, 59, 59, 999)),
                        },
                    },
                })
                if (session) dailyBonus += 0.01

                // 2. Check Water (Goal: 2000ml)
                const waterLogs = (user.waterLogs as any) || {}
                if ((waterLogs[dateKey] || 0) >= 2000) dailyBonus += 0.01

                // 3. Check Sleep (Goal: 8h)
                const sleepLogs = (user.sleepLogs as any) || {}
                if ((sleepLogs[dateKey] || 0) >= 8) dailyBonus += 0.01

                if (dailyBonus > 0) {
                    const newHeight = (user.currentHeight || 0) + dailyBonus
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { currentHeight: parseFloat(newHeight.toFixed(3)) },
                    })
                    logger.info(
                        `User ${user.telegramId} grew +${dailyBonus}cm. New height: ${newHeight}`,
                    )
                }
            }
        } catch (error) {
            logger.error('Error in calculateDailyGrowth:', error)
        }
    }
}

export const growthService = new GrowthService()
