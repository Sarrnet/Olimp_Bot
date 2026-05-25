import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TrainingGenerator } from '../training.js'
import { prisma } from '../../db/prisma.js'
import * as trainingParser from '../../utils/training-parser.js'

vi.mock('../../db/prisma.js', () => ({
    prisma: {
        trainingSession: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
        },
    },
}))

vi.mock('../../utils/training-parser.js', () => ({
    getExercisePool: vi.fn(),
    getWeeklyRule: vi.fn(),
}))

const mockExercises = [
    {
        id: 'ex1',
        name: 'Ex 1',
        difficulty: 'easy',
        duration_range_sec: [30, 60],
        tags: ['decompression'],
    },
    { id: 'ex2', name: 'Ex 2', difficulty: 'easy', duration_range_sec: [30, 60], tags: ['core'] },
    {
        id: 'ex3',
        name: 'Ex 3',
        difficulty: 'easy',
        duration_range_sec: [30, 60],
        tags: ['posture'],
    },
    {
        id: 'ex4',
        name: 'Ex 4',
        difficulty: 'medium',
        duration_range_sec: [30, 60],
        tags: ['other'],
    },
    { id: 'ex5', name: 'Ex 5', difficulty: 'hard', duration_range_sec: [30, 60], tags: ['other'] },
]

const mockRuleWeek1 = {
    week: 1,
    total_exercises_per_day_range: [3, 4],
    max_easy: 3,
    max_medium: 1,
    max_hard: 0,
    duration_multiplier_range: [1, 1],
    new_exercise_priority: 'high',
}

describe('TrainingGenerator', () => {
    let generator: TrainingGenerator

    beforeEach(() => {
        vi.clearAllMocks()
        ;(trainingParser.getExercisePool as any).mockReturnValue(mockExercises)
        ;(trainingParser.getWeeklyRule as any).mockReturnValue(mockRuleWeek1)
        generator = new TrainingGenerator()
    })

    it('should pick correct number of exercises for week 1', async () => {
        ;(prisma.trainingSession.findFirst as any).mockResolvedValue(null)
        ;(prisma.trainingSession.findMany as any).mockResolvedValue([])

        const plan = await generator.getDailyPlan('user1', 1)
        expect(plan.exercises.length).toBeGreaterThanOrEqual(3)
        expect(plan.exercises.length).toBeLessThanOrEqual(4)
        expect(plan.week).toBe(1)
    })

    it('should always include decompression and core/posture tags', async () => {
        ;(prisma.trainingSession.findFirst as any).mockResolvedValue(null)
        ;(prisma.trainingSession.findMany as any).mockResolvedValue([])

        const plan = await generator.getDailyPlan('user1', 1)

        const hasDecompression = plan.exercises.some((ex) => ex.tags.includes('decompression'))
        const hasCoreOrPosture = plan.exercises.some(
            (ex) => ex.tags.includes('core') || ex.tags.includes('posture'),
        )

        expect(hasDecompression).toBe(true)
        expect(hasCoreOrPosture).toBe(true)
    })

    it('should not pick same exercises as last session', async () => {
        ;(prisma.trainingSession.findFirst as any).mockResolvedValue({
            exercises: ['ex1'],
        })
        ;(prisma.trainingSession.findMany as any).mockResolvedValue([])

        // With ex1 excluded, it must pick from others
        // ex1 has 'decompression' tag. If excluded, there are no other decompression exercises in mock pool.
        // Let's see if it handles it.
        // Wait, if no decompression exercises left, the algorithm skips it.

        const plan = await generator.getDailyPlan('user1', 1)
        expect(plan.exercises.find((ex) => ex.id === 'ex1')).toBeUndefined()
    })

    it('should respect difficulty limits', async () => {
        ;(prisma.trainingSession.findFirst as any).mockResolvedValue(null)
        ;(prisma.trainingSession.findMany as any).mockResolvedValue([])

        const plan = await generator.getDailyPlan('user1', 1)

        const easyCount = plan.exercises.filter((ex) => ex.difficulty === 'easy').length
        const mediumCount = plan.exercises.filter((ex) => ex.difficulty === 'medium').length
        const hardCount = plan.exercises.filter((ex) => ex.difficulty === 'hard').length

        expect(easyCount).toBeLessThanOrEqual(mockRuleWeek1.max_easy)
        expect(mediumCount).toBeLessThanOrEqual(mockRuleWeek1.max_medium)
        expect(hardCount).toBeLessThanOrEqual(mockRuleWeek1.max_hard)
    })
})
