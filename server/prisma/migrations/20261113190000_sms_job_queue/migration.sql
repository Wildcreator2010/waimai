-- CreateTable
CREATE TABLE "SmsJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "phone" TEXT NOT NULL,
    "cabCode" TEXT NOT NULL DEFAULT '',
    "boxSn" TEXT NOT NULL DEFAULT '',
    "sn" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'arrival',
    "reminderId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "SmsJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsJob_status_createdAt_idx" ON "SmsJob"("status", "createdAt");

