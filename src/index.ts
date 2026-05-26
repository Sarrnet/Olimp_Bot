import 'dotenv/config'
import { Telegraf, Scenes, session, Input, Markup } from 'telegraf'
import ratelimit from 'telegraf-ratelimit'
import { MyContext } from './bot/context.js'
import { prisma } from './db/prisma.js'
import { onboardingScene } from './bot/scenes/onboarding.scene.js'
import { trainingScene } from './bot/scenes/training.scene.js'
import { getMainKeyboard } from './bot/keyboards/main.keyboard.js'
import { adminKeyboard } from './bot/keyboards/admin.keyboard.js'
import { handleGetAnalysis } from './bot/handlers/analysis.handler.js'
import { handleStartTraining } from './bot/handlers/training.handler.js'

import { sendInvoice } from './services/payments.js'
import { schedulerService } from './services/scheduler.js'
import { logger } from './utils/logger.js'
import { formatTariffs } from './utils/formatters.js'
import { setupQueues } from './services/queue.js'
import { redisSession } from './bot/middlewares/redis-session.js'
import { userLoader } from './bot/middlewares/user-loader.js'
import { i18n } from './services/i18n.js'
import { abService } from './services/ab.service.js'
import { currencyService } from './services/currency.js'
import { PAYMENT_PROVIDERS } from './config/payments.config.js'
import { setupDefaultCommands, setupUserCommands } from './bot/commands.js'
import { growthService } from './services/growth.service.js'
import cron from 'node-cron'
import express from 'express'
import { handleCryptoPayWebhook } from './bot/handlers/cryptopay.handler.js'
import { cryptoPayService } from './services/cryptopay.js'

import {
    handleAdminStats,
    handleAdminBroadcast,
    handleAdminExportUser,
    handleAdminGrant,
    handleAdminABStats,
    handleAdminABList,
    handleAdminABEdit,
    handleAdminABToggle,
    handleAdminABSetDefault,
    handleAdminABDelete,
    handleAdminABPriceSelect,
    handleAdminABAskParam,
    handleAdminABAskNewGroup,
    handleAdminMessage,
    isAdmin,
} from './bot/handlers/admin.handler.js'

import {
    handleWater,
    handleSleep,
    handleWeight,
    processHealthInput,
} from './bot/handlers/health.handler.js'

const token = process.env.TELEGRAM_TOKEN

if (!token) {
    throw new Error('TELEGRAM_TOKEN is not defined in .env')
}

const bot = new Telegraf<MyContext>(token)

// Express setup for webhooks
const app = express()

// Middleware to capture rawBody for CryptoPay signature verification
app.use('/webhooks/cryptopay', express.raw({ type: 'application/json' }), (req: any, res, next) => {
    req.rawBody = req.body
    try {
        req.body = JSON.parse(req.body.toString())
    } catch (e) {
        // Fallback for invalid JSON
    }
    next()
})

app.post('/webhooks/cryptopay', (req, res) => handleCryptoPayWebhook(req, res, bot))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    logger.info(`Express server running on port ${PORT}`)
})

// Anti-DDoS / Rate Limiting (1 message per sec per user)
const limitConfig = {
    window: 1000,
    limit: 5,
    keyGenerator: (ctx: MyContext) => ctx.from?.id.toString() || 'unknown',
    onLimitExceeded: (ctx: MyContext) => {
        logger.warn(`Rate limit exceeded for user ${ctx.from?.id || 'unknown'}`)
    },
}

bot.use(ratelimit(limitConfig))

// Create the stage
const stage = new Scenes.Stage<MyContext>([onboardingScene, trainingScene])

// Middlewares
bot.use(redisSession())
bot.use(userLoader())
bot.use(stage.middleware())

// Initialize Scheduler and Workers
schedulerService.init()
setupQueues(bot.telegram)

