import { describe, it, expect, vi, beforeEach } from 'vitest'
import { currencyService } from '../currency.js'

describe('CurrencyService', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Reset internal state of the singleton for tests
        ;(currencyService as any).rates = {}
        ;(currencyService as any).lastFetch = 0

        // Mock global fetch
        global.fetch = vi.fn()
    })

    it('should convert RUB to UZS correctly with 2% buffer using API data', async () => {
        const mockRates = {
            rub: {
                uzs: 140,
                byn: 0.035,
            },
        }

        ;(global.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => mockRates,
        })

        const amountRUB = 1000
        // 1000 * 140 * 1.02 = 142800
        const result = await currencyService.convertFromRUB(amountRUB, 'UZS')
        expect(result).toBe(142800)
        expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('should use fallback rates when API call fails', async () => {
        ;(global.fetch as any).mockRejectedValue(new Error('API Down'))

        const amountRUB = 1000
        const result = await currencyService.convertFromRUB(amountRUB, 'BYN')
        // 1 RUB = 0.035 BYN (fallback), 1000 * 0.035 * 1.02 = 35.7
        expect(result).toBe(35.7)
    })

    it('should return same amount for RUB to RUB without calling API', async () => {
        const amountRUB = 1000
        const result = await currencyService.convertFromRUB(amountRUB, 'RUB')
        expect(result).toBe(1000)
        expect(global.fetch).not.toHaveBeenCalled()
    })
})
