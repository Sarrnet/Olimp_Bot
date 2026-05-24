import { i18n } from '../services/i18n.js'

export interface ValidationResult {
    isValid: boolean
    errorMessage?: string
}

export const validators = {
    isNumber(text: string, lang: string = 'ru'): ValidationResult {
        const num = parseInt(text, 10)
        if (isNaN(num)) {
            return { isValid: false, errorMessage: i18n.t(lang, 'validation.not_number') }
        }
        return { isValid: true }
    },

    validateRange(id: string, value: number, lang: string = 'ru'): ValidationResult {
        if (id === 'age' && (value < 5 || value > 100)) {
            return {
                isValid: false,
                errorMessage: i18n.t(lang, 'validation.invalid_age'),
            }
        }

        const heightFields = [
            'current_height_cm',
            'dream_height_cm',
            'father_height_cm',
            'mother_height_cm',
        ]
        if (heightFields.includes(id) && (value < 50 || value > 250)) {
            return {
                isValid: false,
                errorMessage: i18n.t(lang, 'validation.invalid_height'),
            }
        }

        if (id === 'weight_kg' && (value < 10 || value > 300)) {
            return {
                isValid: false,
                errorMessage: i18n.t(lang, 'validation.invalid_weight'),
            }
        }

        if (id === 'shoe_size' && (value < 10 || value > 60)) {
            return {
                isValid: false,
                errorMessage: i18n.t(lang, 'validation.invalid_shoe_size'),
            }
        }

        return { isValid: true }
    },

    validate(
        id: string,
        text: string,
        type?: 'number' | 'text',
        lang: string = 'ru',
    ): ValidationResult {
        if (type === 'number') {
            const numCheck = this.isNumber(text, lang)
            if (!numCheck.isValid) return numCheck

            const num = parseInt(text, 10)
            return this.validateRange(id, num, lang)
        }

        if (!text.trim()) {
            return { isValid: false, errorMessage: i18n.t(lang, 'validation.invalid_text') }
        }

        return { isValid: true }
    },
}
