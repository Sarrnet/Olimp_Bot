import { logger } from '../utils/logger.js'

interface ExchangeRates {
    [key: string]: number
}

class CurrencyService {
    private rates: ExchangeRates = {}
    private lastFetch: number = 0
    private readonly CACHE_DURATION = 4 * 60 * 60 * 1000 // 4 часа
    private readonly BUFFER = 1.02 // +2% buffer

    // Используем CDN для получения курсов (бесплатное API без ключа)
    private readonly BASE_URL =
        'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/rub.json'

    // Fallback rates (average values)
    private readonly FALLBACK_RATES: ExchangeRates = {
        uzs: 140,
        byn: 0.035,
        kzt: 5.2,
        uah: 0.45,
        usd: 0.011,
        rub: 1,
    }

    /**
     * Converts an amount from RUB to the target currency
     * @param amountRUB Amount in rubles
     * @param targetCurrency Target currency code (e.g., 'UZS')
     * @returns Converted amount with 2% buffer
     */
    async convertFromRUB(amountRUB: number, targetCurrency: string): Promise<number> {
        const currency = targetCurrency.toLowerCase()
        if (currency === 'rub') return amountRUB

        const rates = await this.getRates()
        const rate = rates[currency] || this.FALLBACK_RATES[currency]

        if (!rate) {
            logger.error(`No rate found for ${currency}, using 1:1 fallback`)
            return amountRUB * this.BUFFER
        }

        return Number((amountRUB * rate * this.BUFFER).toFixed(2))
    }

    private async getRates(): Promise<ExchangeRates> {
        const now = Date.now()
        if (now - this.lastFetch < this.CACHE_DURATION && Object.keys(this.rates).length > 0) {
            return this.rates
        }

        try {
            logger.info('Fetching fresh currency rates from fawazahmed0 API...')
            const response = await fetch(this.BASE_URL)
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)

            const data = (await response.json()) as any

            // Структура ответа: { "date": "...", "rub": { "usd": 0.011, "uzs": 140, ... } }
            if (data && data.rub) {
                this.rates = data.rub
                this.lastFetch = now
                logger.info('Currency rates updated successfully from CDN')
                return this.rates
            } else {
                throw new Error('Invalid API response structure')
            }
        } catch (error) {
            logger.error('Error fetching currency rates, using fallback:', error)
            return this.FALLBACK_RATES
        }
    }
}

export const currencyService = new CurrencyService()
