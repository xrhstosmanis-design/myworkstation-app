// Only called with an already isolated test-schema client. No production entry.
export async function installStaffActionPolicy(db,{companyId='c',storeId='s',capabilities=[]}={}){
 for(const sql of [
  'CREATE TABLE "Company" ("id" text PRIMARY KEY,"name" text,"active" boolean DEFAULT true,"licenseStatus" text DEFAULT \'ACTIVE\',"subscriptionEndsAt" timestamptz)',
  'CREATE TABLE "CompanyModule" ("id" text PRIMARY KEY,"companyId" text,"moduleKey" text,"active" boolean DEFAULT true,"startsAt" timestamptz,"endsAt" timestamptz)',
  'CREATE TABLE "StorePaidModule" ("storeId" text,"moduleKey" text,"active" boolean,"startsAt" timestamptz,"endsAt" timestamptz)',
  'ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true',
  'CREATE TABLE "User" ("id" text PRIMARY KEY,"companyId" text,"fullName" text,"email" text,"role" text DEFAULT \'EMPLOYEE\',"sessionVersion" int DEFAULT 0,"mustChangePassword" boolean DEFAULT false)',
  'CREATE TABLE "UserSession" ("id" text PRIMARY KEY,"userId" text,"revokedAt" timestamptz,"expiresAt" timestamptz)',
  'CREATE TABLE "BackofficeStaffAccount" ("userId" text PRIMARY KEY,"companyId" text,"username" text,"active" boolean DEFAULT true,"revision" int DEFAULT 1)',
  'CREATE TABLE "BackofficeStaffGrant" ("userId" text,"companyId" text,"storeId" text,"profile" text DEFAULT \'AUDITOR\',"capabilities" jsonb,"active" boolean DEFAULT true,"revision" int DEFAULT 1)',
  'CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" text PRIMARY KEY,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb,"createdAt" timestamptz DEFAULT now())'
 ])await db.$executeRawUnsafe(sql);
 await db.$executeRaw`INSERT INTO "Company" ("id","name") VALUES (${companyId},'Isolated')`;
 await db.$executeRaw`INSERT INTO "CompanyModule" ("id","companyId","moduleKey") SELECT key,${companyId},key FROM unnest(ARRAY['DOCUMENTS','INVENTORY','STORE_MODE','CASH_CONTROL']) AS key`;
 await db.$executeRaw`INSERT INTO "User" ("id","companyId","fullName","email") VALUES ('delegated',${companyId},'Synthetic delegated','fixture@isolated.invalid')`;
 await db.$executeRaw`INSERT INTO "UserSession" ("id","userId","expiresAt") VALUES ('delegated-session','delegated',now()+interval '1 hour')`;
 await db.$executeRaw`INSERT INTO "BackofficeStaffAccount" ("userId","companyId","username") VALUES ('delegated',${companyId},'synthetic')`;
 await db.$executeRaw`INSERT INTO "BackofficeStaffGrant" ("userId","companyId","storeId","capabilities") VALUES ('delegated',${companyId},${storeId},${JSON.stringify(capabilities)}::jsonb)`;
 return {id:'delegated',companyId,storeId,fullName:'Synthetic delegated',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'delegated-session',sessionVersion:0};
}
