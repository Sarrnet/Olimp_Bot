import { Markup } from 'telegraf'
import { MyContext, BroadcastPayload } from '../context.js'
import { prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'
import { broadcastQueue, sendBroadcastItem } from '../../services/queue.js'
import { i18n } from '../../services/i18n.js'
import { abService } from '../../services/ab.service.js'
import {
    abListKeyboard,
    abEditKeyboard,
    abPriceSelectorKeyboard,
} from '../keyboards/admin-ab.keyboard.js'

const adminIds = (process.env.ADMIN_IDS || '').split(',').map((id) => id.trim())

export const isAdmin = (ctx: MyContext) => {
    if (ctx.role === 'ADMIN') return true
    const telegramId = ctx.from?.id.toString() || ''
    return adminIds.includes(telegramId)
}

export async function handleAdminStats(ctx: MyContext) {
    const lang = ctx.language || 'ru'
    if (!isAdmin(ctx)) return ctx.reply(i18n.t(lang, 'admin.no_access'))

    try {
        const totalUsers = await prisma.user.count()
        const completedOnboarding = await prisma.user.count({
            where: { onboardingCompleted: true },
        })
        const paidUsers = await prisma.user.count({ where: { paid: true } })
        const totalSessions = await prisma.trainingSession.count()

        await ctx.replyWithHTML(
            i18n.t(lang, 'admin.stats_title', {
                totalUsers,
                completedOnboarding,
                paidUsers,
                totalSessions,
            }),
        )
    } catch (error) {
        logger.error('Error in handleAdminStats:', error)
        await ctx.reply(i18n.t(lang, 'admin.stats_error'))
    }
}

// --- Dynamic A/B Pricing Handlers ---

export async function handleAdminABList(ctx: MyContext) {
    if (!isAdmin(ctx)) return
    const groups: any[] = await abService.getGroups()
    await ctx.reply('⚙️ Управление A/B группами и ценами:', abListKeyboard(groups))
}

export async function handleAdminABEdit(ctx: MyContext, groupName: string) {
    if (!isAdmin(ctx)) return
    const groups: any[] = await abService.getGroups()
    const group = groups.find((g: any) => g.name === groupName)
    if (!group) return ctx.reply('Группа не найдена')

    let message = `📦 Группа: <b>${group.name}</b>\n`
    message += `Статус: ${group.isActive ? '✅ Активна' : '❌ Выключена'}\n`
    message += `Основная: ${group.isDefault ? '⭐ Да' : 'Нет'}\n\n`

    message += `📅 <b>1 месяц:</b>\n`
    message += `- Цена: ${group.price}₽ (Старая: ${group.oldPrice}₽)\n`
    message += `- Crypto: ${group.priceCrypto}$\n`
    message += `- Stars: ${group.priceStars}⭐️\n\n`

    message += `📅 <b>3 месяца:</b>\n`
    message += `- Цена: ${group.price3}₽ (Старая: ${group.oldPrice3}₽)\n`
    message += `- Crypto: ${group.price3Crypto}$\n`
    message += `- Stars: ${group.price3Stars}⭐️\n\n`

    message += `📅 <b>6 месяцев:</b>\n`
    message += `- Цена: ${group.price6}₽ (Старая: ${group.oldPrice6}₽)\n`
    message += `- Crypto: ${group.price6Crypto}$\n`
    message += `- Stars: ${group.price6Stars}⭐️`

    await ctx.replyWithHTML(message, abEditKeyboard(group.name, group.isActive, group.isDefault))
}

export async function handleAdminABToggle(ctx: MyContext, groupName: string) {
    if (!isAdmin(ctx)) return
    const groups: any[] = await abService.getGroups()
    const group = groups.find((g: any) => g.name === groupName)
    if (!group) return

    await abService.updateGroup(groupName, { isActive: !group.isActive })
    await ctx.answerCbQuery('Статус изменен')
    return handleAdminABEdit(ctx, groupName)
}

export async function handleAdminABSetDefault(ctx: MyContext, groupName: string) {
    if (!isAdmin(ctx)) return
    await abService.updateGroup(groupName, { isDefault: true, isActive: true })
    await ctx.answerCbQuery('Теперь эта группа основная')
    return handleAdminABEdit(ctx, groupName)
}

export async function handleAdminABDelete(ctx: MyContext, groupName: string) {
    if (!isAdmin(ctx)) return
    try {
        await abService.deleteGroup(groupName)
        await ctx.answerCbQuery('Группа удалена')
        return handleAdminABList(ctx)
    } catch (e: any) {
        await ctx.answerCbQuery(e.message, { show_alert: true })
    }
}

export async function handleAdminABPriceSelect(ctx: MyContext, groupName: string) {
    if (!isAdmin(ctx)) return
    const lang = ctx.language || 'ru'
    await ctx.editMessageText(
        i18n.t(lang, 'messages.admin_price_selector_title', { group: groupName }),
        abPriceSelectorKeyboard(groupName),
    )
    await ctx.answerCbQuery()
}

export async function handleAdminABAskParam(ctx: MyContext, groupName: string, param: string) {
    if (!isAdmin(ctx)) return
    ctx.session.adminState = { type: 'wait_group_param_value', groupName, param }
    await ctx.reply(
        `Введите новое значение для <b>${param}</b> в группе <b>${groupName}</b> (только число):`,
        { parse_mode: 'HTML' },
    )
    await ctx.answerCbQuery()
}

export async function handleAdminABAskNewGroup(ctx: MyContext) {
    if (!isAdmin(ctx)) return
    ctx.session.adminState = { type: 'wait_group_name' }
    await ctx.reply('Введите название для новой группы (например, PROMO):')
    await ctx.answerCbQuery()
}

// Message handler for admin inputs
export async function handleAdminMessage(ctx: MyContext, text: string) {
    if (!isAdmin(ctx) || !ctx.session.adminState) return false

    const state = ctx.session.adminState

    if (state.type === 'wait_group_param_value' && state.groupName && state.param) {
        const val = parseInt(text)
        if (isNaN(val)) return ctx.reply('Пожалуйста, введите число')

        await abService.updateGroup(state.groupName, { [state.param]: val })
        delete ctx.session.adminState
        await ctx.reply(
            `✅ Параметр <b>${state.param}</b> для группы <b>${state.groupName}</b> изменен на <b>${val}</b>`,
            { parse_mode: 'HTML' },
        )
        return handleAdminABEdit(ctx, state.groupName)
    }

    if (state.type === 'wait_group_name') {
        ctx.session.adminState = { type: 'wait_group_param_value', groupName: text, param: 'price' }
        await ctx.reply(`Ок, теперь введите основную цену (1м) для группы ${text}:`)
        return true
    }

    return false
}

// --- Rest of Existing Handlers ---

// Delay between consecutive broadcast messages (ms). Spreads load to stay
// under Telegram's ~30 msg/sec limit. Configurable via env; 200ms => 5 msg/sec.
const BROADCAST_PACING_MS = Math.max(0, parseInt(process.env.BROADCAST_PACING_MS || '200', 10))

const broadcastConfirmKeyboard = Markup.inlineKeyboard([
    [
        { ...Markup.button.callback('✅ Отправить всем', 'broadcast:confirm') },
        { ...Markup.button.callback('❌ Отмена', 'broadcast:cancel') },
    ],
])

const broadcastFollowupKeyboard = Markup.inlineKeyboard([
    [
        { ...Markup.button.callback('📄 Отправить только файл', 'broadcast:skip_followup') },
        { ...Markup.button.callback('❌ Отмена', 'broadcast:cancel') },
    ],
])

/**
 * Extracts a broadcast payload from whatever the admin sent (text or media).
 * Media is captured by Telegram `file_id`, so it is uploaded to Telegram only
 * once and then reused for every recipient.
 */
function extractBroadcastPayload(ctx: MyContext): BroadcastPayload | null {
    const m: any = ctx.message
    if (!m) return null
    const caption: string | undefined = m.caption
    if ('text' in m) return { kind: 'text', text: m.text }
    if ('photo' in m)
        // photo is an array of sizes; last entry is the highest resolution
        return { kind: 'photo', fileId: m.photo[m.photo.length - 1].file_id, caption }
    if ('animation' in m) return { kind: 'animation', fileId: m.animation.file_id, caption }
    if ('video' in m) return { kind: 'video', fileId: m.video.file_id, caption }
    if ('video_note' in m) return { kind: 'video_note', fileId: m.video_note.file_id }
    if ('voice' in m) return { kind: 'voice', fileId: m.voice.file_id, caption }
    if ('audio' in m) return { kind: 'audio', fileId: m.audio.file_id, caption }
    if ('document' in m) return { kind: 'document', fileId: m.document.file_id, caption }
    if ('sticker' in m) return { kind: 'sticker', fileId: m.sticker.file_id }
    return null
}

/**
 * Entry point for /broadcast. If text follows the command it is treated as the
 * content right away; otherwise the admin is asked to send the content (text,
 * photo, video, video note, document, etc.) which is then previewed.
 */
export async function handleAdminBroadcast(ctx: MyContext) {
    const lang = ctx.language || 'ru'
    if (!isAdmin(ctx)) return

    const inlineText =
        ctx.message && 'text' in ctx.message
            ? ctx.message.text.replace('/broadcast', '').trim()
            : ''

    if (inlineText) {
        return presentBroadcastPreview(ctx, { kind: 'text', text: inlineText })
    }

    ctx.session.broadcastState = { step: 'await_content' }
    await ctx.reply(i18n.t(lang, 'admin.broadcast_prompt'))
}

/**
 * Consumes the next message from an admin who is composing a broadcast.
 * Returns true if the message was handled (admin is mid-compose).
 *
 * Compose steps:
 *  - await_content:  first message — text or media.
 *  - await_followup: media without a caption was sent; an optional long text
 *                    message can now be attached (sent after the file).
 */
export async function captureBroadcastContent(ctx: MyContext): Promise<boolean> {
    const lang = ctx.language || 'ru'
    if (!isAdmin(ctx)) return false
    const state = ctx.session.broadcastState
    if (!state) return false

    // Let bot commands (e.g. /cancel, /menu) pass through instead of being
    // captured as broadcast content.
    const m: any = ctx.message
    if (m && 'text' in m && m.text.startsWith('/')) return false

    if (state.step === 'await_content') {
        const payload = extractBroadcastPayload(ctx)
        if (!payload) {
            await ctx.reply(i18n.t(lang, 'admin.broadcast_unsupported'))
            return true
        }
        // Media without a caption: offer to attach a separate text message,
        // which lifts the 1024-char caption limit for long texts.
        if (payload.kind !== 'text' && !payload.caption) {
            ctx.session.broadcastState = { step: 'await_followup', payload }
            await ctx.reply(i18n.t(lang, 'admin.broadcast_followup_prompt'), {
                parse_mode: 'HTML',
                ...broadcastFollowupKeyboard,
            })
            return true
        }
        await presentBroadcastPreview(ctx, payload)
        return true
    }

    if (state.step === 'await_followup') {
        if (!state.payload) {
            delete ctx.session.broadcastState
            return false
        }
        if (!m || !('text' in m)) {
            await ctx.reply(i18n.t(lang, 'admin.broadcast_followup_need_text'))
            return true
        }
        await presentBroadcastPreview(ctx, { ...state.payload, followupText: m.text })
        return true
    }

    return false
}

/** "Send file only" button on the follow-up step — skips the attached text. */
export async function handleBroadcastSkipFollowup(ctx: MyContext) {
    const lang = ctx.language || 'ru'
    if (!isAdmin(ctx)) return
    await ctx.answerCbQuery().catch(() => {})

    const state = ctx.session.broadcastState
    if (!state || state.step !== 'await_followup' || !state.payload) {
        return ctx.reply(i18n.t(lang, 'admin.broadcast_expired'))
    }
    await presentBroadcastPreview(ctx, state.payload)
}

/** Stores the payload, shows it back to the admin and asks for confirmation. */
async function presentBroadcastPreview(ctx: MyContext, payload: BroadcastPayload) {
    const lang = ctx.language || 'ru'
    ctx.session.broadcastState = { step: 'await_confirm', payload }

    const total = await prisma.user.count()

    // Show a real preview by delivering the item to the admin themselves.
    try {
        if (ctx.from) await sendBroadcastItem(ctx.telegram, ctx.from.id, payload)
    } catch (error) {
        logger.error('Error previewing broadcast:', error)
    }

    await ctx.reply(i18n.t(lang, 'admin.broadcast_confirm', { count: total }), {
        parse_mode: 'HTML',
        ...broadcastConfirmKeyboard,
    })
}

export async function handleBroadcastConfirm(ctx: MyContext) {
    const lang = ctx.language || 'ru'
    if (!isAdmin(ctx)) return
    await ctx.answerCbQuery().catch(() => {})

    const state = ctx.session.broadcastState
    if (!state || state.step !== 'await_confirm' || !state.payload) {
        return ctx.reply(i18n.t(lang, 'admin.broadcast_expired'))
    }
    const payload = state.payload
    delete ctx.session.broadcastState
    await enqueueBroadcast(ctx, payload)
}

export async function handleBroadcastCancel(ctx: MyContext) {
    const lang = ctx.language || 'ru'
    if (!isAdmin(ctx)) return
    await ctx.answerCbQuery().catch(() => {})
    delete ctx.session.broadcastState
    await ctx.reply(i18n.t(lang, 'admin.broadcast_cancelled'))
}

/** Fans the payload out to every user via the broadcast queue, paced by delay. */
async function enqueueBroadcast(ctx: MyContext, payload: BroadcastPayload) {
    const lang = ctx.language || 'ru'
    try {
        let cursor: string | undefined = undefined
        const batchSize = 100
        let count = 0
        await ctx.reply(i18n.t(lang, 'admin.broadcast_start'))

        while (true) {
            const users: any[] = await prisma.user.findMany({
                take: batchSize,
                skip: cursor ? 1 : 0,
                cursor: cursor ? { id: cursor } : undefined,
                orderBy: { id: 'asc' },
                select: { id: true, telegramId: true },
            })
            if (users.length === 0) break
            for (const u of users) {
                await broadcastQueue.add(
                    `broadcast-${u.telegramId}-${Date.now()}`,
                    {
                        telegramId: u.telegramId.toString(),
                        payload,
                    },
                    { delay: count * BROADCAST_PACING_MS },
                )
                count++
            }
            cursor = users[users.length - 1].id
        }
        await ctx.reply(i18n.t(lang, 'admin.broadcast_success', { count }))
    } catch (error) {
        logger.error('Error in enqueueBroadcast:', error)
        await ctx.reply(i18n.t(lang, 'admin.broadcast_error'))
    }
}

export async function handleAdminExportUser(ctx: MyContext) {
    const lang = ctx.language || 'ru'
    if (!isAdmin(ctx)) return
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
    const args = text.split(' ')
    if (args.length < 2) return ctx.reply(i18n.t(lang, 'admin.export_usage'))
    const targetId = args[1]

    try {
        const user = await prisma.user.findUnique({
            where: { telegramId: BigInt(targetId) },
            include: { trainingSessions: true },
        })
        if (!user) return ctx.reply(i18n.t(lang, 'admin.export_not_found'))
        const data = JSON.stringify(user, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
        await ctx.replyWithDocument(
            { source: Buffer.from(data), filename: `dump_${targetId}.json` },
            { caption: `User ${targetId}` },
        )
    } catch (error) {
        logger.error('Error in handleAdminExportUser:', error)
        await ctx.reply(i18n.t(lang, 'admin.export_error'))
    }
}

export async function handleAdminGrant(ctx: MyContext) {
    const lang = ctx.language || 'ru'
    if (!isAdmin(ctx)) return
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
    const args = text.split(' ')
    if (args.length < 2) return ctx.reply(i18n.t(lang, 'admin.grant_usage'))
    const targetId = args[1]

    try {
        const user = await prisma.user.update({
            where: { telegramId: BigInt(targetId) },
            data: { paid: true, paymentDate: new Date() },
        })
        await ctx.reply(
            i18n.t(lang, 'admin.grant_success', { targetId, firstName: user.firstName || '' }),
        )
        await ctx.telegram.sendMessage(
            Number(targetId),
            i18n.t(user.language || 'ru', 'admin.grant_notify'),
        )
    } catch (error) {
        logger.error('Error in handleAdminGrant:', error)
        await ctx.reply(i18n.t(lang, 'admin.grant_error'))
    }
}

export async function handleAdminABStats(ctx: MyContext) {
    const lang = ctx.language || 'ru'
    if (!isAdmin(ctx)) return

    try {
        const configs = await abService.getGroups()
        let message = `📊 <b>Статистика A/B тестов:</b>\n\n`

        for (const config of configs) {
            const count = await prisma.user.count({ where: { abGroup: config.name } })
            const paid = await prisma.user.count({ where: { abGroup: config.name, paid: true } })
            const conv = count > 0 ? ((paid / count) * 100).toFixed(2) : '0.00'

            message += `🏷 <b>Группа ${config.name} (${config.price}₽)</b>\n`
            message += `- Юзеров: ${count}\n`
            message += `- Оплат: ${paid}\n`
            message += `- Конверсия: ${conv}%\n\n`
        }

        await ctx.replyWithHTML(message)
    } catch (error) {
        logger.error('Error in handleAdminABStats:', error)
        await ctx.reply(i18n.t(lang, 'admin.ab_stats_error'))
    }
}
