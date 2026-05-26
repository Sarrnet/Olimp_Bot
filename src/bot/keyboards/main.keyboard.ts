import { Markup } from 'telegraf'
import { i18n } from '../../services/i18n.js'

export const getMainKeyboard = (lang: string = 'ru') => {
    return Markup.keyboard([
        [i18n.t(lang, 'buttons.get_analysis'), i18n.t(lang, 'buttons.start_training')],
        [i18n.t(lang, 'buttons.water'), i18n.t(lang, 'buttons.sleep'), i18n.t(lang, 'buttons.weight')],
        [i18n.t(lang, 'buttons.profile'), i18n.t(lang, 'buttons.my_data')],
    ]).resize()
}
