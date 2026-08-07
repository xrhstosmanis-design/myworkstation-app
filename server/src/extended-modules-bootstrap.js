import {prisma} from "./prisma.js";

const statements=[
`CREATE TABLE IF NOT EXISTS "AttendanceEvent" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "storeId" TEXT,
  "employeeId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'PIN',
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "responsibleName" TEXT,
  "createdByUserId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttendanceEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AttendanceEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AttendanceEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
`CREATE INDEX IF NOT EXISTS "AttendanceEvent_employee_occurredAt_idx" ON "AttendanceEvent"("employeeId","occurredAt")`,
`CREATE INDEX IF NOT EXISTS "AttendanceEvent_company_occurredAt_idx" ON "AttendanceEvent"("companyId","occurredAt")`,
`ALTER TABLE "AttendanceEvent" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3)`,
`ALTER TABLE "AttendanceEvent" ADD COLUMN IF NOT EXISTS "voidedByUserId" TEXT`,
`ALTER TABLE "AttendanceEvent" ADD COLUMN IF NOT EXISTS "voidReason" TEXT`,
`ALTER TABLE "AttendanceEvent" ADD COLUMN IF NOT EXISTS "supersedesEventId" TEXT`,
`CREATE INDEX IF NOT EXISTS "AttendanceEvent_store_occurredAt_idx" ON "AttendanceEvent"("storeId","occurredAt")`,

`CREATE TABLE IF NOT EXISTS "PayrollPeriod" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
`CREATE INDEX IF NOT EXISTS "PayrollPeriod_company_idx" ON "PayrollPeriod"("companyId","startDate")`,

`CREATE TABLE IF NOT EXISTS "PayrollEntry" (
  "id" TEXT NOT NULL,
  "payrollPeriodId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "workedMinutes" INTEGER NOT NULL DEFAULT 0,
  "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
  "absenceMinutes" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollEntry_periodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PayrollEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS "PayrollEntry_period_employee_key" ON "PayrollEntry"("payrollPeriodId","employeeId")`,

`CREATE TABLE IF NOT EXISTS "AiReaderJob" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "storeId" TEXT,
  "purchaseDocumentId" TEXT,
  "attachmentId" TEXT,
  "stage" TEXT NOT NULL DEFAULT 'LOCAL',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "localConfidence" DECIMAL(6,3),
  "aiConfidence" DECIMAL(6,3),
  "resultJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "requestedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiReaderJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiReaderJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiReaderJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AiReaderJob_purchaseDocumentId_fkey" FOREIGN KEY ("purchaseDocumentId") REFERENCES "PurchaseDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AiReaderJob_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "DocumentAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AiReaderJob_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
)`,
`CREATE INDEX IF NOT EXISTS "AiReaderJob_company_status_idx" ON "AiReaderJob"("companyId","status")`,

`CREATE TABLE IF NOT EXISTS "DocumentInbox" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "storeId" TEXT,
  "supplierId" TEXT,
  "attachmentId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "note" TEXT,
  CONSTRAINT "DocumentInbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentInbox_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DocumentInbox_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DocumentInbox_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DocumentInbox_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "DocumentAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE
)`,
`CREATE INDEX IF NOT EXISTS "DocumentInbox_company_status_idx" ON "DocumentInbox"("companyId","status")`,
`ALTER TABLE "DocumentInbox" ADD COLUMN IF NOT EXISTS "responsibleName" TEXT`,
`ALTER TABLE "DocumentInbox" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT`,
`ALTER TABLE "DocumentInbox" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,

`CREATE TABLE IF NOT EXISTS "ConnectorDevice" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "connectorType" TEXT NOT NULL DEFAULT 'RBS_CAPDRIVER',
  "deviceName" TEXT,
  "version" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OFFLINE',
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectorDevice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConnectorDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConnectorDevice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS "ConnectorDevice_store_type_key" ON "ConnectorDevice"("storeId","connectorType")`,

`CREATE TABLE IF NOT EXISTS "ConnectorEvent" (
  "id" TEXT NOT NULL,
  "connectorDeviceId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "payloadHash" TEXT,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "errorText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectorEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConnectorEvent_deviceId_fkey" FOREIGN KEY ("connectorDeviceId") REFERENCES "ConnectorDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
`CREATE INDEX IF NOT EXISTS "ConnectorEvent_device_createdAt_idx" ON "ConnectorEvent"("connectorDeviceId","createdAt")`,

`CREATE TABLE IF NOT EXISTS "FiscalDocument" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "provider" TEXT,
  "externalId" TEXT,
  "fiscalNumber" TEXT,
  "mydataMark" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "issuedAt" TIMESTAMP(3),
  "payloadHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FiscalDocument_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS "FiscalDocument_saleId_key" ON "FiscalDocument"("saleId")`,

`CREATE TABLE IF NOT EXISTS "RemoteSupportSession" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "storeId" TEXT,
  "requestedByUserId" TEXT,
  "temporaryCodeHash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "userAcceptedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "auditJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RemoteSupportSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RemoteSupportSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RemoteSupportSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RemoteSupportSession_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
)`,
`CREATE INDEX IF NOT EXISTS "RemoteSupportSession_company_status_idx" ON "RemoteSupportSession"("companyId","status")`
];

export async function ensureExtendedModulesSchema(){
  for(const statement of statements)await prisma.$executeRawUnsafe(statement);
  console.log("Extended modules database foundation completed.");
}
