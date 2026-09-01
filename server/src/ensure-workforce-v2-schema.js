import {PrismaClient} from "@prisma/client";

// This is deliberately additive: it creates only the isolated Workforce v2
// tables and indexes when missing. It never alters or drops legacy tables and
// it never creates employees or migrates legacy personnel data.
const prisma=new PrismaClient();

const statements=[
  `CREATE TABLE IF NOT EXISTS "WorkforceEmployee" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"baseStoreId" TEXT,"userId" TEXT UNIQUE,"legacyEmployeeId" TEXT UNIQUE,"fullName" TEXT NOT NULL,"phone" TEXT,"email" TEXT,
    "paymentType" TEXT NOT NULL DEFAULT 'HOURLY',"fixedMonthlyAmount" DECIMAL(12,2),"maxDaysPerWeek" INTEGER NOT NULL DEFAULT 5,"maxHoursPerWeek" DECIMAL(6,2) NOT NULL DEFAULT 40,
    "minimumDaysOff" INTEGER NOT NULL DEFAULT 1,"canChangeStore" BOOLEAN NOT NULL DEFAULT false,"worksMorning" BOOLEAN NOT NULL DEFAULT true,"worksAfternoon" BOOLEAN NOT NULL DEFAULT true,
    "worksNight" BOOLEAN NOT NULL DEFAULT false,"worksWeekend" BOOLEAN NOT NULL DEFAULT true,"notes" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "WorkforceRole" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"name" TEXT NOT NULL,"code" TEXT NOT NULL,"description" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "WorkforceEmployeeRole" (
    "id" TEXT PRIMARY KEY,"employeeId" TEXT NOT NULL,"roleId" TEXT NOT NULL,"primary" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "WorkforceEmployeeStoreAccess" (
    "id" TEXT PRIMARY KEY,"employeeId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"isBaseStore" BOOLEAN NOT NULL DEFAULT false,"canSchedule" BOOLEAN NOT NULL DEFAULT true,"active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "WorkforceShiftTemplate" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"name" TEXT NOT NULL,"code" TEXT NOT NULL,"category" TEXT NOT NULL DEFAULT 'STANDARD',"startTime" TEXT NOT NULL,"endTime" TEXT NOT NULL,
    "minimumPeople" INTEGER NOT NULL DEFAULT 1,"maximumPeople" INTEGER,"requiredRoleId" TEXT,"requiresSupervisor" BOOLEAN NOT NULL DEFAULT false,"changeAllowed" BOOLEAN NOT NULL DEFAULT true,"active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "WorkforceEmployeeRule" (
    "id" TEXT PRIMARY KEY,"employeeId" TEXT NOT NULL,"ruleType" TEXT NOT NULL,"severity" TEXT NOT NULL DEFAULT 'ERROR',"relatedEmployeeId" TEXT,"valueJson" JSONB,"note" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),"validTo" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "WorkforceHourlyRate" (
    "id" TEXT PRIMARY KEY,"employeeId" TEXT NOT NULL,"hourlyRate" DECIMAL(12,4) NOT NULL,"validFrom" TIMESTAMP(3) NOT NULL,"validTo" TIMESTAMP(3),"note" TEXT,"createdByUserId" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "WorkforceSchedule" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"periodStart" TIMESTAMP(3) NOT NULL,"periodEnd" TIMESTAMP(3) NOT NULL,"periodType" TEXT NOT NULL DEFAULT 'WEEK',"status" TEXT NOT NULL DEFAULT 'DRAFT',"version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT,"approvedByUserId" TEXT,"approvedAt" TIMESTAMP(3),"publishedAt" TIMESTAMP(3),"lockedAt" TIMESTAMP(3),"notes" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "WorkforceScheduleAssignment" (
    "id" TEXT PRIMARY KEY,"scheduleId" TEXT NOT NULL,"date" TIMESTAMP(3) NOT NULL,"shiftTemplateId" TEXT NOT NULL,"employeeId" TEXT,"slot" INTEGER NOT NULL DEFAULT 1,"status" TEXT NOT NULL DEFAULT 'PLANNED',"warningState" TEXT NOT NULL DEFAULT 'OK',"warningJson" JSONB,"note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "WorkforceLeaveRequest" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"storeId" TEXT,"startDate" TIMESTAMP(3) NOT NULL,"endDate" TIMESTAMP(3) NOT NULL,"leaveType" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedByUserId" TEXT,"approvedByUserId" TEXT,"approvedAt" TIMESTAMP(3),"rejectedReason" TEXT,"comments" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "WorkforceAbsence" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"storeId" TEXT,"absenceType" TEXT NOT NULL,"startsAt" TIMESTAMP(3) NOT NULL,"endsAt" TIMESTAMP(3),"minutes" INTEGER,"reason" TEXT,"approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "WorkforceAuditLog" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT,"actorUserId" TEXT,"action" TEXT NOT NULL,"entityType" TEXT NOT NULL,"entityId" TEXT,"beforeJson" JSONB,"afterJson" JSONB,"reason" TEXT,"deviceName" TEXT,"userAgent" TEXT,"ipAddress" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "WorkforceTimeClockEntry" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"method" TEXT NOT NULL DEFAULT 'PIN',"occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"sourceShiftId" TEXT,"deviceId" TEXT,"note" TEXT,"correctionOfId" TEXT,"correctionReason" TEXT,"approvedByUserId" TEXT,"createdByUserId" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "WorkforceAttendanceSession" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"scheduledAssignmentId" TEXT,"clockInEntryId" TEXT,"clockOutEntryId" TEXT,"startedAt" TIMESTAMP(3) NOT NULL,"endedAt" TIMESTAMP(3),"workedMinutes" INTEGER NOT NULL DEFAULT 0,"lateMinutes" INTEGER NOT NULL DEFAULT 0,"earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,"overtimeMinutes" INTEGER NOT NULL DEFAULT 0,"status" TEXT NOT NULL DEFAULT 'OPEN',"issueJson" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "WorkforceChatCommand" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"scheduleId" TEXT,"actorUserId" TEXT NOT NULL,"commandText" TEXT NOT NULL,"proposalJson" JSONB,"warningJson" JSONB,"status" TEXT NOT NULL DEFAULT 'PROPOSED',"approvedByUserId" TEXT,"approvedAt" TIMESTAMP(3),"appliedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "WorkforceRole_companyId_code_key" ON "WorkforceRole" ("companyId","code")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "WorkforceEmployeeRole_employeeId_roleId_key" ON "WorkforceEmployeeRole" ("employeeId","roleId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "WorkforceEmployeeStoreAccess_employeeId_storeId_key" ON "WorkforceEmployeeStoreAccess" ("employeeId","storeId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "WorkforceShiftTemplate_storeId_code_key" ON "WorkforceShiftTemplate" ("storeId","code")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "WorkforceSchedule_storeId_periodStart_periodEnd_version_key" ON "WorkforceSchedule" ("storeId","periodStart","periodEnd","version")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "WorkforceScheduleAssignment_scheduleId_date_shiftTemplateId_slot_key" ON "WorkforceScheduleAssignment" ("scheduleId","date","shiftTemplateId","slot")`,
  `CREATE INDEX IF NOT EXISTS "WorkforceEmployee_companyId_active_idx" ON "WorkforceEmployee" ("companyId","active")`,
  `CREATE INDEX IF NOT EXISTS "WorkforceEmployeeStoreAccess_storeId_active_idx" ON "WorkforceEmployeeStoreAccess" ("storeId","active")`,
  `CREATE INDEX IF NOT EXISTS "WorkforceShiftTemplate_companyId_storeId_active_idx" ON "WorkforceShiftTemplate" ("companyId","storeId","active")`,
  `CREATE INDEX IF NOT EXISTS "WorkforceLeaveRequest_companyId_status_startDate_idx" ON "WorkforceLeaveRequest" ("companyId","status","startDate")`,
  `CREATE INDEX IF NOT EXISTS "WorkforceAuditLog_companyId_createdAt_idx" ON "WorkforceAuditLog" ("companyId","createdAt")`
  ,`CREATE INDEX IF NOT EXISTS "WorkforceTimeClockEntry_companyId_storeId_occurredAt_idx" ON "WorkforceTimeClockEntry" ("companyId","storeId","occurredAt")`
  ,`CREATE INDEX IF NOT EXISTS "WorkforceTimeClockEntry_employeeId_occurredAt_idx" ON "WorkforceTimeClockEntry" ("employeeId","occurredAt")`
  ,`CREATE INDEX IF NOT EXISTS "WorkforceAttendanceSession_companyId_storeId_startedAt_idx" ON "WorkforceAttendanceSession" ("companyId","storeId","startedAt")`
  ,`CREATE INDEX IF NOT EXISTS "WorkforceAttendanceSession_employeeId_startedAt_idx" ON "WorkforceAttendanceSession" ("employeeId","startedAt")`
];

try{
  for(const statement of statements)await prisma.$executeRawUnsafe(statement);
  console.log("Workforce V2 safe schema check completed.");
}finally{
  await prisma.$disconnect();
}
