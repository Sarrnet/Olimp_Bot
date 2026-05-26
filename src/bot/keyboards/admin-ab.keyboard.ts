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
            Markup.button.callback('💰 Изменить цены', `admin:ab:price_select:${groupName}`),
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
            {
                ...Markup.button.callback('🗑 Удалить', `admin:ab:delete:${groupName}`),
                style: 'danger',
            } as any,
        ],
        [Markup.button.callback('⬅️ К списку групп', 'admin:ab:list')],
    ])
}

/**
 * Keyboard for selecting which price parameter to edit
 */
export const abPriceSelectorKeyboard = (groupName: string) => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('1м: Цена', `admin:ab:param:${groupName}:price`),
            Markup.button.callback('1м: Старая', `admin:ab:param:${groupName}:oldPrice`),
            Markup.button.callback('1м: Crypto', `admin:ab:param:${groupName}:priceCrypto`),
            Markup.button.callback('1м: Stars', `admin:ab:param:${groupName}:priceStars`),
        ],
        [
            Markup.button.callback('3м: Цена', `admin:ab:param:${groupName}:price3`),
            Markup.button.callback('3м: Старая', `admin:ab:param:${groupName}:oldPrice3`),
            Markup.button.callback('3м: Crypto', `admin:ab:param:${groupName}:price3Crypto`),
            Markup.button.callback('3м: Stars', `admin:ab:param:${groupName}:price3Stars`),
        ],
        [
            Markup.button.callback('6м: Цена', `admin:ab:param:${groupName}:price6`),
            Markup.button.callback('6м: Старая', `admin:ab:param:${groupName}:oldPrice6`),
            Markup.button.callback('6м: Crypto', `admin:ab:param:${groupName}:price6Crypto`),
            Markup.button.callback('6м: Stars', `admin:ab:param:${groupName}:price6Stars`),
        ],
        [Markup.button.callback('⬅️ Назад к группе', `admin:ab:edit:${groupName}`)],
    ])
}
