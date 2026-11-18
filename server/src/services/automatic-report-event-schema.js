// Explicit lifecycle profile for event report authorizations. The default
// manifest remains usable before the optional event schema is provisioned.
import {readFileSync} from 'node:fs';
const extension=JSON.parse(readFileSync(new URL('../../../ops/backup/lifecycle/automatic-report-consent-extension.proposed.json',import.meta.url),'utf8'));
if(extension.format!=='MWS_AUTOMATIC_REPORT_CONSENT_EXTENSION_V1')throw new Error('Invalid report consent lifecycle definition.');
export const automaticReportEventConsentColumns=Object.freeze(extension.columns.map(column=>Object.freeze(column)));

export function withAutomaticReportEventConsent(manifest){
  const result=structuredClone(manifest);
  const tables=[
    {name:'AutomaticReportSupplierComparisonConsent',columns:manifest.knownColumns.AutomaticReportRecipientConsent},
    {name:'AutomaticReportEventConsent',columns:automaticReportEventConsentColumns}
  ];
  for(const {name,columns} of tables){
    if(result.knownTables.includes(name)||Object.hasOwn(result.knownColumns,name)||result.tables.some(table=>table.name===name)){
      throw new Error('Report consent lifecycle table is already declared.');
    }
    result.knownTables.push(name);
    result.knownColumns[name]=structuredClone(columns);
    result.tables.push({name,owner:{kind:'DIRECT'},reset:'REMOVE'});
    result.reviewedColumns.push(...['recipientId','consentedBy','revokedBy','updatedBy'].map(column=>name+'.'+column));
  }
  result.id+='__AUTOMATIC_EVENT_REPORTS_V1';
  result.valueGuards.push({table:'AutomaticReportEventConsent',column:'reportType',allowed:['PROMOTION_RESULT','INVENTORY_RESULT']});
  return result;
}

export function automaticReportEventLifecycleReady(env=process.env){
  return ['AUTOMATIC_EVENT_REPORTS_V1','MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_V1','MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V1'].includes(env.MWS_STORE_LIFECYCLE_PROFILE);
}