async function askLanguage(ctx: MyContext, lang: string = 'ru') {
    await ctx.reply(
        i18n.t(lang, 'messages.select_language'),
        Markup.inlineKeyboard([
            [
                Markup.button.callback(i18n.t('ru', 'buttons.select_ru'), 'lang:ru'),
                Markup.button.callback(i18n.t('en', 'buttons.select_en'), 'lang:en'),
            ],
        ]),
    )
}

// Commands
bot.start(async (ctx) => {
    const user = ctx.user!
    const first_name = ctx.from?.first_name || ''

    try {
        // Explicitly set commands on /start
        await setupUserCommands(ctx.telegram, ctx.from!.id, ctx.role === 'ADMIN')

        if (!user.language) {
            return askLanguage(ctx, 'ru')
        }

        const lang = (user.language as 'ru' | 'en') || 'ru'
        if (user.onboardingCompleted) {
            const keyboard = isAdmin(ctx) ? adminKeyboard : getMainKeyboard(lang)
            await ctx.reply(i18n.t(lang, 'messages.welcome_back', { name: first_name }), keyboard)
        } else {
            await askLanguage(ctx, lang)
        }
    } catch (error) {
        logger.error('Error in /start:', error)
        await ctx.reply('Извините, произошла ошибка. Попробуйте /start еще раз.')
    }
})

bot.command('language', (ctx) => askLanguage(ctx, ctx.language || 'ru'))

bot.action(/lang:(ru|en)/, async (ctx) => {
    const lang = ctx.match[1] as 'ru' | 'en'
    const telegramId = BigInt(ctx.from?.id || 0)

    try {
        await ctx.answerCbQuery().catch(() => {})

        const user = await prisma.user.update({
            where: { telegramId },
            data: { language: lang },
        })

        // Update commands when language changes
        await setupUserCommands(ctx.telegram, ctx.from!.id, user.role === 'ADMIN')

        ctx.language = lang
        const first_name = ctx.from?.first_name || ''

        if (user.onboardingCompleted) {
            const keyboard = isAdmin(ctx) ? adminKeyboard : getMainKeyboard(lang)
            await ctx.reply(i18n.t(lang, 'messages.welcome_back', { name: first_name }), keyboard)
        } else {
            await ctx.reply(i18n.t(lang, 'messages.start_onboarding', { name: first_name }))
            await ctx.scene.enter(onboardingScene.id)
        }
    } catch (error) {
        logger.error('Error in lang action:', error)
        await ctx.reply('Error saving language.')
    }
})

bot.command('menu', async (ctx) => {
    const lang = ctx.language || 'ru'
    const keyboard = isAdmin(ctx) ? adminKeyboard : getMainKeyboard(lang)
    await ctx.reply(i18n.t(lang, 'buttons.back_to_menu'), keyboard)
})

