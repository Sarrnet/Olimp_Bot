import { MyContext } from '../context.js'
import { prisma } from '../../db/prisma.js'
import { growthService } from '../../services/growth.service.js'
import { i18n } from '../../services/i18n.js'
import { logger } from '../../utils/logger.js'

export async function handleWater(ctx: MyContext) {
    const lang = ctx.language || 'ru'
    if (!ctx.user?.paid) {
        return ctx.reply(i18n.t(lang, 'messages.need_payment'), { parse_mode: 'HTML' })
    }
    ctx.session.healthState = { type: 'wait_water' }
    await ctx.reply(i18n.t(lang, 'messages.health_water_ask'), { parse_mode: 'HTML' })
}

export async function handleSleep(ctx: MyContext) {
    const lang = ctx.language || 'ru'
    if (!ctx.user?.paid) {
        return ctx.reply(i18n.t(lang, 'messages.need_payment'), { parse_mode: 'HTML' })
    }
    ctx.session.healthState = { type: 'wait_sleep' }
    await ctx.reply(i18n.t(lang, 'messages.health_sleep_ask'), { parse_mode: 'HTML' })
}

export async function handleWeight(ctx: MyContext) {
    const lang = ctx.language || 'ru'
    if (!ctx.user?.paid) {
        return ctx.reply(i18n.t(lang, 'messages.need_payment'), { parse_mode: 'HTML' })
    }
    ctx.session.healthState = { type: 'wait_weight' }
    await ctx.reply(i18n.t(lang, 'messages.health_weight_ask'), { parse_mode: 'HTML' })
}

export async function processHealthInput(ctx: MyContext, text: string) {
    if (!ctx.session.healthState) return false
    
    const lang = ctx.language || 'ru'
    const telegramId = BigInt(ctx.from!.id)
    const today = new Date().toISOString().split('T')[0]
    const state = ctx.session.healthState

    try {
        const user = await prisma.user.findUnique({ where: { telegramId } })
        if (!user) return false

        if (state.type === 'wait_water') {
            const val = parseInt(text)
            if (isNaN(val) || val < 0) return ctx.reply(i18n.t(lang, 'messages.health_invalid_number'))
            
            const logs = (user.waterLogs as any) || {}
            logs[today] = (logs[today] || 0) + val
            
            await prisma.user.update({
                where: { telegramId },
                data: { waterLogs: logs }
            })
            
            // Apply instant growth bonus if goal reached
            if (logs[today] >= 2000) {
                await growthService.applyInstantBonus(user.id, 'water')
            }

            delete ctx.session.healthState
            await ctx.reply(i18n.t(lang, 'messages.health_water_done', { total: logs[today] }), { parse_mode: 'HTML' })
            return true
        }

        if (state.type === 'wait_sleep') {
            const val = parseFloat(text.replace(',', '.'))
            if (isNaN(val) || val < 0 || val > 24) return ctx.reply(i18n.t(lang, 'messages.health_invalid_hours'))
            
            const logs = (user.sleepLogs as any) || {}
            logs[today] = val
            
            await prisma.user.update({
                where: { telegramId },
                data: { sleepLogs: logs }
            })

            // Apply instant growth bonus if goal reached
            if (val >= 8) {
                await growthService.applyInstantBonus(user.id, 'sleep')
            }
            
            delete ctx.session.healthState
            await ctx.reply(i18n.t(lang, 'messages.health_sleep_done', { val: val }), { parse_mode: 'HTML' })
            return true
        }

        if (state.type === 'wait_weight') {
            const val = parseFloat(text.replace(',', '.'))
            if (isNaN(val) || val < 10 || val > 300) return ctx.reply(i18n.t(lang, 'messages.health_invalid_number'))
            
            const logs = (user.weightLogs as any) || {}
            const weekKey = `W${getWeekNumber(new Date())}`
            logs[weekKey] = val
            
            let bmi = user.initialBmi
            if (user.currentHeight) {
                bmi = parseFloat((val / ((user.currentHeight / 100) ** 2)).toFixed(2))
            }

            await prisma.user.update({
                where: { telegramId },
                data: { weightLogs: logs, initialBmi: bmi }
            })
            
            delete ctx.session.healthState
            await ctx.reply(i18n.t(lang, 'messages.health_weight_done', { bmi: bmi || '-' }), { parse_mode: 'HTML' })
            return true
        }
    } catch (error) {
        logger.error('Error in processHealthInput:', error)
    }
    
    return false
}

function getWeekNumber(d: Date) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}
