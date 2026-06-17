import { AnalysisResponse } from '../types/index.js'
import { i18n } from '../services/i18n.js'
import { markdownToHtml } from './markdown.js'

export function formatAnalysisForUser(
    analysis: AnalysisResponse,
    isPaid: boolean,
    lang: string = 'ru',
    config: any = { price: 699 },
): string[] {
    const messages: string[] = []
    const emojis = ['🧬', '🎲', '⛓️', '🎯', '🛡️', '📊', '🧩', '⏳', '🌟', '📈', '🛑', '💤', '🏃‍♂️']

    const intro = analysis.intro_analysis
    const closing = analysis.closing_hook
    const blocks = analysis.structured_blocks || []

    const introText = `<b>${i18n.t(lang, 'messages.analysis_title')}</b>\n\n${markdownToHtml(intro)}`

    blocks.forEach((block, index) => {
        if (!block) return

        const emoji = emojis[index % emojis.length]
        const title = block.title || '...'
        const content = block.content || ''

        let blockMessage = `${emoji} <b>${title}</b>\n`

        if (block.visibility === 'free' || isPaid) {
            if (content.trim() !== '') {
                blockMessage += `${markdownToHtml(content)}\n`
            } else {
                blockMessage += `<i>${i18n.t(lang, 'messages.data_not_found')}</i>\n`
            }
        } else if (block.visibility === 'partial') {
            if (content.trim() !== '') {
                const teaser = content.length > 110 ? content.slice(0, 110) + '...' : content
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
