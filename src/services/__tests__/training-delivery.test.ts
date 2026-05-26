import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TrainingDeliveryService } from '../training-delivery.js'
import { prisma } from '../../db/prisma.js'

vi.mock('../../db/prisma.js', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}))

describe('TrainingDeliveryService', () => {
    let service: TrainingDeliveryService
    let mockTelegram: any

    beforeEach(() => {
        vi.clearAllMocks()
        service = new TrainingDeliveryService()
        mockTelegram = {
            sendMessage: vi.fn(),
        }
    })

    it('should not send training if user not found or not paid', async () => {
        ;(prisma.user.findUnique as any).mockResolvedValue(null)
        await service.sendTrainingToUser(mockTelegram, BigInt(123))
        expect(mockTelegram.sendMessage).not.toHaveBeenCalled()
        ;(prisma.user.findUnique as any).mockResolvedValue({
            paid: false,
            onboardingCompleted: true,
        })
        await service.sendTrainingToUser(mockTelegram, BigInt(123))
        expect(mockTelegram.sendMessage).not.toHaveBeenCalled()
    })

    it('should send welcome notification with start button', async () => {
        const mockUser = {
            id: 'u1',
            firstName: 'Ivan',
            telegramId: BigInt(123),
            onboardingCompleted: true,
            paid: true,
            programDay: 5,
            trainingStreak: 3,
        }

        ;(prisma.user.findUnique as any).mockResolvedValue(mockUser)

        await service.sendTrainingToUser(mockTelegram, BigInt(123))

        // Check Telegram call for welcome message
        expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
            123,
            expect.stringContaining('Доброе утро, Ivan!'),
            expect.objectContaining({
                parse_mode: 'HTML',
                reply_markup: expect.objectContaining({
                    inline_keyboard: expect.any(Array),
                }),
            }),
        )

        // Ensure it contains the button
        const callArgs = mockTelegram.sendMessage.mock.calls[0]
        const keyboard = callArgs[2].reply_markup.inline_keyboard
        expect(keyboard[0][0].text).toBe('🏋️ Начать тренировку')
        expect(keyboard[0][0].callback_data).toBe('main:training')
    })
})
