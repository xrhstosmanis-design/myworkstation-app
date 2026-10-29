const ready=new WeakMap();
// Account, login guard and immutable audit are company/security data. Grants
// are explicit Store links; retain on reset, cascade on real Store deletion.
// No automatic lifecycle manifest approval: existing unknown-schema checks stay.
export function ensureBackofficeStaffSchema(db){
  if(ready.has(db))return ready.get(db);
  const work=db.$transaction(async tx=>{
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('mws:backoffice-staff-schema:v1'))");
    for(const sql of [
      'CREATE UNIQUE INDEX IF NOT EXISTS "User_staff_company_key" ON "User"("id","companyId")',
      'CREATE UNIQUE INDEX IF NOT EXISTS "Store_staff_company_key" ON "Store"("id","companyId")',
      `CREATE TABLE IF NOT EXISTS "BackofficeStaffAccount" ("userId" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"username" TEXT UNIQUE NOT NULL CHECK ("username" ~ '^[a-z0-9][a-z0-9._-]{2,79}$'),"pinHash" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"revision" INTEGER NOT NULL DEFAULT 1,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE("userId","companyId"),FOREIGN KEY("userId","companyId") REFERENCES "User"("id","companyId") ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS "BackofficeStaffGrant" ("userId" TEXT NOT NULL,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"profile" TEXT NOT NULL CHECK ("profile" IN ('MANAGER','STOCKTAKER','AUDITOR')),"capabilities" JSONB NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"revision" INTEGER NOT NULL DEFAULT 1,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY("userId","storeId"),FOREIGN KEY("userId","companyId") REFERENCES "BackofficeStaffAccount"("userId","companyId") ON DELETE CASCADE,FOREIGN KEY("storeId","companyId") REFERENCES "Store"("id","companyId") ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS "BackofficeStaffAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,"actorId" TEXT NOT NULL,"targetUserId" TEXT NOT NULL,"event" TEXT NOT NULL,"detail" JSONB NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      'CREATE INDEX IF NOT EXISTS "BackofficeStaffAudit_company_time" ON "BackofficeStaffAudit"("companyId","createdAt")',
      `CREATE TABLE IF NOT EXISTS "BackofficeStaffLoginGuard" ("key" TEXT PRIMARY KEY,"attempts" INTEGER NOT NULL DEFAULT 0,"windowStartedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"blockedUntil" TIMESTAMPTZ)`
    ])await tx.$executeRawUnsafe(sql);
  }).catch(error=>{ready.delete(db);throw error});
  ready.set(db,work);return work;
}
