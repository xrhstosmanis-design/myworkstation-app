import {createHash} from 'node:crypto';
import {EXPECTED_RECEIPT_COMPATIBILITY_DEFINITION as definition,EXPECTED_RECEIPT_COMPATIBILITY_HASH} from './supplier-expected-receipts-compatibility-definition.js';
export const EXPECTED_RECEIPT_SOURCE_PROFILE='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3';
export const EXPECTED_RECEIPT_TARGET_PROFILE='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_NO14_V1';
export const EXPECTED_RECEIPT_SOURCE_HASH='54ceb10a4383faf7367d07bd3b8ad1c066b85c025a23e937c610d1f473423828';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=()=>{throw Object.assign(new Error('Reviewed No14 lifecycle profile differs.'),{status:409,code:'EXPECTED_RECEIPT_PROFILE_CHANGED'})};
export function withExpectedReceiptProfile(base){
 if(hash(base)!==EXPECTED_RECEIPT_SOURCE_HASH)fail();
 const result=structuredClone(base);
 result.id+='__EXPECTED_RECEIPTS_REPORTS_ONLY_V1';
 for(const table of definition.tables){
  result.knownTables.push(table.name);
  result.knownColumns[table.name]=table.columns.map(c=>[c.name,c.type,c.notNull]);
  result.preservedOperationalTables.push(table.name);
  result.reviewedColumns.push(...table.columns.filter(c=>/Id$/.test(c.name)||['confirmedBy','cancelledBy','result'].includes(c.name)).map(c=>table.name+'.'+c.name));
 }
 result.expectedReceiptCompatibility={format:'MWS_EXPECTED_RECEIPTS_REPORTS_ONLY_V1',definitionHash:EXPECTED_RECEIPT_COMPATIBILITY_HASH,sourcePlanHash:EXPECTED_RECEIPT_SOURCE_HASH};
 result.executionDisabled=true;
 return result;
}
export function assertExpectedReceiptProfile(manifest){
 const base=structuredClone(manifest);
 if(!base.expectedReceiptCompatibility||!base.id.endsWith('__EXPECTED_RECEIPTS_REPORTS_ONLY_V1'))fail();
 delete base.expectedReceiptCompatibility;base.id=base.id.slice(0,-'__EXPECTED_RECEIPTS_REPORTS_ONLY_V1'.length);
 for(const table of definition.tables){
  base.knownTables=base.knownTables.filter(n=>n!==table.name);delete base.knownColumns[table.name];
  base.preservedOperationalTables=base.preservedOperationalTables.filter(n=>n!==table.name);
  base.reviewedColumns=base.reviewedColumns.filter(n=>!n.startsWith(table.name+'.'));
 }
 if(hash(base)!==EXPECTED_RECEIPT_SOURCE_HASH||JSON.stringify(withExpectedReceiptProfile(base))!==JSON.stringify(manifest))fail();
 return base;
}