async function triggerInvoiceMenu(ctx: MyContext, days: number = 30) {
    const config = ctx.abConfig || {
        price: 699,
        price3: 1799,
        price6: 2999,
        priceCrypto: 10,
        price3Crypto: 25,
        price6Crypto: 40,
        priceStars: 350,
        price3Stars: 900,
        price6Stars: 1500,
    }
    const lang = ctx.language || 'ru'
    let priceRUB = config.price

    if (days === 90) {
        priceRUB = config.price3
    } else if (days === 180) {
        priceRUB = config.price6
    }

    const buttons = []

    // 1. Crypto Pay
    const cryptoProvider = PAYMENT_PROVIDERS['crypto_pay']
    if (cryptoProvider && cryptoProvider.token) {
        buttons.push([
            {
                text: cryptoProvider.label,
                callback_data: `pay:provider:crypto_pay:${days}`,
                icon_custom_emoji_id: '6145689384113934206',
            } as any,
        ])
    }

    // 2. Manual Payment
    buttons.push([
        Markup.button.callback(`${i18n.t(lang, 'buttons.manual_payment')}`, `pay:manual:${days}`),
    ])

    // 3. Telegram Stars
    const starsProvider = PAYMENT_PROVIDERS['telegram_stars']
    if (starsProvider) {
        buttons.push([
            Markup.button.callback(
                `⭐️ ${starsProvider.label}`,
                `pay:provider:telegram_stars:${days}`,
            ),
        ])
    }

    // 4. Other Providers (Sequential)
    const otherProviders = Object.values(PAYMENT_PROVIDERS).filter(
        (p) =>
            p.id !== 'telegram_stars' && p.id !== 'crypto_pay' && p.id !== 'tribute' && !!p.token,
    )

    for (const p of otherProviders) {
        const amount = await currencyService.convertFromRUB(priceRUB, p.currency)
        const label = `${p.flag} ${p.label} (${amount} ${p.currency})`
        buttons.push([Markup.button.callback(label, `pay:provider:${p.id}:${days}`)])
    }

    if (buttons.length === 0) {
        return ctx.reply('Извините, на данный момент нет доступных способов оплаты.')
    }

    const title =
        days === 180
            ? i18n.t(lang, 'messages.tariff_6m')
            : days === 90
              ? i18n.t(lang, 'messages.tariff_3m')
              : i18n.t(lang, 'messages.tariff_1m')

    await ctx.reply(i18n.t(lang, 'messages.payment_choice_title', { title }), {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons),
    })
}

bot.action(/^pay:manual:(\d+)$/, async (ctx) => {
    const lang = ctx.language || 'ru'
    const manager = process.env.MANUAL_PAYMENT_MANAGER || '@username'
    await ctx.answerCbQuery()
    await ctx.replyWithHTML(i18n.t(lang, 'messages.manual_payment_info', { manager }))
})

bot.command('buy', (ctx) => {
    const lang = ctx.language || 'ru'
    const config = ctx.abConfig || {
        price: 699,
        price3: 1799,
        price6: 2999,
        oldPrice: 899,
        oldPrice3: 2697,
        oldPrice6: 5394,
    }
    return ctx.reply(formatTariffs(config, lang), {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [
                {
                    ...Markup.button.callback(`💳 ${i18n.t(lang, 'messages.tariff_1m')}`, 'pay:1m'),
                    style: 'success',
                } as any,
                {
                    ...Markup.button.callback(`🔥 ${i18n.t(lang, 'messages.tariff_3m')}`, 'pay:3m'),
                    style: 'success',
                } as any,
            ],
            [
                {
                    ...Markup.button.callback(`💎 ${i18n.t(lang, 'messages.tariff_6m')}`, 'pay:6m'),
                    style: 'success',
                } as any,
            ],
        ]),
    })
})

bot.action('pay:1m', async (ctx) => {
    await ctx.answerCbQuery()
    await triggerInvoiceMenu(ctx, 30)
})

bot.action('pay:3m', async (ctx) => {
    await ctx.answerCbQuery()
    await triggerInvoiceMenu(ctx, 90)
})

bot.action('pay:6m', async (ctx) => {
    await ctx.answerCbQuery()
    await triggerInvoiceMenu(ctx, 180)
})

