import { Markup } from 'telegraf'
import { MyContext } from '../context.js'
import { prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'
import { broadcastQueue } from '../../services/queue.js'
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
    const groups = await abService.getGroups()
    await ctx.reply('⚙️ Управление A/B группами и ценами:', abListKeyboard(groups))
}

export async function handleAdminABEdit(ctx: MyContext, groupName: string) {
    if (!isAdmin(ctx)) return
    const group = (await abService.getGroups()).find((g) => g.name === groupName)
    if (!group) return ctx.reply('Группа не найдена')

    let message = `📦 Группа: <b>${group.name}</b>\n`
    message += `Статус: ${group.isActive ? '✅ Активна' : '❌ Выключена'}\n`
    message += `Основная: ${group.isDefault ? '⭐ Да' : 'Нет'}\n\n`

    message += `📅 <b>1 месяц:</b>\n`
    message += `- Цена: ${group.price}₽ (Старая: ${group.oldPrice}₽)\n`
    message += `- Stars: ${group.priceStars}⭐️\n\n`

    message += `📅 <b>3 месяца:</b>\n`
    message += `- Цена: ${group.price3}₽ (Старая: ${group.oldPrice3}₽)\n`
    message += `- Stars: ${group.price3Stars}⭐️\n\n`

    message += `📅 <b>6 месяцев:</b>\n`
    message += `- Цена: ${group.price6}₽ (Старая: ${group.oldPrice6}₽)\n`
    message += `- Stars: ${group.price6Stars}⭐️`

    await ctx.replyWithHTML(message, abEditKeyboard(group.name, group.isActive, group.isDefault))
}

export async function handleAdminABToggle(ctx: MyContext, groupName: string) {
    if (!isAdmin(ctx)) return
    const groups = await abService.getGroups()
    const group = groups.find((g) => g.name === groupName)
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

export async function handleAdminBroadcast(ctx: MyContext) {
    const lang = ctx.language || 'ru'
    if (!isAdmin(ctx)) return

    const message =
        ctx.message && 'text' in ctx.message
            ? ctx.message.text.replace('/broadcast', '').trim()
            : ''
    if (!message) return ctx.reply(i18n.t(lang, 'admin.broadcast_usage'))

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
                await broadcastQueue.add(`broadcast-${u.telegramId}-${Date.now()}`, {
                    telegramId: u.telegramId.toString(),
                    message: message,
                })
                count++
            }
            cursor = users[users.length - 1].id
        }
        await ctx.reply(i18n.t(lang, 'admin.broadcast_success', { count }))
    } catch (error) {
        logger.error('Error in handleAdminBroadcast:', error)
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
