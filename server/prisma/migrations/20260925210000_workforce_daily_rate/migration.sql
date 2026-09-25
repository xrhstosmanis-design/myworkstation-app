ALTER TABLE "WorkforceEmployee" ADD COLUMN IF NOT EXISTS "dailyRate" DECIMAL(12,2);
ALTER TABLE "WorkforcePayrollLine" ADD COLUMN IF NOT EXISTS "dailyRate" DECIMAL(12,2);
ALTER TABLE "WorkforceEmployeePayment" ADD COLUMN IF NOT EXISTS "requestKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "WorkforceEmployeePayment_requestKey_key" ON "WorkforceEmployeePayment" ("requestKey");
