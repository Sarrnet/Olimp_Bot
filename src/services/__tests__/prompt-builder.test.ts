import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PromptBuilder } from '../prompt-builder.js'
import { UserProfile } from '../../types/index.js'
import fs from 'fs'

const mockTemplate = {
    prompt_id: 'test_prompt',
    role: 'Test Expert',
    language: 'ru',
    input_description: {
        type: 'object',
        fields: ['age', 'gender'],
    },
    core_instructions: ['Inst 1', 'Inst 2'],
    interpretation_logic: ['Logic 1'],
    critical_bias_rules: ['Rule 1'],
    response_structure: { some: 'json' },
    tone: ['Professional'],
}

vi.mock('fs', () => ({
    default: {
        readFileSync: vi.fn().mockReturnValue(
            JSON.stringify({
                prompt_id: 'test_prompt',
                role: 'Test Expert',
                language: 'ru',
                input_description: {
                    type: 'object',
                    fields: ['age', 'gender'],
                },
                core_instructions: ['Inst 1', 'Inst 2'],
                interpretation_logic: ['Logic 1'],
                critical_bias_rules: ['Rule 1'],
                response_structure: { some: 'json' },
                tone: ['Professional'],
            }),
        ),
    },
}))

describe('PromptBuilder', () => {
    let builder: PromptBuilder

    beforeEach(() => {
        vi.clearAllMocks()
        ;(fs.readFileSync as any).mockReturnValue(JSON.stringify(mockTemplate))
        builder = new PromptBuilder()
    })

    it('should build a valid system prompt', () => {
        const prompt = builder.buildSystemPrompt()
        expect(prompt).toContain('Role: Test Expert')
        expect(prompt).toContain('Language: ru')
        expect(prompt).toContain('- Inst 1')
        expect(prompt).toContain('- Inst 2')
        expect(prompt).toContain('Response Structure:')
        expect(prompt).toContain('Professional')
    })

    it('should build a user message with provided profile fields', () => {
        const profile: Partial<UserProfile> = {
            age: 25,
            gender: 'male',
        }
        const message = builder.buildUserMessage(profile as UserProfile)
        expect(message).toContain('age: 25')
        expect(message).toContain('gender: male')
    })

    it('should handle missing fields in profile', () => {
        const profile: Partial<UserProfile> = {
            age: 25,
        }
        const message = builder.buildUserMessage(profile as UserProfile)
        expect(message).toContain('age: 25')
        expect(message).toContain('gender: Not provided')
    })
})
