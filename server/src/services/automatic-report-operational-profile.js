import {readFileSync} from 'node:fs';
export const operationalReportDefinition=()=>JSON.parse(readFileSync(new URL('../../../ops/backup/lifecycle/report-operational-compatibility.proposed.json',import.meta.url),'utf8'));
export function withReportOperationalCompatibility(manifest){
 const definition=operationalReportDefinition(),result=structuredClone(manifest);
 result.id+='__REPORTS_ONLY_OPERATIONAL_V1';
 result.executionDisabled=true;
 result.preservedOperationalTables=definition.tables.map(table=>table.name);
 result.reviewedColumns.push(...definition.reviewedColumns);
 for(const table of definition.tables){
  if(result.knownTables.includes(table.name))throw new Error('Operational report table already declared.');
  result.knownTables.push(table.name);result.knownColumns[table.name]=table.columns;
 }
 const stock=result.tables.find(table=>table.name==='StoreProduct');
 stock.existingTriggers=[...(stock.existingTriggers||[]),definition.packageTrigger];
 return result;
}
export function assertReportOperationalProfile(manifest){
 const definition=operationalReportDefinition(),expected=definition.tables.map(table=>table.name);
 const actualReviewed=(manifest.reviewedColumns||[]).filter(column=>expected.some(name=>column.startsWith(name+'.')));
 if(JSON.stringify(actualReviewed)!==JSON.stringify(definition.reviewedColumns))throw new Error('Operational report column review differs.');
 if(manifest.executionDisabled!==true||JSON.stringify(manifest.preservedOperationalTables)!==JSON.stringify(expected)||expected.some(name=>manifest.tables.some(table=>table.name===name)))throw new Error('Operational report profile differs from review.');
}
