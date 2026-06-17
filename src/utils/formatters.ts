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
    const emojis = ['🧬', '🎲', '⛓️', '🎯', '🛡️', '📊', '🧩', '⏳', '🌟', '📈', '🛑']

    // Рекурсивный глубокий извлекатель строк, который отсекает промпты и анкеты
    const getString = (val: any): string => {
        if (!val) return ''
        if (typeof val === 'string') return val
        
        // Если это массив (например, список пунктов от ИИ)
        if (Array.isArray(val)) {
            return val.map(item => getString(item)).filter(Boolean).join('\n')
        }

        // Если это объект, проверяем приоритетные поля генерации ИИ
        if (typeof val === 'object') {
            // Если ИИ вложил ответ в val.content или val.value (если value - строка)
            if (val.content && typeof val.content === 'string') return val.content
            if (val.value && typeof val.value === 'string') return val.value
            
            // Если внутри value лежит еще один объект (глубокая вложенность Mistral)
            if (val.value && typeof val.value === 'object') {
                if (val.value.content && typeof val.value.content === 'string') return val.value.content
                if (val.value.value && typeof val.value.value === 'string') return val.value.value
            }
            
            // Защита: если это объект параметров пользователя (например, рост, возраст) - ИГНОРИРУЕМ его,
            // чтобы не выводить технические ответы пользователя на экран.
            if (val.currentHeight || val.targetHeight || val.fatherHeight || val.answers) {
                return '' 
            }

            // Фолбек на случай, если контент лежит в других текстовых полях объекта
            const textCandidate = val.content || val.value || val.text
            if (textCandidate) return getString(textCandidate)
        }

        return ''
    }

    const intro = getString(analysis?.intro_analysis)
    const closing = getString(analysis?.closing_hook)
    const blocks = analysis?.structured_blocks || []

    const introText = `<b>${i18n.t(lang, 'messages.analysis_title')}</b>\n\n${markdownToHtml(intro)}`

    blocks.forEach((block, index) => {
        if (!block) return

        const emoji = emojis[index % emojis.length]
        const title = block.title || '...'
        
        // Передаем весь блок в getString, она сама разберется с вложенностью полей
        let content = getString(block)

        let blockMessage = `${emoji} <b>${title}</b>\n`

        if (block.visibility === 'free' || isPaid) {
            if (content && content.trim() !== '') {
                blockMessage += `${markdownToHtml(content)}\n`
            } else {
                blockMessage += `<i>${i18n.t(lang, 'messages.data_not_found')}</i>\n`
            }
        } else if (block.visibility === 'partial') {
            if (content && content.trim() !== '') {
                const teaser = content.length > 100 ? content.slice(0, 100) + '...' : content
                blockMessage += `${markdownToHtml(teaser)}\n<i>${i18n.t(lang, 'messages.analysis_partial_hint')}</i>\n`
            } else {
                blockMessage += `<i>${i18n.t(lang, 'messages.data_not_found')}</i>\n`
            }
        } else {
            blockMessage += `<i>${i18n.t(lang, 'messages.analysis_locked_hint')}</i>\n`
        }

        messages.push(blockMessage)
    })

    if (messages.length > 0) {
        messages[0] = `${introText}\n\n${messages[0]}`
    } else if (intro) {
        messages.push(introText)
    }

    if (closing && messages.length > 0) {
        messages[messages.length - 1] += `\n${markdownToHtml(closing)}`
    }

    return messages
}
