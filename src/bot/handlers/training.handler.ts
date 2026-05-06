import { MyContext } from '../context.js'
import { prisma } from '../../db/prisma.js'
import { TRAINING_SCENE_ID } from '../scenes/training.scene.js'
import { i18n } from '../../services/i18n.js'

export async function handleStartTraining(ctx: MyContext) {
    const telegramId = BigInt(ctx.from?.id || 0)

    try {
        const user = await prisma.user.findUnique({
            where: { telegramId },
        })
        const lang = user?.language || 'ru'

        if (!user || !user.onboardingCompleted) {
            return ctx.reply(i18n.t(lang, 'messages.need_onboarding'))
        }

        if (!user.paid) {
            return ctx.reply(i18n.t(lang, 'messages.need_payment'))
        }

        // Check if user already trained today
        if (user.lastTrainingDate) {
            const today = new Date()
            const lastDate = new Date(user.lastTrainingDate)

            if (
                today.getDate() === lastDate.getDate() &&
                today.getMonth() === lastDate.getMonth() &&
                today.getFullYear() === lastDate.getFullYear()
            ) {
                return ctx.reply(i18n.t(lang, 'messages.already_trained_today'))
            }
        }

        await ctx.scene.enter(TRAINING_SCENE_ID)
    } catch (error) {
        console.error('Error in handleStartTraining:', error)
        const lang = ctx.language || 'ru'
        await ctx.reply(i18n.t(lang, 'messages.training_start_error'))
    }
}
