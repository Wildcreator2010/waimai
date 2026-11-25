-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "lastOpenedAt" TIMESTAMP(3),
ADD COLUMN     "lockerId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "openCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "orderId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT NOT NULL DEFAULT '';

