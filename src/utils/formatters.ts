import { AnalysisResponse } from '../types/index.js'
import { i18n } from '../services/i18n.js'
import { markdownToHtml } from './markdown.js'

export function formatTariffs(config: any, lang: string = 'ru'): string {
    const calculateDiscount = (old: number, cur: number) => Math.round(((old - cur) / old) * 100);

    const t1 = calculateDiscount(config.oldPrice, config.price);
    const t3 = calculateDiscount(config.oldPrice3, config.price3);
    const t6 = calculateDiscount(config.oldPrice6, config.price6);

    let message = `${i18n.t(lang, 'messages.analysis_pre_upsell')}\n\n`;
    message += `${i18n.t(lang, 'messages.tariffs_title')}\n\n`;
    message += `📅 <b>${i18n.t(lang, 'messages.tariff_1m')}</b>\n`;
    message += `<s>${config.oldPrice}₽</s> ➡️ <b>${config.price}₽</b> (скидка ${t1}%)\n\n`;

    message += `📅 <b>${i18n.t(lang, 'messages.tariff_3m')}</b>\n`;
    message += `<s>${config.oldPrice3}₽</s> ➡️ <b>${config.price3}₽</b> (скидка ${t3}%)\n`;
    message += `${i18n.t(lang, 'messages.tariffs_popular')}\n\n`;

    message += `📅 <b>${i18n.t(lang, 'messages.tariff_6m')}</b>\n`;
    message += `<s>${config.oldPrice6}₽</s> ➡️ <b>${config.price6}₽</b> (скидка ${t6}%)\n`;
    message += `${i18n.t(lang, 'messages.tariffs_best_value')}\n\n`;

    message += `${i18n.t(lang, 'messages.tariffs_footer')}`;
    return message;
}


export function formatAnalysisForUser(
    analysis: AnalysisResponse,
    isPaid: boolean,
    lang: string = 'ru',
    config: any = { price: 699 },
): string {
    const price = `${config.price}`
    
    // Helper to safely get string from potentially object field
    const getString = (val: any) => {
        if (!val) return ''
        if (typeof val === 'string') return val
        return val.content || val.instructions || val.value || JSON.stringify(val)
    }

    const intro = getString(analysis?.intro_analysis)
    const closing = getString(analysis?.closing_hook)
    const blocks = analysis?.structured_blocks || []

    let message = `<b>${i18n.t(lang, 'messages.analysis_title')}</b>\n\n`
    message += `${markdownToHtml(intro)}\n\n`

    blocks.forEach((block) => {
        if (!block) return

        const title = block.title || '...'
        let content = block.content || block.instructions || block.value || ''
        
        // Fix: If AI returns an array, format it as a list instead of comma-separated string
        if (Array.isArray(content)) {
            content = content.map(item => `• ${item}`).join('\n')
        }

        message += `🔹 <b>${title}</b>\n`

        if (block.visibility === 'free' || isPaid) {
            if (content) {
                message += `${markdownToHtml(String(content))}\n\n`
            } else {
                message += `<i>${i18n.t(lang, 'messages.data_not_found')}</i>\n\n`
            }
        } else if (block.visibility === 'partial') {
            const contentStr = String(content || '')
            const teaser = contentStr.length > 100 ? contentStr.slice(0, 100) + '...' : contentStr
            message += `${markdownToHtml(teaser)}\n<i>${i18n.t(lang, 'messages.analysis_partial_hint')}</i>\n\n`
        } else {
            message += `<i>${i18n.t(lang, 'messages.analysis_locked_hint')}</i>\n\n`
        }
    })

    message += `\n${markdownToHtml(closing)}`

    if (!isPaid) {
        message += `\n\n${formatTariffs(config, lang)}`
    }

    return message
}
