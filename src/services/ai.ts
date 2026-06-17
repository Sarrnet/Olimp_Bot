import { Mistral } from '@mistralai/mistralai'
import { UserProfile, AnalysisResponse } from '../types/index.js'
import { promptBuilder } from './prompt-builder.js'
import { logger } from '../utils/logger.js'

const apiKey = process.env.AI_API_KEY
const modelName = process.env.AI_MODEL || 'mistral-small-latest'

if (!apiKey) {
    logger.warn('AI_API_KEY (Mistral) is not defined in .env')
} else {
    const maskedKey =
        apiKey.length > 8
            ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
            : '***'
    logger.info(`Mistral AI Service: initialized with model ${modelName} and key ${maskedKey}`)
}

const client = new Mistral({
    apiKey: apiKey || '',
})

export class AiService {
    async analyze(profile: UserProfile, lang: string = 'ru'): Promise<AnalysisResponse> {
        try {
            logger.info(`Starting Mistral analysis using model ${modelName}...`)

            const systemPrompt = promptBuilder.buildSystemPrompt(lang)
            const userMessage = promptBuilder.buildUserMessage(profile, lang)

            const response = await client.chat.complete({
                model: modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    {
                        role: 'user',
                        content:
                            userMessage +
                            '\n\nIMPORTANT: You must return a valid JSON object. Do not include any markdown backticks or preamble.',
                    },
                ],
                responseFormat: { type: 'json_object' },
                temperature: 0.5, 
                maxTokens: 4000   
            })

            const content = response.choices?.[0]?.message?.content

            if (typeof content !== 'string') {
                logger.error('Empty response content from Mistral API')
                throw new Error('Empty response from AI')
            }

            const cleanContent = content
                .replace(/```json\n?/, '')
                .replace(/\n?```/, '')
                .trim()

            try {
                const parsedResponse = JSON.parse(cleanContent) as AnalysisResponse
                logger.info('Mistral analysis completed successfully.')
                return parsedResponse
            } catch (parseError) {
                logger.error('Failed to parse Mistral JSON response. Raw content:', cleanContent)
                throw new Error('Invalid JSON response from AI')
            }
        } catch (error: any) {
            logger.error(`Mistral Service Error:`, error.message || error)
            throw error
        }
    }

export const aiService = new AiService()
