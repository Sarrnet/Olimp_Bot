import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json(),
    ),
    defaultMeta: { service: 'height-olimp-bot' },
    transports: [
        // Output errors to a separate file
        new DailyRotateFile({
            filename: 'logs/error-%DATE%.log',
            level: 'error',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '7d',
        }),
        // All logs to a general file
        new DailyRotateFile({
            filename: 'logs/combined-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '7d',
        }),
    ],
})

// For development, log to the console with colors and simple format
if (process.env.NODE_ENV !== 'production') {
    logger.add(
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple(),
                winston.format.printf(({ level, message, timestamp, stack }) => {
                    if (stack) {
                        return `${timestamp} ${level}: ${message}\n${stack}`
                    }
                    return `${timestamp} ${level}: ${message}`
                }),
            ),
        }),
    )
}

export { logger }
