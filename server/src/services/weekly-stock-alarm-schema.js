import {selectedStoreLifecycleManifest} from './store-lifecycle-manifest.js';
export const weeklyStockAlarmDDL=[
 `CREATE TABLE IF NOT EXISTS "WeeklyStockAlarmPolicy" ("companyId" TEXT NOT NULL,"scope" TEXT NOT NULL,"settings" JSONB NOT NULL,"version" INTEGER NOT NULL DEFAULT 1,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY("companyId","scope"))`,
 `CREATE TABLE IF NOT EXISTS "WeeklyStockAlarmProduct" ("companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"productId" TEXT NOT NULL,"mode" TEXT NOT NULL DEFAULT 'AUTO' CHECK("mode" IN ('AUTO','MANUAL')),"floor" NUMERIC(14,4),"leadDays" INTEGER CHECK("leadDays" BETWEEN 0 AND 30),"baselineMinimum" NUMERIC(14,4),"lastApplied" NUMERIC(14,4),PRIMARY KEY("companyId","storeId","productId"))`,
 `CREATE TABLE IF NOT EXISTS "WeeklyStockAlarmHistory" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"productId" TEXT,"week" TEXT NOT NULL,"previousMinimum" NUMERIC(14,4),"nextMinimum" NUMERIC(14,4),"status" TEXT NOT NULL,"details" JSONB NOT NULL,"actorId" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
 `CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyStockAlarmHistory_once" ON "WeeklyStockAlarmHistory"("companyId","storeId","productId","week") WHERE "productId" IS NOT NULL AND "status" IN ('APPLY','UNCHANGED','HELD')`,
 `CREATE INDEX IF NOT EXISTS "WeeklyStockAlarmHistory_scope" ON "WeeklyStockAlarmHistory"("companyId","storeId","createdAt")`
];
export async function ensureWeeklyStockAlarmSchema(db){for(const sql of weeklyStockAlarmDDL)await db.$executeRawUnsafe(sql);}

// Read-only admission. Existing lifecycle/source owners must classify these tables
// before an explicit installer creates them. Startup and imports never run DDL.
export async function weeklyStockAlarmReadiness(db,{manifest=selectedStoreLifecycleManifest}={}){
 let admitted;try{admitted=manifest()}catch{return {ready:false,reason:'SCHEMA_PROFILE_UNAVAILABLE'}}
 const names=['WeeklyStockAlarmPolicy','WeeklyStockAlarmProduct','WeeklyStockAlarmHistory'];
 if(!names.every(name=>admitted?.knownTables?.includes(name)))return {ready:false,reason:'SCHEMA_PROFILE_NOT_ADMITTED'};
 const [row]=await db.$queryRaw`SELECT COUNT(*)::int AS "count" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relkind='r' AND c.relname IN ('WeeklyStockAlarmPolicy','WeeklyStockAlarmProduct','WeeklyStockAlarmHistory')`;
 return {ready:row?.count===3,reason:row?.count===3?null:'SCHEMA_NOT_INSTALLED'};
}
