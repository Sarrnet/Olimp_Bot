import { MiddlewareFn } from 'telegraf'
import { MyContext } from '../context.js'
import { prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'
import { abService } from '../../services/ab.service.js'
import { setupUserCommands } from '../commands.js'

export const userLoader = (): MiddlewareFn<MyContext> => {
    return async (ctx, next) => {
        if (!ctx.from) return next()

        const telegramId = BigInt(ctx.from.id)

        try {
            let user = await prisma.user.findUnique({
                where: { telegramId },
            })

            if (!user) {
                // Determine AB group for the new user
                let abGroup = await abService.getRandomActiveGroup()

                // Safety: if no groups exist at all, create group A
                const groups = await abService.getGroups()
                if (groups.length === 0) {
                    await abService.updateGroup('A', {
                        price: 990,
                        isActive: true,
                        isDefault: true,
                    })
                    abGroup = 'A'
                }

                user = await prisma.user.create({
                    data: {
                        telegramId: telegramId,
                        username: ctx.from.username,
                        firstName: ctx.from.first_name,
                        lastName: ctx.from.last_name,
                        language: ctx.from.language_code === 'ru' ? 'ru' : 'en',
                        abGroup: abGroup,
                    },
                })
                logger.info(
                    `New user registered via middleware: ${ctx.from.id} assigned to group ${abGroup}`,
                )

                // Setup initial commands for the new user
                await setupUserCommands(ctx.telegram, ctx.from.id, user.role === 'ADMIN')
            } else if (!user.abGroup) {
                // Ensure existing users without a group get one
                const abGroup = await abService.getRandomActiveGroup()
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: { abGroup: abGroup },
                })
                logger.info(`Existing user ${ctx.from.id} updated with group ${abGroup}`)
            }

            // Expose user data in context
            ctx.user = user
            ctx.language = (user.language as 'ru' | 'en') || 'ru'
            const isAdminUser =
                user.role === 'ADMIN' ||
                (process.env.ADMIN_IDS || '').split(',').includes(ctx.from.id.toString())
            ctx.role = isAdminUser ? 'ADMIN' : 'USER'
            ctx.abGroup = user.abGroup || 'A'

            // Fetch full pricing config
            ctx.abConfig = await abService.getGroupConfig(ctx.abGroup)
            ctx.price = ctx.abConfig?.price || 699

            // Setup commands for current user session
            if (!ctx.session || !(ctx.session as any).commandsSet) {
              try {
                await setupUserCommands(ctx.telegram, ctx.from.id, ctx.role === 'ADMIN');
                (ctx.session as any).commandsSet = true
              } catch (cmdError) {
                logger.warn(`Could not set commands for user ${ctx.from.id}: ${cmdError}`)
                }
            }
        } catch (error) {
            logger.error('Error in userLoader middleware:', error)
            // Fallbacks to avoid crashing
            ctx.language = 'ru'
            ctx.role = 'USER'
            ctx.abGroup = 'A'
            ctx.price = 699
        }

        return next()
    }
}
