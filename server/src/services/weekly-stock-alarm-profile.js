import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const WEEKLY_LAB_SUFFIX='__EXISTING_EFOOD_LAB_V1';
export const weeklyExistingLabDefinition=JSON.parse(readFileSync(new URL('../../../ops/backup/lifecycle/weekly-stock-alarm-existing-lab.proposed.json',import.meta.url),'utf8'));
export const WEEKLY_RECEIPT_SUFFIX='__NO14_COMPAT_V2';
export const WEEKLY_PROFILE_SUFFIX='__WEEKLY_STOCK_ALARM_V1';
export const weeklyAlarmDefinition=JSON.parse(readFileSync(new URL('../../../ops/backup/lifecycle/weekly-stock-alarm-definition.proposed.json',import.meta.url),'utf8'));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const WEEKLY_ALARM_DEFINITION_HASH=hash(weeklyAlarmDefinition);
export const WEEKLY_LAB_DEFINITION_HASH=hash(weeklyExistingLabDefinition);
const fail=()=>{throw Object.assign(new Error('Weekly stock alarm profile differs.'),{status:409,code:'WEEKLY_ALARM_PROFILE_CHANGED'})};
export function withWeeklyStockAlarmProfile(base,{expectedReceipts=false,existingLab=false}={}){
 const sourcePlanHash=hash(base);if(!Object.values(weeklyAlarmDefinition.sourceProfiles).includes(sourcePlanHash))fail();
 const result=structuredClone(base);
 if(typeof existingLab!=='boolean'||typeof expectedReceipts!=='boolean'||expectedReceipts&&sourcePlanHash!==weeklyAlarmDefinition.sourceProfiles.MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4)fail();
 if(existingLab){
  result.id+=WEEKLY_LAB_SUFFIX;
  for(const [name,columns]of Object.entries(weeklyExistingLabDefinition.columns)){if(result.knownTables.includes(name))fail();result.knownTables.push(name);result.knownColumns[name]=columns;result.preservedOperationalTables.push(name);result.reviewedColumns.push(...columns.map(c=>name+'.'+c[0]));}
 }
 if(expectedReceipts){
  result.id+=WEEKLY_RECEIPT_SUFFIX;
  for(const table of weeklyAlarmDefinition.expectedReceiptProfileDelta.tables){
   if(result.knownTables.includes(table.name))fail();result.knownTables.push(table.name);result.knownColumns[table.name]=table.columns;result.preservedOperationalTables.push(table.name);
   result.reviewedColumns.push(...table.columns.filter(c=>/Id$/.test(c[0])||['confirmedBy','cancelledBy','result'].includes(c[0])).map(c=>table.name+'.'+c[0]));
  }
 }
 result.id+=WEEKLY_PROFILE_SUFFIX;
 for(const [name,columns]of Object.entries(weeklyAlarmDefinition.columns)){
  if(result.knownTables.includes(name))fail();result.knownTables.push(name);result.knownColumns[name]=columns;
  result.preservedOperationalTables.push(name);result.reviewedColumns.push(...columns.filter(c=>(/Id$/.test(c[0])||c[1]==='jsonb')).map(c=>name+'.'+c[0]));
 }
 result.weeklyStockAlarmCompatibility={format:'MWS_WEEKLY_STOCK_ALARM_PROFILE_V1',definitionHash:WEEKLY_ALARM_DEFINITION_HASH,sourcePlanHash,...(expectedReceipts?{expectedReceipts:true}:{}),...(existingLab?{existingLabCompatibility:WEEKLY_LAB_DEFINITION_HASH}:{})};result.executionDisabled=true;return result;
}
export function assertWeeklyStockAlarmProfile(manifest){
 if(!manifest?.weeklyStockAlarmCompatibility||!manifest.id?.endsWith(WEEKLY_PROFILE_SUFFIX))fail();
 const expectedReceipts=manifest.weeklyStockAlarmCompatibility.expectedReceipts===true,existingLab=manifest.weeklyStockAlarmCompatibility.existingLabCompatibility!==undefined;const base=structuredClone(manifest);delete base.weeklyStockAlarmCompatibility;base.id=base.id.slice(0,-WEEKLY_PROFILE_SUFFIX.length);
 for(const name of Object.keys(weeklyAlarmDefinition.columns)){
  base.knownTables=base.knownTables.filter(n=>n!==name);delete base.knownColumns[name];base.preservedOperationalTables=base.preservedOperationalTables.filter(n=>n!==name);base.reviewedColumns=base.reviewedColumns.filter(n=>!n.startsWith(name+'.'));
 }
 if(expectedReceipts){
  if(!base.id.endsWith(WEEKLY_RECEIPT_SUFFIX))fail();base.id=base.id.slice(0,-WEEKLY_RECEIPT_SUFFIX.length);
  for(const table of weeklyAlarmDefinition.expectedReceiptProfileDelta.tables){base.knownTables=base.knownTables.filter(n=>n!==table.name);delete base.knownColumns[table.name];base.preservedOperationalTables=base.preservedOperationalTables.filter(n=>n!==table.name);base.reviewedColumns=base.reviewedColumns.filter(n=>!n.startsWith(table.name+'.'));}
 }
 if(existingLab){
  if(!base.id.endsWith(WEEKLY_LAB_SUFFIX))fail();base.id=base.id.slice(0,-WEEKLY_LAB_SUFFIX.length);
  for(const name of Object.keys(weeklyExistingLabDefinition.columns)){base.knownTables=base.knownTables.filter(n=>n!==name);delete base.knownColumns[name];base.preservedOperationalTables=base.preservedOperationalTables.filter(n=>n!==name);base.reviewedColumns=base.reviewedColumns.filter(n=>!n.startsWith(name+'.'));}
 }
 if(JSON.stringify(withWeeklyStockAlarmProfile(base,{expectedReceipts,existingLab}))!==JSON.stringify(manifest))fail();return base;
}

export function parseWeeklyStockAlarmProfile(profile){
 if(typeof profile!=='string'||!profile.endsWith(WEEKLY_PROFILE_SUFFIX))fail();
 let sourceProfile=profile.slice(0,-WEEKLY_PROFILE_SUFFIX.length);const expectedReceipts=sourceProfile.endsWith(WEEKLY_RECEIPT_SUFFIX);if(expectedReceipts)sourceProfile=sourceProfile.slice(0,-WEEKLY_RECEIPT_SUFFIX.length);
 const existingLab=sourceProfile.endsWith(WEEKLY_LAB_SUFFIX);if(existingLab)sourceProfile=sourceProfile.slice(0,-WEEKLY_LAB_SUFFIX.length);
 if(!Object.hasOwn(weeklyAlarmDefinition.sourceProfiles,sourceProfile)||expectedReceipts&&sourceProfile!=='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4')fail();return {sourceProfile,expectedReceipts,existingLab};
}
