import { Telegraf, Markup } from 'telegraf';
import { MyContext } from '../context.js';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../utils/logger.js';

/**
 * Регистрация обработчиков оплаты (Boosty и другие)
 */
export function registerPaymentHandlers(bot: Telegraf<MyContext>) {

    // 1. Промежуточный шаг с предупреждением
    bot.action(/^pay:boosty$/, async (ctx) => {
        try {
            await ctx.answerCbQuery().catch(() => {})

            const warningMessage =
                '⚠️ <b>ОЧЕНЬ ВАЖНО!!!</b>\n\n' +
                'Оплачивайте подписку через браузерную версию, приложение на айфон часто увеличивает цену в несколько раз.\n\n' +
                'Выдача происходит автоматически.'

            await ctx.reply(warningMessage, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('Понятно, перейти к оплате', 'pay:boosty:confirm')],
                ]),
            })
        } catch (error) {
            logger.error('Error in pay:boosty warning action:', error)
            await ctx.reply('Извините, произошла ошибка.')
        }
    })

    // 2. Подтверждение и выдача ссылки
    bot.action('pay:boosty:confirm', async (ctx) => {
        try {
            await ctx.answerCbQuery().catch(() => {})

            // Ссылка на вашу страницу Boosty (желательно хранить в .env)
            const boostyUrl = process.env.BOOSTY_URL || 'https://boosty.to/YOUR_PAGE'

            const message =
                '🌍 <b>Оплата через Boosty</b>\n\n' +
                '1. Перейдите на нашу страницу Boosty по кнопке ниже и оформите подписку.\n\n' +
                '2. После оплаты Boosty предложит вам привязать Telegram и добавит в наш закрытый VIP-канал.\n\n' +
                '3. <b>Как только вы вступите в канал, этот бот автоматически активирует ваш полный доступ!</b>'

            await ctx.reply(message, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([[Markup.button.url('Перейти на Boosty', boostyUrl)]]),
            })
        } catch (error) {
            logger.error('Error in pay:boosty:confirm action:', error)
            await ctx.reply('Извините, произошла ошибка при подготовке ссылки на Boosty.')
        }
    })

    // 3. Обработчик события chat_member для автоматической активации/деактивации
    bot.on('chat_member', async (ctx) => {
        try {
            const chatMember = ctx.chatMember;
            const boostyChannelId = process.env.BOOSTY_CHANNEL_ID;

            // Проверяем, что событие пришло именно из канала Boosty
            if (!boostyChannelId || String(ctx.chat.id) !== String(boostyChannelId)) {
                return;
            }

            const userId = chatMember.new_chat_member.user.id;
            const newStatus = chatMember.new_chat_member.status;
            const telegramId = BigInt(userId);

            if (newStatus === 'member' || newStatus === 'administrator' || newStatus === 'creator') {
                // ПОЛЬЗОВАТЕЛЬ ВСТУПИЛ (ОПЛАТИЛ)
                await prisma.user.update({
                    where: { telegramId },
                    data: { paid: true }
                });

                await ctx.telegram.sendMessage(userId,
                    "🎉 <b>Оплата через Boosty подтверждена!</b>\n\n" +
                    "Полный доступ к боту и индивидуальной программе тренировок активирован.",
                    { parse_mode: 'HTML' }
                ).catch(err => logger.error(`Failed to send success message to user ${userId}:`, err));

                logger.info(`Access GRANTED to user ${userId} via Boosty channel membership.`);
            }
            else if (newStatus === 'left' || newStatus === 'kicked') {
                // ПОЛЬЗОВАТЕЛЬ ВЫШЕЛ (ОТПИСАЛСЯ)

                // Проверяем, нет ли у пользователя другой активной подписки (например, купленной за звезды/крипту)
                const user = await prisma.user.findUnique({ where: { telegramId } });
                if (user && user.subscriptionExpiry && user.subscriptionExpiry > new Date()) {
                    logger.info(`User ${userId} left Boosty channel but has active subscription until ${user.subscriptionExpiry}. Access not revoked.`);
                    return;
                }

                await prisma.user.update({
                    where: { telegramId },
                    data: { paid: false }
                });

                await ctx.telegram.sendMessage(userId,
                    "💔 <b>Подписка Boosty завершена</b>\n\n" +
                    "Вы покинули закрытый канал, поэтому доступ к премиум-функциям бота приостановлен. Вы всегда можете вернуться!",
                    { parse_mode: 'HTML' }
                ).catch(err => logger.error(`Failed to send loss message to user ${userId}:`, err));

                logger.info(`Access REVOKED for user ${userId} (left Boosty channel).`);
            }
        } catch (error) {
            logger.error('Error in Boosty chat_member observer:', error);
        }
    });
}
