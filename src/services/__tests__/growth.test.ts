import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../db/prisma.js'
import { GrowthService } from '../growth.service.js'

// Mock prisma
vi.mock('../../db/prisma.js', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}))

describe('GrowthService Instant Bonus', () => {
    let growthService: GrowthService

    beforeEach(() => {
        vi.clearAllMocks()
        growthService = new GrowthService()
    })

    it('should apply bonus for a category if not already applied today', async () => {
        const mockUser = {
            id: 'user-1',
            telegramId: BigInt(123),
            currentHeight: 170,
            growthApplied: {},
            onboardingData: { current_height_cm: 170 }
        }

        ;(prisma.user.findUnique as any).mockResolvedValue(mockUser)

        const result = await growthService.applyInstantBonus('user-1', 'water')

        expect(result).toBe(true)
        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: 'user-1' },
            data: {
                currentHeight: 170.01,
                growthApplied: {
                    [new Date().toISOString().split('T')[0]]: { water: true }
                },
                analysisImageFileId: null
            }
        })
    })

    it('should NOT apply bonus twice for the same category on the same day', async () => {
        const today = new Date().toISOString().split('T')[0]
        const mockUser = {
            id: 'user-1',
            telegramId: BigInt(123),
            currentHeight: 170.01,
            growthApplied: {
                [today]: { water: true }
            }
        }

        ;(prisma.user.findUnique as any).mockResolvedValue(mockUser)

        const result = await growthService.applyInstantBonus('user-1', 'water')

        expect(result).toBe(false)
        expect(prisma.user.update).not.toHaveBeenCalled()
    })

    it('should apply different bonuses on the same day', async () => {
        const today = new Date().toISOString().split('T')[0]
        const mockUser = {
            id: 'user-1',
            telegramId: BigInt(123),
            currentHeight: 170.01,
            growthApplied: {
                [today]: { water: true }
            }
        }

        ;(prisma.user.findUnique as any).mockResolvedValue(mockUser)

        const result = await growthService.applyInstantBonus('user-1', 'exercise')

        expect(result).toBe(true)
        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: 'user-1' },
            data: {
                currentHeight: 170.02,
                growthApplied: {
                    [today]: { water: true, exercise: true }
                },
                analysisImageFileId: null
            }
        })
    })
})
