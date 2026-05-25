import axios from 'axios'
import { createHash, createHmac } from 'crypto'
import { logger } from '../utils/logger.js'

export interface CryptoInvoiceParams {
    userId: string
    amount: string
    currency: string
    days: number
}

export class CryptoPayService {
    private readonly apiUrl: string
    private readonly token: string

    constructor() {
        this.apiUrl = process.env.CRYPTO_PAY_API_URL || 'https://pay.crypt.bot/api'
        this.token = process.env.CRYPTO_PAY_TOKEN || ''
    }

    async createInvoice(params: CryptoInvoiceParams) {
        try {
            const response = await axios.post(
                `${this.apiUrl}/createInvoice`,
                {
                    asset: params.currency,
                    amount: params.amount,
                    description: `Subscription for ${params.days} days`,
                    payload: JSON.stringify({
                        userId: params.userId,
                        days: params.days,
                        type: 'subscription',
                    }),
                    paid_btn_name: 'openBot',
                    paid_btn_url: `https://t.me/${process.env.BOT_USERNAME || 'bot'}`,
                },
                {
                    headers: {
                        'Crypto-Pay-API-Token': this.token,
                    },
                },
            )

            if (!response.data.ok) {
                throw new Error(response.data.error.name || 'Unknown Crypto Pay Error')
            }

            return response.data.result
        } catch (error: any) {
            logger.error('CryptoPay createInvoice Error:', error.response?.data || error.message)
            throw error
        }
    }

    verifySignature(rawBody: string, signature: string): boolean {
        const secret = createHash('sha256').update(this.token).digest()
        const hmac = createHmac('sha256', secret).update(rawBody).digest('hex')
        return hmac === signature
    }
}

export const cryptoPayService = new CryptoPayService()
