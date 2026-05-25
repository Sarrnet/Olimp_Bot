import { describe, it, expect } from 'vitest'
import { validators } from '../validators.js'

describe('validators', () => {
    it('should validate correct age', () => {
        const res = validators.validate('age', '25', 'number')
        expect(res.isValid).toBe(true)
    })

    it('should reject invalid age', () => {
        const res = validators.validate('age', '3', 'number')
        expect(res.isValid).toBe(false)
        expect(res.errorMessage).toContain('от 5 до 100 лет')
    })

    it('should validate correct height', () => {
        const res = validators.validate('current_height_cm', '180', 'number')
        expect(res.isValid).toBe(true)
    })

    it('should reject invalid height', () => {
        const res = validators.validate('current_height_cm', '280', 'number')
        expect(res.isValid).toBe(false)
        expect(res.errorMessage).toContain('от 50 до 250')
    })

    it('should reject non-numeric input for numbers', () => {
        const res = validators.validate('age', 'abc', 'number')
        expect(res.isValid).toBe(false)
        expect(res.errorMessage).toBe('Пожалуйста, введите числовое значение.')
    })

    it('should reject empty text', () => {
        const res = validators.validate('name', '   ', 'text')
        expect(res.isValid).toBe(false)
        expect(res.errorMessage).toBe('Пожалуйста, введите корректный текст.')
    })
})
