import { MyContext } from '../bot/context.js'
import { PAYMENT_PROVIDERS } from '../config/payments.config.js'
import crypto from 'crypto'

export interface InvoiceParams {
    title: string
    description: string
    amount: number // In minor units (e.g. 69900 for 699.00 RUB)
    currency: string
    days: number // Number of subscription days (30, 90, 180)
}

/**
 * Sends a Telegram Invoice using the specified provider.
 */
export async function sendInvoice(ctx: MyContext, params: InvoiceParams, providerId: string) {
    const provider = PAYMENT_PROVIDERS[providerId]

    if (!provider) {
        throw new Error(`Payment provider ${providerId} not found in config`)
    }

    const isStars = providerId === 'telegram_stars' || params.currency === 'XTR'

    if (!isStars && !provider.token) {
        throw new Error(`Token for provider ${providerId} is not defined in .env`)
    }

    const idempotencyKey = crypto.randomUUID()

    // Format payload: type:userId:providerId:days:idempotencyKey
    const payload = `sub:${ctx.from?.id}:${providerId}:${params.days}:${idempotencyKey}`

    return ctx.replyWithInvoice({
        title: params.title,
        description: params.description,
        payload: payload,
        provider_token: isStars ? '' : provider.token!,
        currency: params.currency,
        prices: [{ label: params.title, amount: Math.round(params.amount) }],
        start_parameter: `sub-${params.days}d`,
        provider_data: JSON.stringify({ idempotency_key: idempotencyKey }),
    })
}
