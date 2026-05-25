declare module 'telegraf-ratelimit' {
    import { Middleware } from 'telegraf'

    interface LimitConfig {
        window?: number
        limit?: number
        onLimitExceeded?: (ctx: any, next: () => Promise<void>) => void
        keyGenerator?: (ctx: any) => number | string
    }

    function ratelimit(config: LimitConfig): Middleware<any>
    export default ratelimit
}
