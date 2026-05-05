import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface Exercise {
    id: string
    name: string
    difficulty: 'easy' | 'medium' | 'hard'
    duration_range_sec: [number, number]
    how_to: string
    why_important: string
    tags: string[]
}

export interface WeeklyRule {
    week: number
    total_exercises_per_day_range: [number, number]
    max_easy: number
    max_medium: number
    max_hard: number
    duration_multiplier_range: [number, number]
    new_exercise_priority: 'high' | 'medium' | 'low'
}

export interface TrainingProgram {
    training_program_id: string
    language: string
    exercise_pool: Exercise[]
    weekly_rules: WeeklyRule[]
    daily_selection_algorithm: any
}

export function loadTrainingProgram(lang: string = 'ru'): TrainingProgram {
    const filePath = path.join(__dirname, `../data/training_program.${lang}.json`)
    const rawData = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(rawData)
}

export function getExercisePool(lang: string = 'ru'): Exercise[] {
    return loadTrainingProgram(lang).exercise_pool
}

export function getWeeklyRule(week: number, lang: string = 'ru'): WeeklyRule {
    const rules = loadTrainingProgram(lang).weekly_rules
    // If week > 4, we use week 4 rules (or loop back)
    const effectiveWeek = Math.min(week, rules.length)
    return rules.find((r) => r.week === effectiveWeek) || rules[rules.length - 1]
}
