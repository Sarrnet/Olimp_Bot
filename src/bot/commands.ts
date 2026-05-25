import { Telegraf } from 'telegraf'
import { MyContext } from './context.js'

export const USER_COMMANDS = [
    { command: 'start', description: '🚀 Запустить/Перезапустить бота' },
    { command: 'menu', description: '🏠 Главное меню' },
    { command: 'profile', description: '👤 Мой профиль и статистика' },
    { command: 'buy', description: '💳 Купить полный доступ' },
    { command: 'language', description: '🌐 Сменить язык' },
    { command: 'export', description: '📥 Экспорт моих данных' },
    { command: 'cancel', description: '❌ Отменить текущее действие' },
]

export const ADMIN_COMMANDS = [
    ...USER_COMMANDS,
    { command: 'admin', description: '⚙️ Админ-панель' },
    { command: 'stats', description: '📊 Общая статистика' },
    { command: 'ab_stats', description: '🏷 Статистика A/B тестов' },
    { command: 'broadcast', description: '📢 Рассылка пользователям' },
    { command: 'export_user', description: '👤 Дамп пользователя по ID' },
    { command: 'admin_grant', description: '🔑 Выдать доступ вручную' },
]

/**
 * Sets commands for a specific user based on their role
 */
export async function setupUserCommands(telegram: any, chatId: number, isAdmin: boolean) {
    try {
        await telegram.setMyCommands(isAdmin ? ADMIN_COMMANDS : USER_COMMANDS, {
            scope: { type: 'chat', chat_id: chatId },
        })
    } catch (error) {
        console.error(`Error setting commands for chat ${chatId}:`, error)
    }
}

/**
 * Sets global default commands
 */
export async function setupDefaultCommands(telegram: any) {
    try {
        await telegram.setMyCommands(USER_COMMANDS, { scope: { type: 'default' } })
    } catch (error) {
        console.error('Error setting default commands:', error)
    }
}