bot.action(/^pay:provider:(.+):(\d+)$/, async (ctx) => {
    const providerId = ctx.match[1]
    const days = parseInt(ctx.match[2])
    const provider = PAYMENT_PROVIDERS[providerId]
    const config = ctx.abConfig || {
        price: 699,
        price3: 1799,
        price6: 2999,
        priceCrypto: 10,
        price3Crypto: 25,
        price6Crypto: 40,
        priceStars: 350,
        price3Stars: 900,
        price6Stars: 1500,
    }
    let priceRUB = config.price
    if (days === 90) priceRUB = config.price3
    else if (days === 180) priceRUB = config.price6

    await ctx.answerCbQuery(`Генерируем счет...`)

    try {
        if (providerId === 'crypto_pay') {
            let amountUSDT = config.priceCrypto
            if (days === 90) amountUSDT = config.price3Crypto
            else if (days === 180) amountUSDT = config.price6Crypto

            const invoice = await cryptoPayService.createInvoice({
                userId: ctx.user!.id,
                amount: amountUSDT.toString(),
                currency: 'USDT',
                days: days,
            })
            return ctx.reply(i18n.t(ctx.language || 'ru', 'messages.crypto_pay_invoice'), {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: 'Pay with Crypto',
                                url: invoice.bot_invoice_url,
                                style: 'success',
                            } as any,
                        ],
                    ],
                },
            })
        }

        let minorUnits = 0
        if (providerId === 'telegram_stars') {
            const starsPrice =
                days === 180
                    ? config.price6Stars
                    : days === 90
                      ? config.price3Stars
                      : config.priceStars
            minorUnits = starsPrice
        } else {
            const amountConverted = await currencyService.convertFromRUB(
                priceRUB,
                provider.currency,
            )
            minorUnits = Math.round(amountConverted * 100)
        }

        await sendInvoice(
            ctx,
            {
                title: `Subscription: ${days} days`,
                description: 'Full access to growth analysis and training.',
                amount: minorUnits,
                currency: provider.currency,
                days: days,
            },
            providerId,
        )
    } catch (error) {
        logger.error('Error in pay:provider action:', error)
        await ctx.reply('Извините, произошла ошибка при создании счета.')
    }
})

async function handleProfile(ctx: MyContext) {
    const lang = ctx.language || 'ru'
    const user = ctx.user
    if (!user) return

    try {
        const sessionsCount = await prisma.trainingSession.count({
            where: { userId: user.id, completed: true },
        })

        const today = new Date().toISOString().split('T')[0]
        const water = (user.waterLogs as any)?.[today] || 0
        const sleep = (user.sleepLogs as any)?.[today] || 0
        const weightLogs = (user.weightLogs as any) || {}
        const lastWeight =
            Object.values(weightLogs).pop() || (user.onboardingData as any)?.weight_kg || '-'

        const profileMsg = i18n.t(lang, 'messages.profile_stats', {
            currentHeight:
                user.currentHeight || (user.onboardingData as any)?.current_height_cm || '-',
            weight: lastWeight,
            bmi: user.initialBmi || '-',
            streak: user.trainingStreak,
            maxStreak: user.maxStreak,
            totalExercises: user.totalExercises,
            sessionsCount: sessionsCount,
            programDay: user.programDay,
            water: water,
            sleep: sleep,
            freezeCount: user.freezeCount,
        })

        await ctx.reply(profileMsg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback(i18n.t(lang, 'buttons.export_data'), 'profile:export')],
            ]),
        })
    } catch (error) {
        logger.error('Error in handleProfile:', error)
        await ctx.reply('Ошибка при получении профиля.')
    }
}

async function handleExport(ctx: MyContext) {
    const lang = ctx.language || 'ru'
    const user = ctx.user
    if (!user) return

    try {
        const userFriendlyData = {
            profile: {
                firstName: user.firstName,
                username: user.username,
                registrationDate: user.createdAt,
                stats: {
                    streak: user.trainingStreak,
                    maxStreak: user.maxStreak,
                    totalExercises: user.totalExercises,
                    freezeCount: user.freezeCount,
                },
            },
            onboarding: user.onboardingData,
            analysis: user.paid ? user.analysisData : i18n.t(lang, 'messages.need_payment'),
            progress: {
                currentProgramDay: user.programDay,
                totalCompletedSessions: await prisma.trainingSession.count({
                    where: { userId: user.id, completed: true },
                }),
            },
        }

        const data = JSON.stringify(userFriendlyData, null, 2)

        await ctx.replyWithDocument(
            { source: Buffer.from(data), filename: `my_profile_data.json` },
            { caption: i18n.t(lang, 'messages.export_caption') },
        )
    } catch (error) {
        logger.error('Error in handleExport:', error)
        await ctx.reply('Ошибка при экспорте данных.')
    }
}

