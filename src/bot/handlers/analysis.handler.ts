import { Markup, Input } from 'telegraf'
import { MyContext } from '../context.js'
import { prisma } from '../../db/prisma.js'
import { aiService } from '../../services/ai.js'
import { formatAnalysisForUser } from '../../utils/formatters.js'
import { UserProfile, AnalysisResponse } from '../../types/index.js'
import { i18n } from '../../services/i18n.js'
import { logger } from '../../utils/logger.js'
import { splitHtmlMessage } from '../../utils/telegram.js'
import { visualBoardService, HeightMetrics } from '../../services/visual-board.js'

export async function handleGetAnalysis(ctx: MyContext) {
    if (ctx.callbackQuery) {
        await ctx.answerCbQuery().catch(() => {})
    }

    if (ctx.session?.isGeneratingAnalysis) {
        await ctx.reply('⏳ Ваш анализ уже готовится. Пожалуйста, подождите немного...')
        return
    }

    const telegramId = BigInt(ctx.from?.id || 0)
    const lang = ctx.language || 'ru'
    const user = ctx.user

    if (!user || !user.onboardingCompleted) {
        return ctx.reply(i18n.t(lang, 'messages.need_onboarding'))
    }

    if (ctx.session) {
        ctx.session.isGeneratingAnalysis = true
    }

    // --- PROACTIVE BOOSTY MEMBERSHIP CHECK ---
    const boostyChannelId = process.env.BOOSTY_CHANNEL_ID;
    if (user && !user.paid && boostyChannelId) {
        try {
            const member = await ctx.telegram.getChatMember(boostyChannelId, Number(user.telegramId));
            if (['member', 'administrator', 'creator'].includes(member.status)) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { paid: true }
                });
                user.paid = true;
                logger.info(`Proactive Boosty check: Access granted to user ${user.telegramId}`);
            }
        } catch (error) {
            // Ignore if user not in channel or bot not admin
        }
    }

    try {
        // 1. Показываем лоадер и включаем статус "печатает"
        const loadingMessage = await ctx.reply(i18n.t(lang, 'messages.analysis_analyzing'))
        await ctx.replyWithChatAction('typing')

        // If analysis already exists, show it, otherwise call AI
        let analysis: AnalysisResponse
        let shouldGenerateImage = !user.analysisImageFileId

        if (user.analysisData) {
            analysis = user.analysisData as unknown as AnalysisResponse
        } else {
            try {
                // Вызываем сервис анализа
                analysis = await aiService.analyze(
                    user.onboardingData as unknown as UserProfile,
                    lang,
                )

                // Save to database and clear old image ID
                await prisma.user.update({
                    where: { telegramId },
                    data: {
                        analysisData: analysis as any,
                        analysisImageFileId: null, // Clear old image as it's outdated
                    },
                })
                shouldGenerateImage = true
            } catch (aiError) {
                logger.error('Mistral Analysis Error:', aiError)
                // Если ИИ упал, редактируем сообщение лоадера на ошибку
                return ctx.telegram.editMessageText(
                    ctx.chat!.id,
                    loadingMessage.message_id,
                    undefined,
                    i18n.t(lang, 'messages.analysis_error'),
                )
            }
        }

        const analysisMessages = formatAnalysisForUser(analysis, user.paid, lang, ctx.abConfig)

        // --- Visual Board Generation & Delivery ---
        let imageToCache: Buffer | string | null = null
        try {
            if (user.analysisImageFileId && !shouldGenerateImage) {
                imageToCache = user.analysisImageFileId
            } else {
                const onboarding = user.onboardingData as unknown as UserProfile
                const potentialBlock = analysis.structured_blocks.find(
                    (b) => b.id === 'potential_genetic_height',
                )
                const completionBlock = analysis.structured_blocks.find(
                    (b) => b.id === 'growth_completion_percent',
                )

                const extractNumber = (text?: string) => {
                    if (!text) return 0
                    const match = text.match(/(\d+(?:[.,]\d+)?)/)
                    return match ? parseFloat(match[1].replace(',', '.')) : 0
                }

                const potentialHeight = extractNumber(
                    potentialBlock?.value ||
                        potentialBlock?.instructions ||
                        potentialBlock?.content,
                )
                const currentHeight = user.currentHeight || onboarding.current_height_cm || 0

                // Calculate dynamic completion percentage based on current vs potential
                let dynamicCompletion = extractNumber(
                    completionBlock?.value ||
                        completionBlock?.instructions ||
                        completionBlock?.content,
                )
                if (potentialHeight > 0 && currentHeight > 0) {
                    // Use the higher value between AI estimate and actual physical ratio
                    const physicalRatio = (currentHeight / potentialHeight) * 100
                    dynamicCompletion = Math.max(dynamicCompletion, physicalRatio)
                }

                const metrics: HeightMetrics = {
                    currentHeight: currentHeight,
                    targetHeight: onboarding.dream_height_cm || 0,
                    potentialHeight: potentialHeight,
                    completionPercentage: dynamicCompletion,
                    isPaid: user.paid,
                    lang: lang,
                }

                if (metrics.potentialHeight === 0)
                    metrics.potentialHeight = metrics.currentHeight + 10
                if (metrics.completionPercentage === 0) metrics.completionPercentage = 75

                imageToCache = await visualBoardService.renderProgressBoard(metrics)
            }
        } catch (imgError) {
            logger.error('Error handling visual board:', imgError)
        }

        // Delete loading message to show results cleanly
        try {
            await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMessage.message_id)
        } catch (e) {
            // Ignore if already deleted
        }

        // Шаг 1: Находим "Твой потенциал роста" (Интро + заголовок первого блока)
        const analysisTitleText = i18n.t(lang, 'messages.analysis_title')
        const firstMsgIndex = analysisMessages.findIndex((m) => m.includes(analysisTitleText))
        let firstMsg = ''
        if (firstMsgIndex !== -1) {
            firstMsg = analysisMessages.splice(firstMsgIndex, 1)[0]
        }

        // В начале analysis.handler.ts убедитесь, что импортирована нужная функция
