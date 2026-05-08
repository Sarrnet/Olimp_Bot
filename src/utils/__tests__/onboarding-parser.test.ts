import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getOnboardingSteps } from '../onboarding-parser.js'
import fs from 'fs'

vi.mock('fs', () => ({
    default: {
        readFileSync: vi.fn().mockReturnValue(
            JSON.stringify({
                steps: [
                    { id: 'age', type: 'input', question: 'How old are you?' },
                    { id: 'gender', type: 'choice', options: ['Male', 'Female'] },
                    { id: 'custom', type: 'choice_with_custom', options: ['A', 'B'] },
                    { id: 'finish', type: 'cta', button_text: 'Go' },
                ],
            }),
        ),
    },
}))

describe('onboarding-parser', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should parse onboarding steps correctly', () => {
        const steps = getOnboardingSteps()
        expect(steps.length).toBe(4)
        expect(steps[0].id).toBe('age')
        expect(steps[1].type).toBe('choice')
        expect(steps[2].type).toBe('choice_with_custom')
        expect(steps[3].type).toBe('cta')
    })

    it('should include all required fields', () => {
        const steps = getOnboardingSteps()
        steps.forEach((step) => {
            expect(step.id).toBeDefined()
            expect(step.type).toBeDefined()
        })
    })
})
