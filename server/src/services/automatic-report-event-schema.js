// Explicit lifecycle profile for event report authorizations. The default
// manifest remains usable before the optional event schema is provisioned.
export const automaticReportEventConsentColumns=Object.freeze([
  ['companyId','text',true],
  ['storeId','text',true],
  ['reportType','text',true],
  ['recipientId','text',true],
  ['revision','bigint',true],
  ['recipientVersion','bigint',true],
  ['active','boolean',true],
  ['allowedFrequencies','text[]',true],
  ['lifecycleGeneration','bigint',true],
  ['consentedBy','text',false],
  ['consentedAt','timestamp with time zone',false],
  ['proofHash','text',false],
  ['revokedBy','text',false],
  ['revokedAt','timestamp with time zone',false],
  ['updatedBy','text',true],
  ['updatedAt','timestamp with time zone',true]
].map(column=>Object.freeze(column)));

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
  return ['AUTOMATIC_EVENT_REPORTS_V1','MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_V1'].includes(env.MWS_STORE_LIFECYCLE_PROFILE);
}
