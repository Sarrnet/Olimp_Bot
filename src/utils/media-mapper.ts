import path from 'path'
import { fileURLToPath } from 'url'

import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Robust path resolution for both dev (src/utils) and prod (dist/utils)
const getPicturesDir = () => {
    // 1. Try production path (dist/exercises pictures)
    const prodPath = path.resolve(__dirname, '../../exercises pictures/')
    if (fs.existsSync(prodPath)) return prodPath

    // 2. Try development path (relative to src)
    const devPath = path.resolve(__dirname, '../../../exercises pictures/')
    if (fs.existsSync(devPath)) return devPath

    return prodPath // Fallback
}

const PICTURES_DIR = getPicturesDir()

const exerciseImageMap: Record<string, string> = {
    cobra_stretch: 'Расстяжка кобра.jpg',
    downward_dog: 'Downward dog.jpg',
    twisting_leg_throws: 'Броски ног из скручивания.jpg',
    seated_forward_fold: 'Растяжка спины вперед.jpg',
    elbows_back: 'Локти назад.jpg',
    lunge_stretch: 'растяжка выпадом.jpg',
    squat_jumps: 'Прыжки на корточках.jpg',
    calf_stretch: 'Растяжка икр.jpg',
    superman: 'Супермен.jpg',
    v_up: 'Уголок.jpg',
    standing_forward_fold: 'Наклоны вперед.jpg',
    supine_spinal_twist: 'Supine_Spinal_Twist_Лежачий_поворот_позвоночника.jpg',
    hanging_wipers: 'Hanging Windshield Wipers (Дворники в висе).jpg',
    quad_stretch: 'Standing Hamstring Stretch.jpg', // Closest match available
    hanging_leg_raises: 'Hanging Leg Raises.jpg',
    dead_hang: 'DEAD HANG.jpg',
    warrior_pose: 'WARRIOR POSE.jpg',
    thread_the_needle: 'THREAD AND NEEDLE.jpg',
    camel_pose: 'CAMEL POSE.jpg',
    bridge_pose: 'BRIDGE POSE1.jpg',
}

export function getExerciseImagePath(exerciseId: string): string | null {
    const fileName = exerciseImageMap[exerciseId]
    if (!fileName) return null
    return path.join(PICTURES_DIR, fileName)
}
