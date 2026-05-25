import { prisma } from '../db/prisma.js'
import { logger } from '../utils/logger.js'

export class AbService {
    /**
     * Gets all available AB groups for admin panel
     */
    async getGroups() {
        return prisma.abConfig.findMany({ orderBy: { name: 'asc' } })
    }

    /**
     * Gets full config for a specific group.
     */
    async getGroupConfig(groupName: string) {
        try {
            return await prisma.abConfig.findUnique({ where: { name: groupName } })
        } catch (error) {
            logger.error(`Error fetching config for group ${groupName}:`, error)
            return null
        }
    }

    /**
     * Gets price for a specific group (1 month). Fallback to 699 if not found.
     */
    async getPrice(groupName: string): Promise<number> {
        try {
            const config = await prisma.abConfig.findUnique({ where: { name: groupName } })
            return config?.price || 699
        } catch (error) {
            logger.error(`Error fetching price for group ${groupName}:`, error)
            return 699
        }
    }

    /**
     * Distributes a new user to an active group.
     */
    async getRandomActiveGroup(): Promise<string> {
        try {
            const activeGroups = await prisma.abConfig.findMany({ where: { isActive: true } })

            if (activeGroups.length === 0) {
                // Try default group
                const defaultGroup = await prisma.abConfig.findFirst({ where: { isDefault: true } })
                if (defaultGroup) return defaultGroup.name

                // Final fallback
                return 'A'
            }

            const randomIndex = Math.floor(Math.random() * activeGroups.length)
            return activeGroups[randomIndex].name
        } catch (error) {
            logger.error('Error distributing user to AB group:', error)
            return 'A'
        }
    }

    /**
     * Updates group configuration
     */
    async updateGroup(
        name: string,
        data: {
            price?: number
            oldPrice?: number
            price3?: number
            oldPrice3?: number
            price6?: number
            oldPrice6?: number
            priceStars?: number
            price3Stars?: number
            price6Stars?: number
            isActive?: boolean
            isDefault?: boolean
        },
    ) {
        // If setting as default, unset others
        if (data.isDefault) {
            await prisma.abConfig.updateMany({
                where: { isDefault: true },
                data: { isDefault: false },
            })
        }

        return prisma.abConfig.upsert({
            where: { name },
            update: data,
            create: {
                name,
                price: data.price || 699,
                oldPrice: data.oldPrice || 899,
                price3: data.price3 || 1799,
                oldPrice3: data.oldPrice3 || 2697,
                price6: data.price6 || 2999,
                oldPrice6: data.oldPrice6 || 5394,
                priceStars: data.priceStars || 350,
                price3Stars: data.price3Stars || 900,
                price6Stars: data.price6Stars || 1500,
                isActive: data.isActive ?? true,
                isDefault: data.isDefault ?? false,
            },
        })
    }

    /**
     * Deletes a group (with safety check)
     */
    async deleteGroup(name: string) {
        if (name === 'A') throw new Error('Cannot delete protected group A')
        return prisma.abConfig.delete({ where: { name } })
    }
}

export const abService = new AbService()
