import { describe, it, expect, vi, beforeEach } from 'vitest'
import { abService } from '../ab.service.js'
import { prisma } from '../../db/prisma.js'

vi.mock('../../db/prisma.js', () => ({
    prisma: {
        abConfig: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            updateMany: vi.fn(),
            upsert: vi.fn(),
        },
    },
}))

describe('AbService', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('getPrice', () => {
        it('should return the price from config if group exists', async () => {
            ;(prisma.abConfig.findUnique as any).mockResolvedValue({ name: 'A', price: 1200 })
            const price = await abService.getPrice('A')
            expect(price).toBe(1200)
        })

        it('should return 699 if group does not exist', async () => {
            ;(prisma.abConfig.findUnique as any).mockResolvedValue(null)
            const price = await abService.getPrice('UNKNOWN')
            expect(price).toBe(699)
        })

        it('should return 699 on DB error', async () => {
            ;(prisma.abConfig.findUnique as any).mockRejectedValue(new Error('DB Down'))
            const price = await abService.getPrice('A')
            expect(price).toBe(699)
        })
    })

    describe('getRandomActiveGroup', () => {
        it('should return a random group from active ones', async () => {
            const mockGroups = [
                { name: 'G1', isActive: true },
                { name: 'G2', isActive: true },
            ]
            ;(prisma.abConfig.findMany as any).mockResolvedValue(mockGroups)

            const group = await abService.getRandomActiveGroup()
            expect(['G1', 'G2']).toContain(group)
        })

        it('should return the default group if no groups are active', async () => {
            ;(prisma.abConfig.findMany as any).mockResolvedValue([])
            ;(prisma.abConfig.findFirst as any).mockResolvedValue({ name: 'DEFAULT_GROUP' })

            const group = await abService.getRandomActiveGroup()
            expect(group).toBe('DEFAULT_GROUP')
        })

        it('should return "A" as a final fallback', async () => {
            ;(prisma.abConfig.findMany as any).mockResolvedValue([])
            ;(prisma.abConfig.findFirst as any).mockResolvedValue(null)

            const group = await abService.getRandomActiveGroup()
            expect(group).toBe('A')
        })
    })

    describe('updateGroup', () => {
        it('should unset other default groups if setting a new default', async () => {
            await abService.updateGroup('NEW_DEFAULT', { isDefault: true })
            expect(prisma.abConfig.updateMany).toHaveBeenCalledWith({
                where: { isDefault: true },
                data: { isDefault: false },
            })
            expect(prisma.abConfig.upsert).toHaveBeenCalled()
        })
    })
})
