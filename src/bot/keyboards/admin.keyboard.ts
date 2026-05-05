import { Markup } from 'telegraf'

export const adminKeyboard = Markup.keyboard([
    ['📊 Общая статистика', '🏷 A/B Тесты'],
    ['📢 Массовая рассылка', '📥 Экспорт пользователя'],
    ['🏠 Главное меню'],
]).resize()