bot.command('profile', handleProfile)
bot.hears([/👤 Профиль/, /👤 Profile/], handleProfile)
bot.hears([/🏋️ Тренировка/, /🏋️ Training/], handleStartTraining)
bot.hears([/📊 Получить анализ/, /📊 Get Analysis/], handleGetAnalysis)
bot.hears([/📥 Мои данные/, /📥 My Data/], handleExport)
bot.hears([/💧 Вода/, /💧 Water/], handleWater)
bot.hears([/😴 Сон/, /😴 Sleep/], handleSleep)
bot.hears([/⚖️ Вес/, /⚖️ Weight/], handleWeight)

bot.action('profile:export', async (ctx) => {
    await ctx.answerCbQuery()
    await handleExport(ctx)
})

bot.action('main:profile', async (ctx) => {
    await ctx.answerCbQuery()
    await handleProfile(ctx)
})

bot.action('main:training', async (ctx) => {
    await ctx.answerCbQuery()
    await handleStartTraining(ctx)
})

bot.action('main:analysis', async (ctx) => {
    await ctx.answerCbQuery()
    await handleGetAnalysis(ctx)
})

bot.command('export', handleExport)

// Admin commands
bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx)) return
    const lang = ctx.language || 'ru'
    await ctx.reply('Админ-панель', adminKeyboard)
})

bot.command('stats', handleAdminStats)
bot.command('broadcast', handleAdminBroadcast)
bot.command('export_user', handleAdminExportUser)
bot.command('admin_grant', handleAdminGrant)
bot.command('ab_stats', handleAdminABStats)

bot.hears([/📊 Статистика/, /📊 Statistics/], handleAdminStats)
bot.hears([/🏷 A\/B Тесты/, /🏷 A\/B Tests/], handleAdminABList)
bot.hears([/📢 Рассылка/, /📢 Broadcast/], (ctx) => {
    if (!isAdmin(ctx)) return
    ctx.reply('/broadcast Текст сообщения')
})
bot.hears([/📥 Экспорт/, /📥 Export/], (ctx) => {
    if (!isAdmin(ctx)) return
    ctx.reply('/export_user <telegramId>')
})
bot.hears([/🏠 Главное меню/, /🏠 Main Menu/], async (ctx) => {
    const lang = ctx.language || 'ru'
    ctx.reply(i18n.t(lang, 'buttons.back_to_menu'), getMainKeyboard(lang))
})

// Dynamic A/B Action Handlers
bot.action('admin:main', async (ctx) => {
    await ctx.answerCbQuery()
    await ctx.reply('Админ панель:', adminKeyboard)
})

bot.action('admin:ab:list', async (ctx) => {
    await ctx.answerCbQuery()
    await handleAdminABList(ctx)
})

bot.action(/^admin:ab:edit:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery()
    await handleAdminABEdit(ctx, ctx.match[1])
})

bot.action(/^admin:ab:toggle:(.+)$/, async (ctx) => {
    await handleAdminABToggle(ctx, ctx.match[1])
})

bot.action(/^admin:ab:default:(.+)$/, async (ctx) => {
    await handleAdminABSetDefault(ctx, ctx.match[1])
})

bot.action(/^admin:ab:delete:(.+)$/, async (ctx) => {
    await handleAdminABDelete(ctx, ctx.match[1])
})

bot.action(/^admin:ab:price_select:(.+)$/, async (ctx) => {
    await handleAdminABPriceSelect(ctx, ctx.match[1])
})

bot.action(/^admin:ab:param:(.+):(.+)$/, async (ctx) => {
    await handleAdminABAskParam(ctx, ctx.match[1], ctx.match[2])
})

bot.action('admin:ab:create', async (ctx) => {
    await handleAdminABAskNewGroup(ctx)
})

