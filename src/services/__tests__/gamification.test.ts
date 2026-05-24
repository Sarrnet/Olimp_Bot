import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../db/prisma.js'

// Mock prisma
vi.mock('../../db/prisma.js', () => ({
    prisma: {
        user: {
            findMany: vi.fn(),
            update: vi.fn(),
        },
    },
}))

import { SchedulerService } from '../scheduler.js'

describe('Gamification Logic', () => {
    let scheduler: SchedulerService

    beforeEach(() => {
        vi.clearAllMocks()
        scheduler = new SchedulerService()
    })

    describe('handleStreakResets', () => {
        it('should reset streak if user missed more than 1 day and has no freezes', async () => {
            const yesterday = new Date()
            yesterday.setDate(yesterday.getDate() - 1)
            yesterday.setHours(0, 0, 0, 0)

            const dayBeforeYesterday = new Date(yesterday)
            dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 1)

            const mockUser = {
                id: '1',
                telegramId: BigInt(123),
                lastTrainingDate: dayBeforeYesterday,
                freezeCount: 0,
                trainingStreak: 5,
            }

            ;(prisma.user.findMany as any).mockResolvedValue([mockUser])

            await scheduler.handleStreakResets()

            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: '1' },
                data: { trainingStreak: 0 },
            })
        })

        it('should use freeze skip if available', async () => {
            const yesterday = new Date()
            yesterday.setDate(yesterday.getDate() - 1)
            yesterday.setHours(0, 0, 0, 0)

            const dayBeforeYesterday = new Date(yesterday)
            dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 1)

            const mockUser = {
                id: '1',
                telegramId: BigInt(123),
                lastTrainingDate: dayBeforeYesterday,
                freezeCount: 2,
                trainingStreak: 5,
            }

            ;(prisma.user.findMany as any).mockResolvedValue([mockUser])

            await scheduler.handleStreakResets()

            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: '1' },
                data: {
                    freezeCount: { decrement: 1 },
                    lastTrainingDate: expect.any(Date),
                },
            })
        })

        it('should NOT reset streak if user trained yesterday', async () => {
            const yesterday = new Date()
            yesterday.setDate(yesterday.getDate() - 1)
            yesterday.setHours(12, 0, 0, 0) // Trained mid-day yesterday

            const mockUser = {
                id: '1',
                telegramId: BigInt(123),
                lastTrainingDate: yesterday,
                freezeCount: 0,
                trainingStreak: 5,
            }

            ;(prisma.user.findMany as any).mockResolvedValue([mockUser])

            await scheduler.handleStreakResets()

            expect(prisma.user.update).not.toHaveBeenCalled()
        })
    })
})
