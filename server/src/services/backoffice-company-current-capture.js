// Independent, explicit catalogue for COMPANY reads on the observed current
// application schema. This is not a scoped reset or recovery manifest.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {prepareOperationalReportInspection} from './automatic-report-source-compatibility.js';
export const currentCaptureRuntimeProfile='BACKOFFICE_COMPANY_CURRENT_CAPTURE_V1';
export const currentCapturePurpose='COMPANY_READ_ONLY';
export const currentCaptureSourceFencePlanHash='59ca657191a03dfeb751e907d95abe4291a3fc61da30c9d0602a116ed78757c2';
export const currentCaptureWorkerProtocol='MWS_BACKOFFICE_COMPANY_READ_CAPABILITY_V1';
export const currentCaptureCatalogueFormat='MWS_BACKOFFICE_CURRENT_CAPTURE_CATALOGUE_V1';
const read=name=>JSON.parse(readFileSync(new URL('../../../ops/backup/lifecycle/'+name,import.meta.url),'utf8'));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=()=>{throw Object.assign(new Error('Current COMPANY catalogue requires exact review.'),{code:'COMPANY_CURRENT_CAPTURE_REFUSED',status:409})};
export function buildCompanyCurrentCaptureProposal(source=read('monthly-inventory-capture-manifest.proposed.json'),sourceReview=read('monthly-inventory-capture-column-review.proposed.json'),{phase='TARGET'}={}){
 if(!['SOURCE','TARGET'].includes(phase)||hash(source)!==currentCaptureSourceFencePlanHash||!isDeepStrictEqual(sourceReview,read('monthly-inventory-capture-column-review.proposed.json')))fail();
 const definition=read('backoffice-company-current-capture.proposed.json'),expectedDefinition={format:'MWS_BACKOFFICE_COMPANY_CURRENT_CAPTURE_PROPOSAL_V1',executionEnabled:false,productionActivated:false,profile:'CURRENT_CAPTURE',runtimeProfile:currentCaptureRuntimeProfile,purpose:currentCapturePurpose,sourceManifest:'ops/backup/lifecycle/monthly-inventory-capture-manifest.proposed.json',sourceReview:'ops/backup/lifecycle/monthly-inventory-capture-column-review.proposed.json',sourceFencePlanHash:currentCaptureSourceFencePlanHash,sourceProfileId:'BACKOFFICE_COMPANY_CURRENT_CAPTURE_SOURCE_V1',targetProfileId:'BACKOFFICE_COMPANY_CURRENT_CAPTURE_PROPOSED_V1',operationalDefinition:'ops/backup/lifecycle/report-operational-compatibility.proposed.json',supplierConsent:'AutomaticReportSupplierComparisonConsent',supplierLayoutFrom:'AutomaticReportRecipientConsent',supplierChecksDefinition:'ops/backup/lifecycle/automatic-report-consent-extension.proposed.json',eventConsentPresent:false,accountColumn:['companyCapabilities','jsonb',true],columnDefault:[],scopedRecovery:false,workerProtocol:currentCaptureWorkerProtocol,columnDefinition:'ops/backup/lifecycle/backoffice-company-current-columns.proposed.json'};if(!isDeepStrictEqual(definition,expectedDefinition))fail();
 const manifest=structuredClone(source),review=structuredClone(sourceReview),operational=read('report-operational-compatibility.proposed.json'),supplier='AutomaticReportSupplierComparisonConsent';
 if(operational.format!=='MWS_REPORT_OPERATIONAL_COMPATIBILITY_V1'||operational.tables.length!==9||manifest.knownTables.includes(supplier)||manifest.knownTables.includes('AutomaticReportEventConsent'))fail();
 manifest.id=phase==='SOURCE'?'BACKOFFICE_COMPANY_CURRENT_CAPTURE_SOURCE_V1':'BACKOFFICE_COMPANY_CURRENT_CAPTURE_PROPOSED_V1';
 manifest.purpose=currentCapturePurpose;
 const nonOwningTables=[...operational.tables.map(table=>table.name),supplier];
 manifest.companyCurrentCatalogue={format:currentCaptureCatalogueFormat,phase,nonOwningTables};
 for(const table of operational.tables){if(manifest.knownTables.includes(table.name))fail();manifest.knownTables.push(table.name);manifest.knownColumns[table.name]=structuredClone(table.columns)}
 manifest.knownTables.push(supplier);manifest.knownColumns[supplier]=structuredClone(manifest.knownColumns.AutomaticReportRecipientConsent);
 const currentColumns=read('backoffice-company-current-columns.proposed.json');if(currentColumns.format!=='MWS_BACKOFFICE_COMPANY_CURRENT_COLUMNS_V1'||currentColumns.columns.length!==6||currentColumns.productionActivated!==false||currentColumns.ownershipInference!==false||currentColumns.scopedRecovery!==false)fail();for(const column of currentColumns.columns){if(column.position!==manifest.knownColumns[column.table]?.length+1)fail();manifest.knownColumns[column.table].push([column.name,column.type,column.notNull])}
 const additions=[...currentColumns.opaquePreservedColumns,...operational.reviewedColumns,...['recipientId','consentedBy','revokedBy','updatedBy'].map(column=>supplier+'.'+column)];
 manifest.reviewedColumns.push(...additions);
 manifest.tables.find(table=>table.name==='StoreProduct').existingTriggers=[...(manifest.tables.find(table=>table.name==='StoreProduct').existingTriggers||[]),structuredClone(operational.packageTrigger)];
 review.profileId=manifest.id;
 for(const column of additions){if(review.columns.some(entry=>entry.column===column))fail();review.columns.push({column,classification:'CURRENT_COMPANY_NONOWNING_CATALOGUE_PRESERVE'})}
 if(phase==='TARGET'){const column='BackofficeStaffAccount.companyCapabilities';manifest.knownColumns.BackofficeStaffAccount.push(['companyCapabilities','jsonb',true]);manifest.reviewedColumns.push(column);review.columns.push({column,classification:'COMPANY_SECURITY_POLICY_NEVER_STORE_OWNERSHIP_OR_DELETION_SELECTOR'})}
 if(manifest.tables.some(table=>nonOwningTables.includes(table.name))||manifest.knownTables.length!==287||review.executionEnabled!==false)fail();
 return{manifest,review};
}
export function assertCompanyCurrentCaptureManifest(manifest){
 const phase=manifest?.companyCurrentCatalogue?.phase;
 if(manifest?.purpose!==currentCapturePurpose||!['SOURCE','TARGET'].includes(phase)||!isDeepStrictEqual(manifest,buildCompanyCurrentCaptureProposal(undefined,undefined,{phase}).manifest))fail();
 return manifest.companyCurrentCatalogue;
}
// Both checks read exact metadata only. The filtered transaction is usable only
// for inspecting the already-installed legacy guard plan, after exact review.
export async function inspectCompanyCurrentCaptureDefaults(tx,schema,{phase='SOURCE'}={}){
 if(!['SOURCE','TARGET'].includes(phase))fail();
 const artifact=read('backoffice-company-current-defaults.proposed.json');
 if(artifact.format!=='MWS_COMPANY_CURRENT_CAPTURE_DEFAULT_REVIEW_V1'||artifact.policy!=='SOURCE_DERIVED_DEFAULTS_ONLY_NO_LIVE_ROW_OR_SCHEMA_ADMISSION'||Object.keys(artifact.tables).length!==14)fail();
 for(const input of artifact.sourceFiles)if(createHash('sha256').update(readFileSync(new URL('../../../'+input.path,import.meta.url))).digest('hex')!==input.sha256)fail();
 const immutable=JSON.parse(readFileSync(new URL('../../test/fixtures/ftext-full-schema-metadata-20261024.json',import.meta.url),'utf8'));
 const expected=immutable.columns.map(column=>({table:column.table,name:column.name,defaultExpression:column.default??null,identity:column.identity,generated:column.generated}));
 for(const [table,definition] of Object.entries(artifact.tables))for(const column of definition.columns)expected.push({table,...column});
 // Canonical chat-interactions.mjs ALTER declarations add nullable TEXT without defaults.
 for(const name of ['replyToId','forwardBinding'])expected.push({table:'StoreChatMessage',name,defaultExpression:null,identity:'',generated:''});
 if(phase==='TARGET')expected.push({table:'BackofficeStaffAccount',name:'companyCapabilities',defaultExpression:"'[]'::jsonb",identity:'',generated:''});
 const tables=[...new Set(expected.map(column=>column.table))];
 const actual=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",a.attname AS name,pg_get_expr(d.adbin,d.adrelid) AS "defaultExpression",a.attidentity::text AS identity,a.attgenerated::text AS generated FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,schema,tables);
 const extras=read('backoffice-company-current-columns.proposed.json').columns;
 for(const column of extras)expected.push({table:column.table,name:column.name,defaultExpression:column.defaultExpression,identity:column.identity,generated:column.generated});
 const order=rows=>rows.slice().sort((a,b)=>(a.table+'.'+a.name).localeCompare(b.table+'.'+b.name));
 if(!isDeepStrictEqual(order(actual),order(expected)))fail();
 return actual;
}
export async function inspectCompanyCurrentCaptureSource(tx,schema,{phase='SOURCE'}={}){
 const source=read('monthly-inventory-capture-manifest.proposed.json');
 const currentColumns=read('backoffice-company-current-columns.proposed.json');
 const columns=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",a.attname AS name,a.attnum::int AS position,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull",pg_get_expr(d.adbin,d.adrelid) AS "defaultExpression",a.attidentity::text AS identity,a.attgenerated::text AS generated FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND a.attname=ANY($3::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,schema,['PurchaseOrder','StoreProduct','TableOrder'],currentColumns.columns.map(column=>column.name));
 if(!isDeepStrictEqual(columns,currentColumns.columns))fail();
 const checks=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",k.conname AS name,k.contype::text AS kind,k.convalidated AS validated,k.condeferrable AS deferrable,k.condeferred AS deferred,pg_get_constraintdef(k.oid,true) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname='StoreProduct' AND k.conname='StoreProduct_costPriceOverride_check'`,schema);if(!isDeepStrictEqual(checks,[currentColumns.costCheck]))fail();
 const defaults=await inspectCompanyCurrentCaptureDefaults(tx,schema,{phase});
 const operational=await prepareOperationalReportInspection(tx,schema);
 const {prepareAutomaticReportConsentInspection}=await import('./automatic-report-consent-inspection.js');
 const supplier=await prepareAutomaticReportConsentInspection(operational.tx,schema,source,{extensions:['AutomaticReportSupplierComparisonConsent']});
 const projected=new Proxy(supplier.tx,{get(target,key){const value=target[key];if(key==='$queryRawUnsafe')return async(sql,...values)=>{const rows=await value.call(target,sql,...values);if(values.length===1&&values[0]===schema&&sql.startsWith('SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,'))return rows.filter(row=>!currentColumns.columns.some(column=>column.table===row.table&&column.name===row.name));return rows};return typeof value==='function'?value.bind(target):value}});
 return{tx:projected,evidence:{format:currentCaptureCatalogueFormat,columns,checks,defaults,operational:operational.evidence,supplier:supplier.evidence}};
}
