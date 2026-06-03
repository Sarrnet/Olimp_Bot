import { AnalysisResponse } from '../types/index.js'
import { i18n } from '../services/i18n.js'
import { markdownToHtml } from './markdown.js'

export function formatTariffs(config: any, lang: string = 'ru'): string {
    const calculateDiscount = (old: number, cur: number) => {
        if (!old || !cur) return 0
        return Math.round(((old - cur) / old) * 100)
    }

    const t1 = calculateDiscount(config.oldPrice, config.price)
    const t3 = calculateDiscount(config.oldPrice3, config.price3)
    const t6 = calculateDiscount(config.oldPrice6, config.price6)

    let message = `${i18n.t(lang, 'messages.tariffs_title')}\n\n`

    message += `📅 <b>${i18n.t(lang, 'messages.tariff_1m')}</b>\n`
    message += `<s>${config.oldPrice}₽</s> ➡️ <b>${config.price}₽</b>`
    if (t1 > 0) message += ` (скидка ${t1}%)`
    message += `\n\n`

    message += `📅 <b>${i18n.t(lang, 'messages.tariff_3m')}</b>\n`
    message += `<s>${config.oldPrice3}₽</s> ➡️ <b>${config.price3}₽</b>`
    if (t3 > 0) message += ` (скидка ${t3}%)`
    message += `\n${i18n.t(lang, 'messages.tariffs_popular')}\n\n`

    message += `📅 <b>${i18n.t(lang, 'messages.tariff_6m')}</b>\n`
    message += `<s>${config.oldPrice6}₽</s> ➡️ <b>${config.price6}₽</b>`
    if (t6 > 0) message += ` (скидка ${t6}%)`
    message += `\n${i18n.t(lang, 'messages.tariffs_best_value')}\n\n`

    message += `${i18n.t(lang, 'messages.tariffs_footer')}`
    return message
}

export function formatAnalysisForUser(
    analysis: AnalysisResponse,
    isPaid: boolean,
    lang: string = 'ru',
    config: any = { price: 699 },
): string[] {
    const messages: string[] = []
    const emojis = [
        '🧬',
        '🎲',
        '⛓️',
        '🎯',
        '🛡️',
        '<tg-emoji emoji-id="5231200819986047254">📊</tg-emoji>',
        '🧩',
        '⏳',
        '🌟',
        '📈',
        '🛑',
    ]

    // Helper to safely get string from potentially object field
    const getString = (val: any) => {
        if (!val) return ''
        if (typeof val === 'string') return val
        return val.content || val.instructions || val.value || JSON.stringify(val)
    }

    const intro = getString(analysis?.intro_analysis)
    const closing = getString(analysis?.closing_hook)
    const blocks = analysis?.structured_blocks || []

    // Intro text
    const introText = `<b>${i18n.t(lang, 'messages.analysis_title')}</b>\n\n${markdownToHtml(intro)}`

    blocks.forEach((block, index) => {
        if (!block) return

        const emoji = emojis[index % emojis.length]
        const title = block.title || '...'
        let content = block.content || block.instructions || block.value || ''

        // Formatting arrays into list
        if (Array.isArray(content)) {
            content = content.map((item) => `• ${item}`).join('\n')
        }

        let blockMessage = `${emoji} <b>${title}</b>\n`

        if (block.visibility === 'free' || isPaid) {
            if (content) {
                blockMessage += `${markdownToHtml(String(content))}\n`
            } else {
                blockMessage += `<i>${i18n.t(lang, 'messages.data_not_found')}</i>\n`
            }
        } else if (block.visibility === 'partial') {
            const contentStr = String(content || '')
            const teaser = contentStr.length > 100 ? contentStr.slice(0, 100) + '...' : contentStr
            blockMessage += `${markdownToHtml(teaser)}\n<i>${i18n.t(lang, 'messages.analysis_partial_hint')}</i>\n`
        } else {
            blockMessage += `<i>${i18n.t(lang, 'messages.analysis_locked_hint')}</i>\n`
        }

        messages.push(blockMessage)
    })

    // Settle intro with first block
    if (messages.length > 0) {
        messages[0] = `${introText}\n\n${messages[0]}`
    } else if (intro) {
        // If no blocks, at least return intro
        messages.push(introText)
    }

    // Append closing hook to the last message
    if (closing && messages.length > 0) {
        messages[messages.length - 1] += `\n${markdownToHtml(closing)}`
    }

    return messages
}
