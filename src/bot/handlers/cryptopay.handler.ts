import { Request, Response } from 'express'
import { cryptoPayService } from '../../services/cryptopay.js'
import { prisma, Prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'
import { Telegraf } from 'telegraf'
import { MyContext } from '../context.js'
import { i18n } from '../../services/i18n.js'

export async function handleCryptoPayWebhook(
    req: Request,
    res: Response,
    bot: Telegraf<MyContext>,
) {
    const signature = req.headers['crypto-pay-api-signature'] as string
    const rawBody = (req as any).rawBody?.toString()

    if (!signature || !rawBody) {
        logger.warn('CryptoPay Webhook: Missing signature or rawBody')
        return res.status(400).send('Bad Request')
    }

    if (!cryptoPayService.verifySignature(rawBody, signature)) {
        logger.warn('CryptoPay Webhook: Invalid signature')
        return res.status(401).send('Unauthorized')
    }

    const data = req.body
    if (data.update_type === 'invoice_paid') {
        const invoice = data.payload
        const payload = JSON.parse(invoice.payload)
        const { userId, days } = payload
        const invoiceId = invoice.invoice_id.toString()

        try {
            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                // Idempotency check
                const existingPayment = await tx.payment.findUnique({
                    where: { providerInvoiceId: invoiceId },
                })

                if (existingPayment && existingPayment.status === 'PAID') {
                    return
                }

                const user = await tx.user.findUnique({ where: { id: userId } })
                if (!user) {
                    throw new Error(`User ${userId} not found`)
                }

                let newExpiry = new Date()
                if (user.subscriptionExpiry && user.subscriptionExpiry > new Date()) {
                    newExpiry = new Date(
                        user.subscriptionExpiry.getTime() + days * 24 * 60 * 60 * 1000,
                    )
                } else {
                    newExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
                }

                // Update or create payment record
                await tx.payment.upsert({
                    where: { providerInvoiceId: invoiceId },
                    create: {
                        userId,
                        provider: 'CRYPTO_PAY',
                        providerInvoiceId: invoiceId,
                        amount: Math.round(parseFloat(invoice.amount) * 100), // Note: amount is in crypto units, this logic might need adjustment per asset
                        currency: invoice.asset,
                        status: 'PAID',
                        paidAt: new Date(),
                        payload: invoice,
                    },
                    update: {
                        status: 'PAID',
                        paidAt: new Date(),
                        payload: invoice,
                    },
                })

                // Update user access
                await tx.user.update({
                    where: { id: userId },
                    data: {
                        paid: true,
                        paymentDate: new Date(),
                        subscriptionExpiry: newExpiry,
                        lastPaymentProvider: 'crypto_pay',
                        analysisImageFileId: null,
                    },
                })

                // Notify user
                const lang = user.language || 'ru'
                await bot.telegram.sendMessage(
                    Number(user.telegramId),
                    `✅ ${i18n.t(lang, 'messages.payment_success')}\n\n🏔️ Expiry: <b>${newExpiry.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')}</b>`,
                    { parse_mode: 'HTML' },
                )
            })
            logger.info(`CryptoPay: Payment processed for user ${userId}, invoice ${invoiceId}`)
        } catch (error) {
            logger.error('CryptoPay Webhook Processing Error:', error)
            return res.status(500).send('Internal Server Error')
        }
    }

    res.status(200).send('OK')
}
