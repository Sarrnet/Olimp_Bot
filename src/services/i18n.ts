import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export type Locale = 'ru' | 'en'

class I18nService {
    private locales: Record<Locale, any> = { ru: {}, en: {} }

    constructor() {
        this.loadLocales()
    }

    private loadLocales() {
        const ruPath = path.join(__dirname, '../locales/ru.json')
        const enPath = path.join(__dirname, '../locales/en.json')

        if (fs.existsSync(ruPath)) {
            this.locales.ru = JSON.parse(fs.readFileSync(ruPath, 'utf-8'))
        }
        if (fs.existsSync(enPath)) {
            this.locales.en = JSON.parse(fs.readFileSync(enPath, 'utf-8'))
        }
    }

    t(
        lang: Locale | string | undefined | null,
        key: string,
        params: Record<string, string | number> = {},
    ): string {
        const safeLang: Locale = (lang === 'en' ? 'en' : 'ru') as Locale
        const keys = key.split('.')
        let value = this.locales[safeLang]

        for (const k of keys) {
            value = value?.[k]
            if (value === undefined) break
        }

        if (typeof value !== 'string') {
            return key // Fallback to key if not found
        }

        let text = value
        for (const [pKey, pValue] of Object.entries(params)) {
            text = text.replace(new RegExp(`{${pKey}}`, 'g'), String(pValue))
        }

        return text
    }
}

export const i18n = new I18nService()
