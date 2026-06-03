import { prisma } from '../db/prisma.js'
import { getExercisePool, getWeeklyRule, Exercise } from '../utils/training-parser.js'

export interface DailyPlan {
    exercises: (Exercise & { duration: number })[]
    week: number
}

export class TrainingGenerator {
    async getDailyPlan(
        userId: string,
        programDay: number,
        lang: string = 'ru',
    ): Promise<DailyPlan> {
        const pool = getExercisePool(lang)
        const week = Math.ceil(programDay / 7)

        // Base rule: use rules for weeks 1-4. If week > 4, cap at 4 but increase intensity.
        const ruleIdx = Math.min(week, 4)
        const rule = getWeeklyRule(ruleIdx, lang)

        // Calculate dynamic intensity bonus for long-term progression (after week 4)
        // Add +0.05 to multiplier for every 4 weeks after the first month
        const longTermBonus = week > 4 ? Math.floor((week - 1) / 4) * 0.05 : 0

        // 1. Determine total exercises for today
        const [min, max] = rule.total_exercises_per_day_range
        const totalCount = Math.floor(Math.random() * (max - min + 1)) + min

        // 2. Fetch recent sessions to avoid same exercises tomorrow
        const recentSessions = await prisma.trainingSession.findMany({
            where: { userId },
            take: 30,
            orderBy: { date: 'desc' },
            select: { exercises: true },
        })
        const lastExercises =
            recentSessions.length > 0 ? (recentSessions[0].exercises as string[]) : []

        // 3. Collect seen exercises from recent history
        const seenExercises = new Set<string>()
        recentSessions.forEach((s: any) => {
            ;(s.exercises as string[]).forEach((id: string) => seenExercises.add(id))
        })

        // 4. Algorithm Selection
        let selected: Exercise[] = []
        let currentPool = [...pool].filter((e) => !lastExercises.includes(e.id))

        // Mandatory: decompression
        const decompressionPool = currentPool.filter((e) => e.tags.includes('decompression'))
        if (decompressionPool.length > 0) {
            const mandatory = this.pickRandom(decompressionPool)
            selected.push(mandatory)
            currentPool = currentPool.filter((e) => e.id !== mandatory.id)
        }

        // Mandatory: core or posture
        const corePosturePool = currentPool.filter(
            (e) => e.tags.includes('core') || e.tags.includes('posture'),
        )
        if (corePosturePool.length > 0) {
            const mandatory = this.pickRandom(corePosturePool)
            selected.push(mandatory)
            currentPool = currentPool.filter((e) => e.id !== mandatory.id)
        }

        // Prioritize new exercises if rule says so
        if (rule.new_exercise_priority === 'high' || rule.new_exercise_priority === 'medium') {
            currentPool.sort((a, b) => {
                const seenA = seenExercises.has(a.id) ? 1 : 0
                const seenB = seenExercises.has(b.id) ? 1 : 0
                return seenA - seenB
            })
        }

        // Fill the rest up to totalCount, respecting difficulty limits
        let easyCount = selected.filter((e) => e.difficulty === 'easy').length
        let mediumCount = selected.filter((e) => e.difficulty === 'medium').length
        let hardCount = selected.filter((e) => e.difficulty === 'hard').length

        while (selected.length < totalCount && currentPool.length > 0) {
            const candidate = currentPool[0] // Take from sorted currentPool
            currentPool.shift()

            let allowed = false
            if (candidate.difficulty === 'easy' && easyCount < rule.max_easy) allowed = true
            else if (candidate.difficulty === 'medium' && mediumCount < rule.max_medium)
                allowed = true
            else if (candidate.difficulty === 'hard' && hardCount < rule.max_hard) allowed = true

            if (allowed) {
                selected.push(candidate)
                if (candidate.difficulty === 'easy') easyCount++
                else if (candidate.difficulty === 'medium') mediumCount++
                else if (candidate.difficulty === 'hard') hardCount++
            }
        }

        // 5. Calculate durations
        const multiplier =
            Math.random() *
                (rule.duration_multiplier_range[1] - rule.duration_multiplier_range[0]) +
            rule.duration_multiplier_range[0] +
            longTermBonus

        const planWithDuration = selected.map((e) => {
            let duration = Math.floor(
                (Math.random() * (e.duration_range_sec[1] - e.duration_range_sec[0]) +
                    e.duration_range_sec[0]) *
                    multiplier,
            )
            // Hard limit from exercise pool
            duration = Math.max(
                e.duration_range_sec[0],
                Math.min(duration, e.duration_range_sec[1]),
            )
            return { ...e, duration }
        })

        return { exercises: planWithDuration, week }
    }

    private pickRandom<T>(arr: T[]): T {
        return arr[Math.floor(Math.random() * arr.length)]
    }
}

export const trainingGenerator = new TrainingGenerator()
