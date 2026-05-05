import { Telegram, Markup } from 'telegraf'
import { prisma } from '../db/prisma.js'

export class TrainingDeliveryService {
    async sendTrainingToUser(telegram: Telegram, telegramId: bigint) {
        const user = await prisma.user.findUnique({
            where: { telegramId },
        })

        if (!user || !user.onboardingCompleted || !user.paid) return

        const message =
            `☀️ <b>Доброе утро, ${user.firstName}!</b>\n\n` +
            `Твоя тренировка на <b>День ${user.programDay}</b> уже готова.\n` +
            `Сегодня тебя ждет новый набор упражнений для твоего роста.\n\n` +
            `🔥 Твой текущий стрик: <b>${user.trainingStreak} дн.</b>\n` +
            `Готов стать выше сегодня?`

        await telegram.sendMessage(Number(telegramId), message, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🏋️ Начать тренировку', 'main:training')],
            ]),
        })
    }
}

export const trainingDeliveryService = new TrainingDeliveryService()