// import { splitHtmlMessage } from '../../utils/telegram.js'

        // ... код генерации board ...

        // Отправляем Visual Board
        if (imageToCache) {
            const photoInput =
                typeof imageToCache === 'string' ? imageToCache : Input.fromBuffer(imageToCache)
            let sentMsg

            try {
                // Безопасная обрезка для caption с использованием существующей утилиты
                const safeCaption = firstMsg.length > 1024 
                    ? splitHtmlMessage(firstMsg, 1024)[0] 
                    : firstMsg;

                sentMsg = await ctx.replyWithPhoto(photoInput, {
                    caption: safeCaption,
                    parse_mode: 'HTML',
                })
            } catch (err: any) {
                logger.error('Error sending visual board photo with caption:', err)
                // Если ошибка разметки все же произошла - шлем картинку раздельно
                await ctx.replyWithPhoto(photoInput)
                if (firstMsg) {
                    // Используем splitHtmlMessage для безопасной отправки текста чанками
                    const safeChunks = splitHtmlMessage(firstMsg, 4000);
                    for (const chunk of safeChunks) {
                         await ctx.reply(chunk, { parse_mode: 'HTML' })
                    }
                }
            }

            // Save file_id if it was a new generation
            if (typeof imageToCache !== 'string' && sentMsg?.photo) {
                const fileId = sentMsg.photo[sentMsg.photo.length - 1].file_id
                await prisma.user.update({
                    where: { telegramId },
                    data: { analysisImageFileId: fileId },
                })
            }
        } else if (firstMsg) {
            await ctx.reply(firstMsg, { parse_mode: 'HTML' })
        }

        // Шаг 2: Находим и извлекаем "Ваш потенциальный генетический рост"
        const geneticHeightIndex = analysisMessages.findIndex(
            (m) =>
                m.includes('Ваш потенциальный генетический рост') ||
                m.includes('Your potential genetic height'),
        )
        let geneticHeightMsg = ''
        if (geneticHeightIndex !== -1) {
            geneticHeightMsg = analysisMessages.splice(geneticHeightIndex, 1)[0]
        }

        // Отправляем блок с генетическим ростом отдельным сообщением (Шаг 2)
        if (geneticHeightMsg) {
            await ctx.reply(geneticHeightMsg, { parse_mode: 'HTML' })
        }

        // Шаг 3 & 4: Остальное (включая "Ваш рост завершился на X%") чанками по 3
        const CHUNK_SIZE = 3
        for (let i = 0; i < analysisMessages.length; i += CHUNK_SIZE) {
            const chunk = analysisMessages.slice(i, i + CHUNK_SIZE).join('\n\n')
            if (chunk.trim()) {
                await ctx.reply(chunk, { parse_mode: 'HTML' })
                await new Promise((resolve) => setTimeout(resolve, 300))
            }
        }

        // 3. Отправляем Upsell и тарифы (если не оплачено)
        if (!user.paid) {
            const upsellCaption =
                `🏔 Хватит копировать чужие общие советы по увеличению роста из интернета - они не адаптированы под тебя и поэтому <b>бесполезны</b>.\n\n` +
                `Бот Олимп уже провел <b>глубокий анализ</b> твоего профиля роста, изучил историю твоей семьи и точно <b>знает особенности твоего тела</b>.\n\n` +
                `🏋️ Помимо анализа роста из 12-и пунктов, в полной версии тебя также ждет <b>индивидуальная программа тренировок с умной прогрессией нагрузок</b>, разработанная Ботом специально под твой тип роста, которая заставит твой позвоночник вытягиваться.\n\n` +
                `🚀 Встроенные прямо в Бота трекеры массы тела, сна и воды создадут <b>идеальные условия для выброса гормона роста (СТГ)</b>.\n\n` +
                `⏳ <b>Хватит тратить свое драгоценное время</b>. С каждым днем бездействия <b>твои зоны роста закрываются все сильнее</b>, а шансы стать выше - просто тают.\n\n` +
                `Активируй свой <b>личный план Увеличения Роста</b>, выбрав тариф ниже:`

            await ctx.replyWithPhoto(
                { source: './assets/promo-thumb.jpg' },
                {
                    caption: upsellCaption,
                    parse_mode: 'HTML',
                },
            )
            await ctx.replyWithDocument({ source: './assets/promo.pdf' })

            // Import and call triggerInvoiceMenu or handle it here.
            // Since it's in index.ts, we'll implement a local version or buy command hint
            await ctx.reply(i18n.t(lang, 'messages.analysis_pre_upsell'), {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: `💳 ${i18n.t(lang, 'messages.tariff_1m')}`, callback_data: 'pay:1m' },
                            { text: `🔥 ${i18n.t(lang, 'messages.tariff_3m')}`, callback_data: 'pay:3m' }
                        ],
                        [
                            { text: `💎 ${i18n.t(lang, 'messages.tariff_6m')}`, callback_data: 'pay:6m' }
                        ]
                    ]
                }
            })
        }
    } catch (error) {
        logger.error('Error in handleGetAnalysis:', error)
        await ctx.reply(i18n.t(lang, 'messages.analysis_error'))
    } finally {
        if (ctx.session) {
            ctx.session.isGeneratingAnalysis = false
        }
    }
}
