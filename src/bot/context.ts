import { Context, Scenes } from 'telegraf'
import { User, AbConfig } from '../db/prisma.js'

export interface MyWizardSession extends Scenes.WizardSessionData {
    answers: Record<string, string | number>
}

/**
 * A single unit of content to broadcast. Text is sent as an HTML message;
 * media kinds carry a Telegram `fileId` (already uploaded to Telegram once,
 * then reused across all recipients — no per-user upload).
 */
export type BroadcastKind =
    | 'text'
    | 'photo'
    | 'video'
    | 'video_note'
    | 'document'
    | 'voice'
    | 'audio'
    | 'animation'
    | 'sticker'

export interface BroadcastPayload {
    kind: BroadcastKind
    text?: string
    fileId?: string
    // Short caption attached to the media itself (Telegram limit: 1024 chars).
    caption?: string
    // Optional text message sent as a separate message right after the media.
    // Used for long texts that do not fit into a caption (limit: 4096 chars).
    followupText?: string
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
    broadcastState?: {
        step: 'await_content' | 'await_followup' | 'await_confirm'
        payload?: BroadcastPayload
    }
    healthState?: {
        type: 'wait_water' | 'wait_sleep' | 'wait_weight'
    }
    commandsSet?: boolean
    isGeneratingAnalysis?: boolean
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
