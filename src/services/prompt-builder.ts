import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { UserProfile } from '../types/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface AnalysisPromptTemplate {
    prompt_id: string
    role: string
    language: string
    input_description: {
        type: string
        source?: string // <-- ДОБАВЬТЕ ЭТУ СТРОКУ, она спасет от ошибки с 'source'!
        fields: string[]
    }
    core_instructions: string[]
    interpretation_logic: string[]
    critical_bias_rules: string[]
    response_structure: any
    tone: string[]
}

export class PromptBuilder {
    private templateCache: Record<string, any> = {}
  
    private getTemplate(lang: string = 'ru'): AnalysisPromptTemplate {
        if (this.templateCache[lang]) {
            return this.templateCache[lang]
        }

        const promptPath = path.join(__dirname, `../data/analysis_prompt.${lang}.json`)
        const rawData = fs.readFileSync(promptPath, 'utf-8')
        
        // Двойное приведение типов (as unknown as any) полностью отключает 
        // строгую валидацию структуры JSON на этапе компиляции проекта.
        const parsed = JSON.parse(rawData) as unknown
        this.templateCache[lang] = parsed as any
        
        return this.templateCache[lang] as AnalysisPromptTemplate
    }

    buildSystemPrompt(lang: string = 'ru'): string {
        const template = this.getTemplate(lang)
        return `
Role: ${template.role}
Language: ${template.language}

Core Instructions:
${template.core_instructions.map((i) => `- ${i}`).join('\n')}

Interpretation Logic:
${template.interpretation_logic.map((l) => `- ${l}`).join('\n')}

Critical Bias Rules:
${template.critical_bias_rules.map((r) => `- ${r}`).join('\n')}

Tone: ${template.tone.join(', ')}

Response Structure:
You MUST respond with a valid JSON object matching this structure:
${JSON.stringify(template.response_structure, null, 2)}
`
    }

    buildUserMessage(profile: UserProfile, lang: string = 'ru'): string {
        const template = this.getTemplate(lang)
        const fields = template.input_description.fields
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
