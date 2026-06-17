export interface UserProfile {
    age: number
    gender: string
    current_height_cm: number
    childhood_height_relative: string
    dream_height_cm: number
    self_assessed_potential: string
    weight_kg: number
    shoe_size: number
    social_context: string
    sleep_hours: string
    sport_type: string
    training_hours_week?: number
    father_height_cm: number
    mother_height_cm: number
    paternal_tall_relatives: string
    late_growth_family: string
    growth_last_year: string
    puberty_timing: string
    acne_frequency: string
    current_growth_speed: string
}

export interface StructuredBlock {
    id: string
    title: string
    visibility: 'free' | 'paid' | 'partial'
    content?: string
    instructions?: string
    value?: string
    format?: string
}

export interface AnalysisResponse {
    intro_analysis: string | any
    structured_blocks: StructuredBlock[]
    closing_hook: string | any
}

export interface DailyGrowthApplied {
    water?: boolean
    sleep?: boolean
    exercise?: boolean
}

export interface UserGrowthLog {
    [date: string]: DailyGrowthApplied
}
declare module "*/data/analysis_prompt.ru.json" {
    const value: any;
    export default value;
}

declare module "*/data/analysis_prompt.en.json" {
    const value: any;
    export default value;
}
