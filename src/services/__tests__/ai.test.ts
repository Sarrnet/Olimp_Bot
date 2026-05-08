import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AiService } from '../ai'
import { UserProfile } from '../../types/index.js'

const { mockChatComplete } = vi.hoisted(() => ({
    mockChatComplete: vi.fn(),
}))

vi.mock('@mistralai/mistralai', () => {
    return {
        Mistral: class {
            chat = {
                complete: mockChatComplete,
            }
        },
    }
})

// Mock the prompt builder so we don't depend on actual data
vi.mock('../prompt-builder.js', () => ({
    promptBuilder: {
        buildSystemPrompt: () => 'Mock System',
        buildUserMessage: () => 'Mock User',
    },
}))

describe('AiService', () => {
    let service: AiService

    beforeEach(() => {
        vi.clearAllMocks()
        service = new AiService()
    })

    it('should analyze profile and return parsed JSON', async () => {
        const mockResponse = {
            choices: [{ message: { content: JSON.stringify({ result: 'success' }) } }],
        }
        mockChatComplete.mockResolvedValue(mockResponse)

        const result = await service.analyze({ age: 25 } as UserProfile)
        expect(result).toEqual({ result: 'success' })
        expect(mockChatComplete).toHaveBeenCalledWith(
            expect.objectContaining({
                model: expect.any(String),
                temperature: 0.7,
            }),
        )
    })

    it('should throw error if content is empty', async () => {
        const mockResponse = { choices: [{ message: { content: null } }] }
        mockChatComplete.mockResolvedValue(mockResponse)

        await expect(service.analyze({} as UserProfile)).rejects.toThrow('Empty response from AI')
    })

    it('should throw error if content is invalid JSON', async () => {
        const mockResponse = { choices: [{ message: { content: 'invalid json' } }] }
        mockChatComplete.mockResolvedValue(mockResponse)

        await expect(service.analyze({} as UserProfile)).rejects.toThrow(
            'Invalid JSON response from AI',
        )
    })

    it('should pass through Mistral API errors', async () => {
        mockChatComplete.mockRejectedValue(new Error('Mistral Failure'))

        await expect(service.analyze({} as UserProfile)).rejects.toThrow('Mistral Failure')
    })
})
