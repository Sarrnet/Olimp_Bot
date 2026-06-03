/*
  Warnings:

  - The values [TRIBUTE] on the enum `PaymentProviderType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PaymentProviderType_new" AS ENUM ('CRYPTO_PAY', 'TELEGRAM_STARS', 'YOOKASSA', 'PAYCOM_UZ', 'BEPAID_BY', 'ROBOKASSA_KZ', 'PORTMONE_UA', 'UNLIMIT');
ALTER TABLE "Payment" ALTER COLUMN "provider" TYPE "PaymentProviderType_new" USING ("provider"::text::"PaymentProviderType_new");
DROP TYPE "PaymentProviderType";
ALTER TYPE "PaymentProviderType_new" RENAME TO "PaymentProviderType";
COMMIT;

-- AlterTable
ALTER TABLE "AbConfig" ADD COLUMN     "price3Crypto" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "price6Crypto" INTEGER NOT NULL DEFAULT 40,
ADD COLUMN     "priceCrypto" INTEGER NOT NULL DEFAULT 10;
