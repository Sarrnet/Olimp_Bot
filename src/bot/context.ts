import { Context, Scenes } from 'telegraf'
import { User, AbConfig } from '../../generated/prisma/client.js'

export interface MyWizardSession extends Scenes.WizardSessionData {
    answers: Record<string, string | number>
}

export interface MySession extends Scenes.WizardSession<MyWizardSession> {
    trainingSession?: {
        currentExerciseIndex: number
        exercises: any[] // Store plan exercises with duration
        totalSteps: number
    }
    adminState?: {
        type: 'wait_price' | 'wait_group_name' | 'wait_group_price' | 'wait_group_param_value'
        groupName?: string
        param?: string
    }
    healthState?: {
        type: 'wait_water' | 'wait_sleep' | 'wait_weight'
    }
    commandsSet?: boolean
}

export interface MyContext extends Context {
    session: MySession
    scene: Scenes.SceneContextScene<MyContext, MyWizardSession>
    wizard: Scenes.WizardContextWizard<MyContext>
    language?: 'ru' | 'en'
    role?: 'USER' | 'ADMIN'
    abGroup?: string
    price?: number
    abConfig?: AbConfig | null
    user?: User
}
