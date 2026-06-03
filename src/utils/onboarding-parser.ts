import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export type OnboardingStepType = 'input' | 'choice' | 'choice_with_custom' | 'cta'

export interface OnboardingStep {
    id: string
    type: OnboardingStepType
    question?: string
    input_type?: 'number' | 'text'
    options?: string[]
    content?: string
    button_text?: string
}

export interface OnboardingData {
    onboarding_id: string
    language: string
    intro_message: {
        type: string
        content: string
    }
    steps: OnboardingStep[]
    output_schema: {
        type: string
        description: string
        fields: string[]
    }
}

const cache: Record<string, OnboardingData> = {}

export function loadOnboardingData(lang: string = 'ru'): OnboardingData {
  if (cache[lang]) {
    return cache[lang];
  }
  
  const filePath = path.join(__dirname, `../data/onboarding.${lang}.json`)
  const rawData = fs.readFileSync(filePath, 'utf-8')
  cache[lang] = JSON.parse(rawData)
  
  return cache[lang];
}

export function getOnboardingSteps(lang: string = 'ru'): OnboardingStep[] {
    const data = loadOnboardingData(lang)
    return data.steps
}
