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

        const formattedMessage = formatAnalysisForUser(analysis, user.paid, lang, ctx.abConfig)

        // Telegram caption limit is 1024, regular message limit is 4096.
        // We split into chunks safely handling HTML tags.
        // We use a conservative 1000 chars limit for all chunks to be safe and consistent.
        const chunks = splitHtmlMessage(formattedMessage, 1000)

        // --- Visual Board Generation & Delivery ---
        let imageToCache: Buffer | string | null = null
        try {
            if (user.analysisImageFileId && !shouldGenerateImage) {
                imageToCache = user.analysisImageFileId
            } else {
                const onboarding = user.onboardingData as unknown as UserProfile
                const potentialBlock = analysis.structured_blocks.find(b => b.id === 'potential_genetic_height')
                const completionBlock = analysis.structured_blocks.find(b => b.id === 'growth_completion_percent')

                const extractNumber = (text?: string) => {
                    if (!text) return 0
                    const match = text.match(/(\d+(?:[.,]\d+)?)/)
                    return match ? parseFloat(match[1].replace(',', '.')) : 0
                }

                const potentialHeight = extractNumber(potentialBlock?.value || potentialBlock?.instructions || potentialBlock?.content)
                const currentHeight = user.currentHeight || onboarding.current_height_cm || 0

                // Calculate dynamic completion percentage based on current vs potential
                let dynamicCompletion = extractNumber(completionBlock?.value || completionBlock?.instructions || completionBlock?.content)
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
                    lang: lang
                }

                if (metrics.potentialHeight === 0) metrics.potentialHeight = metrics.currentHeight + 10
                if (metrics.completionPercentage === 0) metrics.completionPercentage = 75

                imageToCache = await visualBoardService.renderProgressBoard(metrics)
            }
        } catch (imgError) {
            logger.error('Error handling visual board:', imgError)
        }

        const keyboard = []
        if (!user.paid) {
            const config = ctx.abConfig || { price: 699, oldPrice: 899, price3: 1799, oldPrice3: 2697, price6: 2999, oldPrice6: 5394 }
            const calc = (old: number, cur: number) => Math.round(((old - cur) / old) * 100)

            keyboard.push([
                Markup.button.callback(`💳 1 мес — ${config.price}₽ (-${calc(config.oldPrice, config.price)}%)`, 'pay:1m'),
            ])
            keyboard.push([
                Markup.button.callback(`🔥 3 мес — ${config.price3}₽ (-${calc(config.oldPrice3, config.price3)}%)`, 'pay:3m'),
            ])
            keyboard.push([
                Markup.button.callback(`💎 6 мес — ${config.price6}₽ (-${calc(config.oldPrice6, config.price6)}%)`, 'pay:6m'),
            ])
        }

        // Delete loading message to show results cleanly
        try {
            await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMessage.message_id)
        } catch (e) {
            // Ignore if already deleted
        }

        if (imageToCache) {
            const photoInput = typeof imageToCache === 'string' ? imageToCache : Input.fromBuffer(imageToCache)
            let sentMsg;

            try {
              sentMsg = await ctx.replyWithPhoto(photoInput, {
                  caption: chunks[0],
                  parse_mode: 'HTML',
                  ...(chunks.length === 1 ? Markup.inlineKeyboard(keyboard) : {})
              })
            } catch (err: any) {
              if (err.description && err.description.includes("can't parse entities")) {
                logger.warn(`HTML Parse Error in photo caption. Fallback to plain text.`)
                sentMsg = await ctx.replyWithPhoto(photoInput, {
                  caption: chunks[0],
                  ...(chunks.length === 1 ? Markup.inlineKeyboard(keyboard) : {})
                })
              } else {
                throw err;
              }
            }

            // Save file_id if it was a new generation
            if (typeof imageToCache !== 'string') {
                const fileId = sentMsg.photo[sentMsg.photo.length - 1].file_id
                await prisma.user.update({
                    where: { telegramId },
                    data: { analysisImageFileId: fileId }
                })
            }
        } else {
            // Fallback if image failed
          try {
              await ctx.replyWithHTML(chunks[0], chunks.length === 1 ? Markup.inlineKeyboard(keyboard) : undefined)
            } catch (err: any) {
              if (err.description && err.description.includes("can't parse entities")) {
                await ctx.reply(chunks[0], chunks.length === 1 ? Markup.inlineKeyboard(keyboard) : undefined)
              } else {
                throw err;
              }
            }
        }

        // Send remaining chunks
        for (let i = 1; i < chunks.length; i++) {
            const isLast = i === chunks.length - 1
            await new Promise((resolve) => setTimeout(resolve, 200))

          try {
            await ctx.replyWithHTML(
              chunks[i],
              isLast ? Markup.inlineKeyboard(keyboard) : undefined,
            )
          } catch (err: any) {
            if (err.description && err.description.includes("can't parse entities")) {
              await ctx.reply(chunks[i], isLast ? Markup.inlineKeyboard(keyboard) : undefined)
            } else {
              throw err;
            }
          }
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