// Generic message handler for admin inputs and other text
bot.on('text', async (ctx, next) => {
    const text = ctx.message.text

    // Check if it's an admin input
    const adminHandled = await handleAdminMessage(ctx, text)
    if (adminHandled) return

    // Check if it's a health input
    const healthHandled = await processHealthInput(ctx, text)
    if (healthHandled) return

    return next()
})

// Telegram Payment Pre-Checkout Query
bot.on('pre_checkout_query', async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0)
    const lang = ctx.language || 'ru'

    try {
        const user = await prisma.user.findUnique({ where: { telegramId } })
        if (user?.paid && user.subscriptionExpiry && user.subscriptionExpiry > new Date()) {
            // Allow multiple purchases if they want to extend,
            // but Telegram usually asks if user is sure.
            // Here we just let it through to allow "stacking" subs.
        }
        await ctx.answerPreCheckoutQuery(true)
    } catch (error) {
        logger.error('Error in pre_checkout_query:', error)
        await ctx.answerPreCheckoutQuery(false, i18n.t(lang, 'messages.global_error'))
    }
})

// Telegram Successful Payment
bot.on('successful_payment', async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0)
    const lang = ctx.language || 'ru'

    try {
        const payload = ctx.message.successful_payment.invoice_payload
        logger.info(`Received successful_payment from ${telegramId}. Payload: ${payload}`)

        const parts = payload.split(':')
        const providerId = parts[2]
        const days = parseInt(parts[3]) || 30

        const user = await prisma.user.findUnique({ where: { telegramId } })
        logger.info(`User found in DB for payment: ${!!user}, current paid status: ${user?.paid}`)

        let newExpiry = new Date()
        if (user?.subscriptionExpiry && user.subscriptionExpiry > new Date()) {
            newExpiry = new Date(user.subscriptionExpiry.getTime() + days * 24 * 60 * 60 * 1000)
        } else {
            newExpiry = new Date(new Date().getTime() + days * 24 * 60 * 60 * 1000)
        }

        await prisma.user.update({
            where: { telegramId },
            data: {
                paid: true,
                paymentDate: new Date(),
                subscriptionExpiry: newExpiry,
                lastPaymentProvider: providerId,
                analysisImageFileId: null, // Clear cached image to show unlocked results
            },
        })

        logger.info(`Database updated for user ${telegramId}. Paid: true, Provider: ${providerId}`)
        await ctx.reply(
            `✅ ${i18n.t(lang, 'messages.payment_success')}\n\n🏔️ Expiry: <b>${newExpiry.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')}</b>`,
            { parse_mode: 'HTML' },
        )
    } catch (error) {
        logger.error('Error in successful_payment hook:', error)
        await ctx.reply(i18n.t(lang, 'messages.global_error'))
    }
})

// Global error handling
bot.catch(async (err, ctx) => {
    logger.error(`Critical Telegraf error for update ${ctx.update.update_id}:`, err)

    try {
        if (ctx.scene) {
            ctx.scene.state = {}
            await ctx.scene.leave().catch(() => {})
        }
        // Use a simple static message to avoid i18n/DB issues in catch block
        await ctx
            .reply('⚠️ Произошла ошибка. Пожалуйста, введите /start для сброса.')
            .catch(() => {})
    } catch (e) {
        logger.error('Double fault in bot.catch:', e)
    }
})

// Handle process-level errors to prevent crashes
process.on('uncaughtException', (err) => logger.error('CRITICAL: Uncaught Exception:', err))
process.on('unhandledRejection', (reason, promise) =>
    logger.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason),
)

// Handle graceful shutdown
process.once('SIGINT', () => {
    logger.info('SIGINT received, stopping bot...')
    bot.stop('SIGINT')
})
process.once('SIGTERM', () => {
    logger.info('SIGTERM received, stopping bot...')
    bot.stop('SIGTERM')
})

bot.launch({ dropPendingUpdates: true })
    .then(() => {
        logger.info('Бот запущен...')
        return setupDefaultCommands(bot.telegram)
    })
    .catch((err) => logger.error('Ошибка запуска бота:', err))
