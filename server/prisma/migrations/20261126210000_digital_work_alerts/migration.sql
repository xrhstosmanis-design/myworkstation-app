-- CreateTable
CREATE TABLE "DigitalWorkAlert" (
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(6),

    CONSTRAINT "DigitalWorkAlert_pkey" PRIMARY KEY ("sessionId","kind")
);

-- AddForeignKey
ALTER TABLE "DigitalWorkAlert" ADD CONSTRAINT "DigitalWorkAlert_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DigitalWorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
