export interface PaymentProvider {
    id: string
    label: string
    currency: string
    flag: string
    token: string | undefined
}

export const PAYMENT_PROVIDERS: Record<string, PaymentProvider> = {
    yookassa: {
        id: 'yookassa',
        label: 'YooKassa',
        currency: 'RUB',
        flag: '🇷🇺',
        token: process.env.PAYMENT_TOKEN_YOOKASSA,
    },
    paycom_uz: {
        id: 'paycom_uz',
        label: 'Paycom',
        currency: 'UZS',
        flag: '🇺🇿',
        token: process.env.PAYMENT_TOKEN_PAYCOM_UZ,
    },
    bepaid_by: {
        id: 'bepaid_by',
        label: 'BePaid',
        currency: 'BYN',
        flag: '🇧🇾',
        token: process.env.PAYMENT_TOKEN_BEPAID_BY,
    },
    robokassa_kz: {
        id: 'robokassa_kz',
        label: 'Robokassa',
        currency: 'KZT',
        flag: '🇰🇿',
        token: process.env.PAYMENT_TOKEN_ROBOKASSA_KZ,
    },
    portmone_ua: {
        id: 'portmone_ua',
        label: 'Portmone',
        currency: 'UAH',
        flag: '🇺🇦',
        token: process.env.PAYMENT_TOKEN_PORTMONE,
    },
    unlimit: {
        id: 'unlimit',
        label: 'Unlimit',
        currency: 'USD',
        flag: '🌍',
        token: process.env.PAYMENT_TOKEN_UNLIMIT,
    },
    telegram_stars: {
        id: 'telegram_stars',
        label: 'Telegram Stars',
        currency: 'XTR',
        flag: '⭐️',
        token: '', // Stars don't use a provider token
    },
    crypto_pay: {
        id: 'crypto_pay',
        label: 'Crypto Pay (карты всего мира)',
        currency: 'USDT', // Default, but can be multiple
        flag: '⚡',
        token: process.env.CRYPTO_PAY_TOKEN,
    },
}
