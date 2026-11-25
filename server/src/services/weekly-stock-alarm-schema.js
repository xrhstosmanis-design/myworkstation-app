import {inspectWeeklyExistingLabCatalogue} from './weekly-stock-alarm-existing-lab.js';
import {inspectExpectedReceiptInstallationCatalogue} from './supplier-expected-receipts-lifecycle-inspection.js';
import {weeklyAlarmDefinition,assertWeeklyStockAlarmProfile} from './weekly-stock-alarm-profile.js';
import {inspectWeeklyAlarmCatalogue} from './weekly-stock-alarm-catalogue.js';
import {selectedStoreLifecycleManifest} from './store-lifecycle-manifest.js';
export const weeklyStockAlarmDDL=weeklyAlarmDefinition.ddl;
export async function ensureWeeklyStockAlarmSchema(db){for(const sql of weeklyStockAlarmDDL)await db.$executeRawUnsafe(sql);}

// Read-only admission. Existing lifecycle/source owners must classify these tables
// before an explicit installer creates them. Startup and imports never run DDL.
export async function weeklyStockAlarmReadiness(db,{manifest=selectedStoreLifecycleManifest}={}){
 let admitted;try{admitted=manifest()}catch{return {ready:false,reason:'SCHEMA_PROFILE_UNAVAILABLE'}}
 const names=['WeeklyStockAlarmPolicy','WeeklyStockAlarmProduct','WeeklyStockAlarmHistory'];
 try{assertWeeklyStockAlarmProfile(admitted)}catch{return {ready:false,reason:'SCHEMA_PROFILE_NOT_ADMITTED'}}
 if(!names.every(name=>admitted?.knownTables?.includes(name)))return {ready:false,reason:'SCHEMA_PROFILE_NOT_ADMITTED'};
 const [row]=await db.$queryRaw`SELECT COUNT(*)::int AS "count" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relkind='r' AND c.relname IN ('WeeklyStockAlarmPolicy','WeeklyStockAlarmProduct','WeeklyStockAlarmHistory')`;
 if(row?.count!==3)return {ready:false,reason:'SCHEMA_NOT_INSTALLED'};
 const [schema]=await db.$queryRaw`SELECT current_schema() AS name`;try{await inspectWeeklyAlarmCatalogue(db,schema.name);if(admitted.weeklyStockAlarmCompatibility.existingLabCompatibility)await inspectWeeklyExistingLabCatalogue(db,schema.name);if(admitted.weeklyStockAlarmCompatibility.expectedReceipts||admitted.expectedReceiptCompatibility)await inspectExpectedReceiptInstallationCatalogue(db,schema.name)}catch{return {ready:false,reason:'SCHEMA_CATALOGUE_CHANGED'}}
 return {ready:true,reason:null};
}
