import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../context.js'
import { getOnboardingSteps, OnboardingStep, loadOnboardingData } from '../../utils/onboarding-parser.js'
import { validators } from '../../utils/validators.js'
import { prisma } from '../../db/prisma.js'
import { getMainKeyboard } from '../keyboards/main.keyboard.js'
import { i18n } from '../../services/i18n.js'

export const ONBOARDING_SCENE_ID = 'onboarding-wizard'

// Helper to render a step
const renderStep = async (ctx: MyContext, step: OnboardingStep, stepIndex: number) => {
    const options = { parse_mode: 'HTML' as const }
    if (step.type === 'input') {
        await ctx.reply(step.question || '', options)
    } else if (step.type === 'choice' || step.type === 'choice_with_custom') {
        const buttons = (step.options || []).map((opt, optIdx) => [
            Markup.button.callback(opt, `choice:${stepIndex}:${optIdx}`),
        ])
        await ctx.reply(step.question || '', {
            ...options,
            ...Markup.inlineKeyboard(buttons),
        })
    } else if (step.type === 'cta') {
        await ctx.reply(step.content || '', {
            ...options,
            ...Markup.inlineKeyboard([
                [Markup.button.callback(step.button_text || 'Start', 'cta:finish')],
            ]),
        })
    }
}

// Handle incoming message for a step
const handleAnswer = async (ctx: MyContext, step: OnboardingStep, lang: string) => {
    let value: string | number | undefined

  if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
    await ctx.answerCbQuery().catch(() => {})

    const data = ctx.callbackQuery.data
        if (data.startsWith('choice:')) {
            // choice:stepIdx:optIdx
            const [, , optIdxStr] = data.split(':')
            const optIdx = parseInt(optIdxStr, 10)
            value = step.options ? step.options[optIdx] : undefined

            if (value) {
                // 1. Убираем кнопки у текущего сообщения
                await ctx.editMessageReplyMarkup(undefined).catch(() => {})

                // 2. Дублируем ответ в чат для "эффекта диалога"
                await ctx.reply(`⛰️ <b>${value}</b>`, { parse_mode: 'HTML' })
            }

            const customLabel = lang === 'en' ? 'Custom option' : 'Свой вариант'
            if (value === customLabel && step.type === 'choice_with_custom') {
                await ctx.reply(i18n.t(lang, 'validation.invalid_text'))
                return false // Stay on same step to wait for text input
            }
        } else if (data === 'cta:finish') {
            // Убираем кнопку CTA после нажатия
            await ctx.editMessageReplyMarkup(undefined).catch(() => {})
            return true // Finished
        }
    } else if (ctx.message && 'text' in ctx.message) {
        const text = ctx.message.text
        if (text === '/cancel') {
            await ctx.reply(
                i18n.t(lang, 'messages.onboarding_cancelled'),
                Markup.removeKeyboard(),
            )
            await ctx.scene.leave()
            return false
        }

        const validation = validators.validate(step.id, text, step.input_type, lang)
        if (!validation.isValid) {
            await ctx.reply(`⛰️ ${validation.errorMessage || i18n.t(lang, 'messages.invalid_input')}`)
            return false
        }

        value = step.input_type === 'number' ? parseInt(text, 10) : text
    }

    if (value !== undefined) {
        if (!ctx.scene.session.answers) ctx.scene.session.answers = {}
        ctx.scene.session.answers[step.id] = value
        return true // Success
    }

    return false // No valid answer
}

const createStepHandler = (index: number) => {
    return async (ctx: MyContext) => {
        const lang = ctx.language || 'ru'
        // Use the new onboarding file
        const onboardingData = await loadOnboardingData(lang);
        const steps = onboardingData.steps;

        // If it's the very first entry
        if (index === 0) {
            ctx.scene.session.answers = {}
            await renderStep(ctx, steps[0], 0)
            return ctx.wizard.next()
        }

        if (index > steps.length) return ctx.scene.leave()

        const prevStep = steps[index - 1]
        const success = await handleAnswer(ctx, prevStep, lang)

        if (success) {
            if (index < steps.length) {
                await renderStep(ctx, steps[index], index)
                return ctx.wizard.next()
            } else {
                // Calculate BMI and save initial height
                const answers = ctx.scene.session.answers as any;
                const weight = parseFloat(answers.weight_kg);
                const height = parseFloat(answers.current_height_cm);
                let bmi = null;
                if (weight && height) {
                    bmi = parseFloat((weight / ((height / 100) ** 2)).toFixed(2));
                }

                // Finalize if this was the last step
                await prisma.user.update({
                    where: { telegramId: BigInt(ctx.from!.id) },
                    data: {
                        onboardingCompleted: true,
                        onboardingData: answers,
                        currentHeight: height || null,
                        initialBmi: bmi,
                    },
                })
                await ctx.reply(
                    `🏔️ ${i18n.t(lang, 'messages.onboarding_finished')}\n\n${i18n.t(lang, 'messages.onboarding_analysis_hint')}`,
                    { parse_mode: 'HTML', ...getMainKeyboard(lang) },
                )
                return ctx.scene.leave()
            }
        }
    }
}

// Increased handler count for 34 questions + buffer
const handlers = Array.from({ length: 60 }, (_, i) => createStepHandler(i))

export const onboardingScene = new Scenes.WizardScene<MyContext>(
    ONBOARDING_SCENE_ID,
    ...handlers,
)
