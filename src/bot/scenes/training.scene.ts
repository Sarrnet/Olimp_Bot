import { Scenes, Markup, Input } from 'telegraf'
import fs from 'fs'
import { MyContext } from '../context.js'
import { prisma } from '../../db/prisma.js'
import { trainingGenerator } from '../../services/training.js'
import { growthService } from '../../services/growth.service.js'
import { getExerciseImagePath } from '../../utils/media-mapper.js'
import { logger } from '../../utils/logger.js'

import { i18n } from '../../services/i18n.js'

export const TRAINING_SCENE_ID = 'interactive-training'

const renderExercise = async (ctx: MyContext) => {
    const session = ctx.session.trainingSession
    if (!session) return

    const telegramId = BigInt(ctx.from?.id || 0)
    const user = await prisma.user.findUnique({ where: { telegramId } })
    const lang = user?.language || 'ru'

    const ex = session.exercises[session.currentExerciseIndex]
    const imagePath = getExerciseImagePath(ex.id)
    const progressLabel = lang === 'en' ? 'Exercise' : 'Упражнение'
    const ofLabel = lang === 'en' ? 'of' : 'из'
    const progress = `${progressLabel} ${session.currentExerciseIndex + 1} ${ofLabel} ${session.totalSteps}`

    const howToLabel = lang === 'en' ? 'How to do:' : 'Как делать:'
    const whyImportantLabel = lang === 'en' ? 'Why it is important:' : 'Зачем это нужно:'
    const secLabel = lang === 'en' ? 'sec' : 'сек'

    const caption =
        `<b>${progress}</b>\n\n` +
        `🔹 <b>${ex.name}</b>\n⏱ ${ex.duration} ${secLabel}\n\n` +
        `📝 <b>${howToLabel}</b>\n${ex.how_to}\n\n` +
        `💡 <b>${whyImportantLabel}</b>\n${ex.why_important}`

    const keyboard = Markup.inlineKeyboard([
        Markup.button.callback(
            session.currentExerciseIndex === session.totalSteps - 1
                ? lang === 'en'
                    ? '🏁 Finish training'
                    : '🏁 Завершить тренировку'
                : lang === 'en'
                  ? '✅ Done. Next'
                  : '✅ Готово. Далее',
            'training:next',
        ),
    ])
    // ...

    try {
        if (imagePath && fs.existsSync(imagePath)) {
            await ctx.replyWithPhoto(Input.fromLocalFile(imagePath), {
                caption,
                parse_mode: 'HTML',
                ...keyboard,
            })
        } else {
            await ctx.replyWithHTML(caption, keyboard)
        }
    } catch (error) {
        logger.error('Error rendering exercise in scene:', error)
        await ctx.replyWithHTML(caption, keyboard)
    }
}

export const trainingScene = new Scenes.BaseScene<MyContext>(TRAINING_SCENE_ID)

trainingScene.enter(async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0)
    const user = await prisma.user.findUnique({ where: { telegramId } })

    if (!user) return ctx.scene.leave()

    const plan = await trainingGenerator.getDailyPlan(
        user.id,
        user.programDay,
        user.language || 'ru',
    )
    const lang = user.language || 'ru'

    ctx.session.trainingSession = {
        currentExerciseIndex: 0,
        exercises: plan.exercises,
        totalSteps: plan.exercises.length,
    }

    await ctx.reply(
        i18n.t(lang, 'messages.training_started', {
            day: user.programDay,
            total: plan.exercises.length,
        }),
        { parse_mode: 'HTML' },
    )
    await renderExercise(ctx)
})

trainingScene.action('training:next', async (ctx) => {
    await ctx.answerCbQuery()
    const session = ctx.session.trainingSession
    if (!session) return ctx.scene.leave()

    if (session.currentExerciseIndex < session.totalSteps - 1) {
        session.currentExerciseIndex++
        await renderExercise(ctx)
    } else {
        // Finish Training
        const telegramId = BigInt(ctx.from?.id || 0)
        const user = await prisma.user.findUnique({ where: { telegramId } })

        if (user) {
            const lang = user.language || 'ru'
            const newStreak = calculateStreak(user.lastTrainingDate, user.trainingStreak)
            const addedExercises = session.exercises.length

            // Check for new Freeze Skip reward (every 7 days streak)
            let freezeReward = 0
            if (newStreak > user.trainingStreak && newStreak % 7 === 0) {
                freezeReward = 1
            }

            const updatedUser = await prisma.user.update({
                where: { telegramId },
                data: {
                    programDay: user.programDay < 28 ? user.programDay + 1 : 1,
                    lastTrainingDate: new Date(),
                    trainingStreak: newStreak,
                    maxStreak: Math.max(user.maxStreak, newStreak),
                    totalExercises: { increment: addedExercises },
                    freezeCount: { increment: freezeReward },
                },
            })

            await prisma.trainingSession.create({
                data: {
                    userId: user.id,
                    exercises: session.exercises.map((e) => e.id),
                    completed: true,
                },
            })

            // Apply instant growth bonus
            await growthService.applyInstantBonus(user.id, 'exercise')

            let finishMsg = i18n.t(lang, 'messages.training_finished', {
                streak: updatedUser.trainingStreak,
                total: updatedUser.totalExercises,
            })

            if (freezeReward > 0) {
                finishMsg += i18n.t(lang, 'messages.freeze_reward')
            }

            await ctx.replyWithHTML(finishMsg)
        }

        delete ctx.session.trainingSession
        return ctx.scene.leave()
    }
})

function calculateStreak(lastDate: Date | null, currentStreak: number): number {
    if (!lastDate) return 1
    const now = new Date()
    const diff = now.getTime() - lastDate.getTime()
    const diffDays = diff / (1000 * 3600 * 24)

    // If same day, don't increment
    if (diffDays < 1 && now.getDate() === lastDate.getDate()) {
        return currentStreak
    }

    if (diffDays < 2) {
        return currentStreak + 1
    } else {
        return 1
    }
}
