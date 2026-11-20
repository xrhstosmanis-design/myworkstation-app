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
 const definition=operationalReportDefinition(),expected=[...definition.tables.map(table=>table.name),...(manifest.preservedReportChatTables||[])];
 const actualReviewed=(manifest.reviewedColumns||[]).filter(column=>definition.tables.some(table=>column.startsWith(table.name+'.')));
 if(JSON.stringify(actualReviewed)!==JSON.stringify(definition.reviewedColumns))throw new Error('Operational report column review differs.');
 if(manifest.executionDisabled!==true||JSON.stringify(manifest.preservedOperationalTables)!==JSON.stringify(expected)||expected.some(name=>manifest.tables.some(table=>table.name===name)))throw new Error('Operational report profile differs from review.');
}

export const reportColumnDefinition=()=>JSON.parse(readFileSync(new URL('../../../ops/backup/lifecycle/report-column-compatibility.proposed.json',import.meta.url),'utf8'));
export function withReportColumnCompatibility(manifest){
 const definition=reportColumnDefinition(),result=structuredClone(manifest);
 result.id+='__REVIEWED_REPORT_COLUMNS_V1';
 result.reviewedColumnExtensions=definition.tables.flatMap(table=>table.columns.map(column=>table.name+'.'+column[0]));
 for(const table of definition.tables)result.knownColumns[table.name].push(...table.columns);
 result.reviewedColumns.push(...definition.reviewedColumns);
 return result;
}
export function assertReportColumnProfile(manifest){
 const definition=reportColumnDefinition();
 const expected=definition.tables.flatMap(table=>table.columns.map(column=>table.name+'.'+column[0]));
 if(manifest.executionDisabled!==true||JSON.stringify(manifest.reviewedColumnExtensions)!==JSON.stringify(expected)||definition.reviewedColumns.some(column=>!manifest.reviewedColumns.includes(column)))throw new Error('Reviewed report column profile differs.');
 for(const table of definition.tables){
  const actual=manifest.knownColumns[table.name].filter(column=>table.columns.some(reviewed=>reviewed[0]===column[0]));
  if(JSON.stringify(actual)!==JSON.stringify(table.columns))throw new Error('Reviewed report column layout differs.');
 }
}

export const reportChatDefinition=()=>JSON.parse(readFileSync(new URL('../../../ops/backup/lifecycle/report-chat-compatibility.proposed.json',import.meta.url),'utf8'));
export function withReportChatCompatibility(manifest){
 const definition=reportChatDefinition(),result=structuredClone(manifest);
 result.id+='__REVIEWED_REPORT_CHAT_V1';
 result.preservedReportChatTables=definition.tables.map(table=>table.name);
 result.preservedOperationalTables.push(...result.preservedReportChatTables);
 result.reviewedColumns.push(...definition.reviewedColumns);
 for(const table of definition.tables){
  if(result.knownTables.includes(table.name))throw new Error('Report chat table already declared.');
  result.knownTables.push(table.name);result.knownColumns[table.name]=table.columns;
 }
 return result;
}
export function assertReportChatProfile(manifest){
 const definition=reportChatDefinition(),expected=definition.tables.map(table=>table.name);
 if(manifest.executionDisabled!==true||JSON.stringify(manifest.preservedReportChatTables)!==JSON.stringify(expected)||expected.some(name=>manifest.tables.some(table=>table.name===name)))throw new Error('Report chat profile differs from review.');
 const actualReviewed=(manifest.reviewedColumns||[]).filter(column=>expected.some(name=>column.startsWith(name+'.')));
 if(JSON.stringify(actualReviewed)!==JSON.stringify(definition.reviewedColumns))throw new Error('Report chat column review differs.');
 for(const table of definition.tables)if(JSON.stringify(manifest.knownColumns[table.name])!==JSON.stringify(table.columns))throw new Error('Report chat column layout differs.');
}
