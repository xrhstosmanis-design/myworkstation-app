-- CreateEnum
CREATE TYPE "DigitalWorkSubmissionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "DigitalWorkSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "cashShiftId" TEXT,
    "declaredStartAt" TIMESTAMPTZ(6),
    "declaredEndAt" TIMESTAMPTZ(6),
    "declaredRestDay" BOOLEAN,
    "entryRequestId" TEXT NOT NULL,
    "entryAt" TIMESTAMPTZ(6) NOT NULL,
    "entryStatus" "DigitalWorkSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "entryErganiReference" TEXT,
    "entryError" TEXT,
    "departureRequestId" TEXT,
    "departureAt" TIMESTAMPTZ(6),
    "departureStatus" "DigitalWorkSubmissionStatus",
    "departureErganiReference" TEXT,
    "departureError" TEXT,
    "departureReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DigitalWorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DigitalWorkSession_entryRequestId_key" ON "DigitalWorkSession"("entryRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalWorkSession_departureRequestId_key" ON "DigitalWorkSession"("departureRequestId");

-- CreateIndex
CREATE INDEX "DigitalWorkSession_storeId_entryAt_idx" ON "DigitalWorkSession"("storeId", "entryAt");

-- CreateIndex
CREATE INDEX "DigitalWorkSession_storeId_employeeId_cashShiftId_idx" ON "DigitalWorkSession"("storeId", "employeeId", "cashShiftId");

-- AddForeignKey
ALTER TABLE "DigitalWorkSession" ADD CONSTRAINT "DigitalWorkSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalWorkSession" ADD CONSTRAINT "DigitalWorkSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
