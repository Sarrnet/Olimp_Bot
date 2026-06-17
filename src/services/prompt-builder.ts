import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { UserProfile } from '../types/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface AnalysisPromptTemplate {
    prompt_id: string
    role: string
    language: string
    input_description: {
        type: string
        source?: string
        fields: string[]
        [key: string]: any
    }
    core_instructions: string[]
    interpretation_logic: string[]
    critical_bias_rules: string[]
    response_structure: any
    tone: string[]
    [key: string]: any
}

export class PromptBuilder {
    private templateCache: Record<string, any> = {}
  
    private getTemplate(lang: string = 'ru'): AnalysisPromptTemplate {
        if (this.templateCache[lang]) {
            return this.templateCache[lang]
        }

        const promptPath = path.join(__dirname, `../data/analysis_prompt.${lang}.json`)
        const rawData = fs.readFileSync(promptPath, 'utf-8')
        
        // Полностью изолируем JSON от строгого сканирования компилятора
        const parsed = JSON.parse(rawData) as unknown
        this.templateCache[lang] = parsed as any
        
        return this.templateCache[lang] as AnalysisPromptTemplate
    }

    buildSystemPrompt(lang: string = 'ru'): string {
        const template = this.getTemplate(lang)
        
        const coreInstructions = Array.isArray(template.core_instructions) ? template.core_instructions : []
        const interpretationLogic = Array.isArray(template.interpretation_logic) ? template.interpretation_logic : []
        const criticalBiasRules = Array.isArray(template.critical_bias_rules) ? template.critical_bias_rules : []
        const tone = Array.isArray(template.tone) ? template.tone : []

        return `
Role: ${template.role || 'system'}
Language: ${template.language || lang}

Core Instructions:
${coreInstructions.map((i) => `- ${i}`).join('\n')}

Interpretation Logic:
${interpretationLogic.map((l) => `- ${l}`).join('\n')}

Critical Bias Rules:
${criticalBiasRules.map((r) => `- ${r}`).join('\n')}

Tone: ${tone.join(', ')}

Response Structure:
You MUST respond with a valid JSON object matching this structure:
${JSON.stringify(template.response_structure || {}, null, 2)}
`
    }

    buildUserMessage(profile: UserProfile, lang: string = 'ru'): string {
        const template = this.getTemplate(lang)
        const fields = template.input_description?.fields || []
        
        const userData = fields
            .map((field) => {
                const value = (profile as any)[field]
                return `${field}: ${value !== undefined ? value : 'Not provided'}`
            })
            .join('\n')

        return `Please analyze the following user profile data and provide the results in the requested JSON format:\n\n${userData}`
    }
}

export const promptBuilder = new PromptBuilder()
