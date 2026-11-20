// Offline deterministic guard review generator. No SQL, credentials or runtime activation.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {reviewLifecycleGuardDefinitions} from '../src/services/store-lifecycle-executor.js';
import {buildCompanyCurrentCaptureProposal,currentCaptureSourceFencePlanHash} from '../src/services/backoffice-company-current-capture.js';
const root=new URL('../../',import.meta.url),read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8')),hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const artifact='ops/backup/lifecycle/backoffice-company-current-capture-guards.proposed.json';
const source=read('ops/backup/lifecycle/monthly-inventory-capture-manifest.proposed.json'),target=buildCompanyCurrentCaptureProposal().manifest,metadata=read('server/test/fixtures/ftext-full-schema-metadata-20261024.json'),operational=read('ops/backup/lifecycle/report-operational-compatibility.proposed.json');
const names=new Set(target.knownTables),foreignKeys=[];
function add(child,parent,local,remote){const row={child,parent,childSchema:'public',parentSchema:'public',local,remote};if(!names.has(child)||!names.has(parent))throw Error('Unreviewed foreign key table');if(!foreignKeys.some(value=>JSON.stringify(value)===JSON.stringify(row)))foreignKeys.push(row)}
const columns=value=>value.split(',').map(value=>value.trim().replace(/^"([^"]+)"$/,'$1'));
function parse(table,definition){const match=/^FOREIGN KEY \(([^)]+)\) REFERENCES (?:(?:"public"|public)\.)?"?([A-Za-z_][A-Za-z_0-9]*)"?\s*\(([^)]+)\)/.exec(definition);if(!match)throw Error('Unreviewed FK definition');add(table,match[2],columns(match[1]),columns(match[3]))}
for(const row of metadata.constraints.filter(row=>row.kind==='f'&&names.has(row.table)))parse(row.table,row.definition);
// Reviewed canonical bootstrap FKs absent from the immutable October fixture.
// server/src/backoffice-staff-bootstrap.js and ai-owner-wallet-schema.js.
for(const child of ['AiOwnerWalletEntry','AiOwnerWalletNotice'])add(child,'AiOwnerWallet',['companyId'],['companyId']);
add('BackofficeStaffAccount','User',['userId','companyId'],['id','companyId']);
add('BackofficeStaffAudit','Company',['companyId'],['id']);
add('BackofficeStaffGrant','BackofficeStaffAccount',['userId','companyId'],['userId','companyId']);
add('BackofficeStaffGrant','Store',['storeId','companyId'],['id','companyId']);
for(const table of ['MonthlyInventorySnapshot','MonthlyInventoryCaptureGrant','MonthlyInventoryCaptureJob']){add(table,'Company',['companyId'],['id']);add(table,'Store',['storeId'],['id'])}
for(const column of ['delegatorUserId','createdByUserId','grantedByUserId','revokedByUserId','updatedByUserId'])add('MonthlyInventoryCaptureGrant','User',[column],['id']);
add('MonthlyInventoryCaptureJob','MonthlyInventoryCaptureGrant',['grantId','companyId','storeId','lifecycleGeneration','purpose','purposeVersion'],['id','companyId','storeId','lifecycleGeneration','purpose','purposeVersion']);
for(const row of operational.catalogue.constraints.filter(row=>row.kind==='f'))parse(row.table,row.definition);
add('AutomaticReportSupplierComparisonConsent','AutomaticReportRecipient',['companyId','storeId','recipientId'],['companyId','storeId','recipientId']);
foreignKeys.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const phaseRows=Object.fromEntries([['SOURCE',source],['TARGET',target]].map(([phase,manifest])=>[phase,{guardPlanHash:hash(manifest),guards:reviewLifecycleGuardDefinitions(manifest,{schema:'public',foreignKeys})}]));
const variable=['table','name','mask','bodySha256','functionName'],defaults=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!variable.includes(key))),guardDefaults=defaults(phaseRows.SOURCE.guards[0]);
for(const phase of Object.values(phaseRows))phase.guards=phase.guards.map(row=>{if(JSON.stringify(defaults(row))!==JSON.stringify(guardDefaults)||row.functionName!==row.name)throw Error('Guard defaults differ');return Object.fromEntries(variable.filter(key=>key!=='functionName').map(key=>[key,row[key]]))});
const existingTriggers=source.tables.flatMap(table=>(table.existingTriggers||[]).map(trigger=>({table:table.name,...trigger})));existingTriggers.push({table:'StoreProduct',...operational.packageTrigger});
// Exact internal layouts from the native executor/worker CREATE statements.
const required=(name,type,defaultExpression=null)=>({name,type,notNull:true,defaultExpression,identity:'',generated:''}),optional=(name,type)=>({...required(name,type),notNull:false});
const internalColumns={
 StoreLifecycleFence:[required('storeId','text'),required('companyId','text'),required('generation','bigint','0'),required('maintenance','boolean','false'),required('retired','boolean','false'),optional('operationId','text'),required('planHash','text')],
 StoreLifecycleExecution:[...['id','companyId','storeId','mode','planHash','snapshotHash','state'].map(name=>required(name,'text')),required('expiresAt','timestamp with time zone'),optional('result','jsonb')],
 StoreLifecycleTombstone:[...['id','companyId','storeId','schemaName','parentTable'].map(name=>required(name,'text')),required('refColumns','jsonb'),required('refValues','jsonb'),required('generation','bigint'),required('operationId','text')],
 StoreLifecycleRuntime:['id','heartbeatJson','mac'].map(name=>required(name,'text'))
};
const review={format:'MWS_BACKOFFICE_CURRENT_CAPTURE_GUARD_REVIEW_V1',schema:'public',sourceFencePlanHash:currentCaptureSourceFencePlanHash,internalColumns,foreignKeys,guardDefaults,existingTriggers,phases:phaseRows};

if(process.argv.includes('--write')){writeFileSync(new URL(artifact,root),JSON.stringify(review,null,2)+'\n');console.log('CURRENT_CAPTURE_GUARD_REVIEW_PREPARED')}
else{if(JSON.stringify(read(artifact))!==JSON.stringify(review))throw Error('Current capture reviewed guard artifact changed');console.log('CURRENT_CAPTURE_GUARD_REVIEW_MATCH')}
