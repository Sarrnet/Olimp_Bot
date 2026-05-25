import { prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'
import { MyContext } from '../context.js'
import { i18n } from '../../services/i18n.js'

export async function handleTributeChatMember(ctx: MyContext) {
    const update = ctx.chatMember
    if (!update) return

    const channelId = update.chat.id.toString()
    const TARGET_CHANNEL_ID = process.env.TRIBUTE_PROXY_CHANNEL_ID

    if (channelId !== TARGET_CHANNEL_ID) return

    const telegramId = update.new_chat_member.user.id
    const oldStatus = update.old_chat_member.status
    const newStatus = update.new_chat_member.status

    // Check if user joined (status change from 'left' or 'kicked' to 'member')
    if ((oldStatus === 'left' || oldStatus === 'kicked') && newStatus === 'member') {
        logger.info(`Tribute: User ${telegramId} joined proxy channel`)

        try {
            const user = await prisma.user.findUnique({
                where: { telegramId: BigInt(telegramId) },
            })

            if (!user) {
                logger.warn(`Tribute: User with telegramId ${telegramId} not found in DB`)
                return
            }

            // Standard duration for Tribute (e.g. 30 days)
            const days = 30
            let newExpiry = new Date()
            if (user.subscriptionExpiry && user.subscriptionExpiry > new Date()) {
                newExpiry = new Date(user.subscriptionExpiry.getTime() + days * 24 * 60 * 60 * 1000)
            } else {
                newExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
            }

            await prisma.$transaction(async (tx) => {
                // Create payment record
                await tx.payment.create({
                    data: {
                        userId: user.id,
                        provider: 'TRIBUTE',
                        providerInvoiceId: `tribute_${telegramId}_${Date.now()}`,
                        amount: 0, // Tribute channel joins don't provide exact amount easily
                        currency: 'N/A',
                        status: 'PAID',
                        paidAt: new Date(),
                    },
                })

                await tx.user.update({
                    where: { id: user.id },
                    data: {
                        paid: true,
                        paymentDate: new Date(),
                        subscriptionExpiry: newExpiry,
                        lastPaymentProvider: 'tribute',
                        analysisImageFileId: null,
                    },
                })
            })

            const lang = user.language || 'ru'
            await ctx.telegram.sendMessage(
                telegramId,
                `✅ ${i18n.t(lang, 'messages.payment_success')}\n\n🏔️ Expiry: <b>${newExpiry.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')}</b>`,
                { parse_mode: 'HTML' }
            )

            // Optional: Kick user from proxy channel to allow future triggers
            // await ctx.telegram.banChatMember(channelId, telegramId)
            // await ctx.telegram.unbanChatMember(channelId, telegramId)

        } catch (error) {
            logger.error('Tribute processing error:', error)
        }
    }
}
