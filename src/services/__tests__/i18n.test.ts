import { describe, it, expect, vi, beforeEach } from 'vitest'
import { i18n } from '../i18n.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('I18nService', () => {
    it('should return Russian string by default', () => {
        const text = i18n.t('ru', 'buttons.get_analysis')
        expect(text).toBe('📊 Получить анализ')
    })

    it('should return English string when requested', () => {
        const text = i18n.t('en', 'buttons.get_analysis')
        expect(text).toBe('📊 Get Analysis')
    })

    it('should interpolate parameters', () => {
        const textRu = i18n.t('ru', 'messages.welcome_back', { name: 'Иван' })
        expect(textRu).toBe('🏔️ С возвращением, Иван! Готов стать выше сегодня?')

        const textEn = i18n.t('en', 'messages.welcome_back', { name: 'John' })
        expect(textEn).toBe('🏔️ Welcome back, John! Ready to grow taller today?')
    })

    it('should return key if path is not found', () => {
        const text = i18n.t('ru', 'non.existent.key')
        expect(text).toBe('non.existent.key')
    })

    it('should fallback to russian if language is null or undefined', () => {
        const textNull = i18n.t(null, 'buttons.get_analysis')
        expect(textNull).toBe('📊 Получить анализ')

        const textUndef = i18n.t(undefined, 'buttons.get_analysis')
        expect(textUndef).toBe('📊 Получить анализ')
    })

    it('should fallback to russian if language is not supported', () => {
        const text = i18n.t('es' as any, 'buttons.get_analysis')
        expect(text).toBe('📊 Получить анализ')
    })
})
