import { describe, it, expect } from 'vitest'
import { formatAnalysisForUser } from '../formatters.js'
import { AnalysisResponse } from '../../types/index.js'

const mockAnalysis: AnalysisResponse = {
    intro_analysis: 'Intro text',
    structured_blocks: [
        { id: 'block1', title: 'Free Block', visibility: 'free', content: 'Free content' },
        { id: 'block2', title: 'Paid Block', visibility: 'paid', content: 'Paid content' },
        {
            id: 'block3',
            title: 'Partial Block',
            visibility: 'partial',
            content: 'Partial content with very long string to test teaser logic'.repeat(5),
        },
    ],
    closing_hook: 'Closing text',
}

describe('formatAnalysisForUser', () => {
    it('should show all content for paid user', () => {
        const result = formatAnalysisForUser(mockAnalysis, true)
        expect(result).toContain('Free content')
        expect(result).toContain('Paid content')
        expect(result).toContain('Partial content with very long string')
        expect(result).not.toContain('Оставшаяся часть доступна в полной версии')
        expect(result).not.toContain('💳 **Получите полный доступ')
    })

    it('should hide paid content and show teaser for free user', () => {
        const result = formatAnalysisForUser(mockAnalysis, false)
        expect(result).toContain('Free content')
        expect(result).toContain('<i>🔒 Доступно в полной версии</i>')
        expect(result).not.toContain('Paid content')
        expect(result).toContain('🔒 Оставшаяся часть доступна в полной версии')
        expect(result).toContain('разблокировать полный доступ')
    })

    it('should format message with intro and closing hook', () => {
        const result = formatAnalysisForUser(mockAnalysis, false)
        expect(result).toContain('Intro text')
        expect(result).toContain('Closing text')
    })
})
