import { Markup } from 'telegraf'

/**
 * Keyboard for the list of A/B groups
 */
export const abListKeyboard = (groups: any[]) => {
    const buttons = groups.map((g) => [
        Markup.button.callback(
            `${g.name} (${g.price}₽) ${g.isActive ? '✅' : '❌'}${g.isDefault ? ' ⭐' : ''}`,
            `admin:ab:edit:${g.name}`,
        ),
    ])

    buttons.push([Markup.button.callback('➕ Создать новую группу', 'admin:ab:create')])
    buttons.push([Markup.button.callback('⬅️ В админку', 'admin:main')])

    return Markup.inlineKeyboard(buttons)
}

/**
 * Keyboard for managing a specific group
 */
export const abEditKeyboard = (groupName: string, isActive: boolean, isDefault: boolean) => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('💰 Изменить цену', `admin:ab:price:${groupName}`),
            Markup.button.callback(
                isActive ? '🔴 Выключить' : '🟢 Включить',
                `admin:ab:toggle:${groupName}`,
            ),
        ],
        [
            Markup.button.callback(
                isDefault ? '⭐ Основная' : '📁 Сделать основной',
                `admin:ab:default:${groupName}`,
            ),
            Markup.button.callback('🗑 Удалить', `admin:ab:delete:${groupName}`),
        ],
        [Markup.button.callback('⬅️ К списку групп', 'admin:ab:list')],
    ])
}
