import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewedFreshStoreManifest} from '../src/services/store-lifecycle-manifest.js';
import {createLifecycleExecutionCore} from '../src/services/store-lifecycle-executor.js';
const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8'));
const chatTables=['StoreChatDelivery','StoreChatReaction'];
const chatColumns=['StoreChatDelivery.messageId','StoreChatDelivery.userId','StoreChatMessage.replyToId','StoreChatReaction.messageId','StoreChatReaction.userId'];
const historicalChatReference={parent:'StoreChatMessage',columns:[['replyToId','id']],historical:true};
// Exactly undo this reviewed additive delta when comparing immutable older documents.
function withoutChatDelta(manifest){
 const prior=structuredClone(manifest);
 prior.knownTables=prior.knownTables.filter(name=>!chatTables.includes(name));
 for(const name of chatTables)delete prior.knownColumns[name];
 prior.knownColumns.StoreChatMessage=prior.knownColumns.StoreChatMessage.filter(column=>column[0]!=='replyToId');
 prior.tables=prior.tables.filter(node=>!chatTables.includes(node.name));
 const message=prior.tables.find(node=>node.name==='StoreChatMessage');
 message.references=message.references.filter(reference=>JSON.stringify(reference)!==JSON.stringify(historicalChatReference));
 prior.reviewedColumns=prior.reviewedColumns.filter(name=>!chatColumns.includes(name));
 return prior;
}
test('canonical new-start manifest covers reviewed ownership and retains both installations without expanding into shared company data',()=>{
 const m=reviewedFreshStoreManifest(),metadata=read('../../CHECKPOINTS/EVIDENCE/store-lifecycle-20261019/schema-ownership-candidates-0600.json'),nodes=new Map(m.tables.map(t=>[t.name,t]));
 assert.equal(m.resetPolicy,'FRESH_STORE_V1');assert.equal(m.streaming,true);
 for(const table of metadata.tables){
  const historical=metadata.columns.filter(c=>c.table===table.name).map(c=>[c.name,c.type,c.notNull]);
  // The dated capture is immutable. Review exactly the separately observed
  // opt-in boolean added by the existing online-ordering bootstrap.
  if(table.name==='OnlineOrderingConfig'){
   assert.equal(historical.some(c=>c[0]==='autoStockCatalogEnabled'),false);
   historical.push(['autoStockCatalogEnabled','boolean',true]);
  }
  if(table.name==='StoreChatMessage'){
   assert.equal(historical.length,21);assert.equal(historical.some(c=>c[0]==='replyToId'),false);
   historical.push(['replyToId','text',false]);
  }
  assert.deepEqual(m.knownColumns[table.name],historical,table.name);
 }
 assert.doesNotThrow(()=>createLifecycleExecutionCore(m,{sourceRevision:'1'.repeat(40),persistAndVerifyRecovery:async()=>assert.fail('pure manifest loading invoked recovery')}));
 for(const col of metadata.columns.filter(c=>c.name==='storeId'))assert.equal(nodes.get(col.table)?.owner.kind,'DIRECT',col.table);
 for(const name of ['Company','CompanyModule','Product','MasterProduct','User','UserSession','Supplier','ProviderConnection','WholesaleCustomer','WorkforceRole','PlatformPosDraft'])assert.equal(nodes.has(name),false,name);
 for(const name of ['StoreInstallationTerminal','StoreFiscalDevice','StoreEftposDevice','StoreRbsInstallationSettings','CloudDevice','CloudDeviceCursor','ConnectorDevice','StorePaidModule','NetlinkStoreConfig'])assert.equal(nodes.get(name)?.reset,'KEEP',name);
 for(const name of ['Employee','WorkforceEmployee','WorkforceEmployeeStoreAccess','CashShiftSession','Sale','Payment','FiscalDocument','StoreProduct','StockMovement','Stocktake','StoreOperatorCredential','StoreOperatorSession','ShiftType','InventoryZone','AiReaderJob','PosInvoiceBackgroundTask'])assert.equal(nodes.get(name)?.reset,'REMOVE',name);
 assert.deepEqual(nodes.get('ProviderOutbox').owner.match,{aggregateType:'DISPATCH_NOTE'});
 assert.equal(nodes.get('StoreIntegrationCredential').reset,'REMOVE');assert.deepEqual(m.valueGuards,[{table:'StoreIntegrationCredential',column:'kind',allowed:['MYDATA','VAT_LOOKUP']}]);
 assert.equal(nodes.get('WorkforceEmployee').owner.kind,'BASE_STORE');
 assert.deepEqual(nodes.get('WholesalePortalSession').owner.columns,[['accountId','id'],['siteId','siteId'],['companyId','companyId']]);
 for(const node of nodes.values())if(node.owner.kind==='CHILD')assert.ok(metadata.foreignKeys.some(f=>f.child===node.name&&f.parent===node.owner.parent&&JSON.stringify(f.local)===JSON.stringify(node.owner.columns.map(p=>p[0]))&&JSON.stringify(f.remote)===JSON.stringify(node.owner.columns.map(p=>p[1]))),node.name);
 const review=read('../../ops/backup/lifecycle/column-review.json');assert.equal(review.executionEnabled,false);assert.deepEqual([...new Set(review.columns.map(c=>c.column))].sort(),m.reviewedColumns.filter(c=>!c.startsWith('BackofficeStaff')));
 const proposed=read('../../ops/backup/lifecycle/automatic-report-manifest.proposed.json');
 // The retained automatic-report proposal is an immutable prior catalogue;
 // inverse-project only Chat, then the already reviewed Staff/FTEXT additions.
 const withoutFtext=withoutChatDelta(m);delete withoutFtext.ftextRecoveryAcceptance;
 withoutFtext.knownTables=withoutFtext.knownTables.filter(n=>!n.startsWith('BackofficeStaff'));for(const name of Object.keys(withoutFtext.knownColumns))if(name.startsWith('BackofficeStaff'))delete withoutFtext.knownColumns[name];withoutFtext.reviewedColumns=withoutFtext.reviewedColumns.filter(n=>!n.startsWith('BackofficeStaff'));withoutFtext.tables=withoutFtext.tables.filter(n=>n.name!=='BackofficeStaffGrant');
 assert.deepEqual(nodes.get('BackofficeStaffGrant'),{name:'BackofficeStaffGrant',owner:{kind:'DIRECT'},reset:'KEEP'});for(const name of ['BackofficeStaffAccount','BackofficeStaffAudit','BackofficeStaffLoginGuard'])assert.equal(nodes.has(name),false,name);
 withoutFtext.knownTables=withoutFtext.knownTables.filter(n=>n!=='FtextCashRequest');delete withoutFtext.knownColumns.FtextCashRequest;
 withoutFtext.reviewedColumns=withoutFtext.reviewedColumns.filter(n=>!n.startsWith('FtextCashRequest.'));withoutFtext.tables=withoutFtext.tables.filter(n=>n.name!=='FtextCashRequest');
 assert.deepEqual(withoutFtext,proposed);
 assert.deepEqual({...review,columns:review.columns.filter(c=>!chatColumns.includes(c.column)&&!c.column.startsWith('FtextCashRequest.'))},read('../../ops/backup/lifecycle/automatic-report-column-review.proposed.json'));
 const dispatch=['AutomaticReportDispatchPolicy','AutomaticReportAutomationGrant','AutomaticReportRecipient','AutomaticReportRecipientConsent','AutomaticReportPayload','AutomaticReportDeliverySlot'];
 const oracle=read('./fixtures/automatic-report-provision-catalog-pg18.json');assert.equal(oracle.serverMajor,18);
 assert.deepEqual(oracle.tables.map(t=>t.name).sort(),[...dispatch].sort());
 const sqlType={_text:'text[]',bool:'boolean',bytea:'bytea',int4:'integer',int8:'bigint',jsonb:'jsonb',text:'text',timestamptz:'timestamp with time zone'};
 for(const name of dispatch){
  assert.equal(m.knownTables.filter(n=>n===name).length,1,name);
  assert.deepEqual(nodes.get(name).owner,{kind:'DIRECT'},name);assert.equal(nodes.get(name).reset,'REMOVE',name);
  const native=oracle.tables.find(t=>t.name===name);
  for(const column of native.columns){assert.equal(column.type_schema,'pg_catalog');assert.equal(column.modifier,-1);assert.ok(Object.hasOwn(sqlType,column.type),column.type);assert.equal(column.dropped,false)}
  assert.deepEqual(m.knownColumns[name],native.columns.map(c=>[c.name,sqlType[c.type],c.not_null]),name);
 }
 assert.equal(m.knownColumns.AutomaticReportDeliverySlot.length,7);
 const printing=['ProductionPrinter','ProductionPrintRequest','ProductionPrintJob','ProductionPrintResolution'];
 for(const name of printing){
  assert.equal(m.knownTables.filter(n=>n===name).length,1,name);
  assert.deepEqual(nodes.get(name).owner,{kind:'DIRECT'},name);
  assert.equal(nodes.get(name).reset,'REMOVE',name);
  assert.ok(m.knownColumns[name].some(c=>c[0]==='companyId'&&c[1]==='text'&&c[2]),name);
  assert.ok(m.knownColumns[name].some(c=>c[0]==='storeId'&&c[1]==='text'&&c[2]),name);
 }
 for(const name of ['ProductionPrintRequest','ProductionPrintJob'])assert.deepEqual(nodes.get(name).references,[{parent:'StorePreparationBatch',columns:[['batchId','id']],historical:true}]);
 assert.deepEqual(nodes.get('ProductionPrintResolution').references,[{parent:'ProductionPrintJob',columns:[['jobId','id']],historical:true}]);
 for(const col of ['ProductionPrinter.settings','ProductionPrinter.tokenHash','ProductionPrinter.pairHash','ProductionPrintRequest.requestId','ProductionPrintRequest.response','ProductionPrintJob.ticket','ProductionPrintJob.claimId','ProductionPrintJob.claimedBy','ProductionPrintResolution.actorId'])assert.ok(review.columns.some(c=>c.column===col&&c.classification==='OWNED_RECORD_PAYLOAD_OR_ACTOR_EXTERNAL_POLYMORPHIC_ID_NEVER_USED_TO_EXPAND_DELETION'),col);
 assert.equal(nodes.get('OnlineOrderingConfig').reset,'REMOVE');assert.deepEqual(nodes.get('OnlineOrderingConfig').owner,{kind:'DIRECT'});
 const copy=reviewedFreshStoreManifest();copy.tables.length=0;assert.ok(reviewedFreshStoreManifest().tables.length>100,'Caller mutated canonical selection.');
});

test('native-observed Chat delta stays identical across BASE, Snapshot and CAPTURE3 with non-owning historical references',()=>{
 const profiles=[['manifest.json','column-review.json',274,191],['monthly-inventory-snapshot-manifest.proposed.json','monthly-inventory-snapshot-column-review.proposed.json',275,192],['monthly-inventory-capture-manifest.proposed.json','monthly-inventory-capture-column-review.proposed.json',277,194]];
 const expectedColumns={StoreChatDelivery:[['messageId','text',true],['userId','text',true],['companyId','text',true],['storeId','text',true],['deliveredAt','timestamp with time zone',true]],StoreChatReaction:[['messageId','text',true],['userId','text',true],['companyId','text',true],['storeId','text',true],['reaction','text',true],['updatedAt','timestamp with time zone',true]]};
 const historical='HISTORICAL_NON_OWNING_REFERENCE_FENCED_WHEN_PARENT_EXISTS_RETIRED_KEYS_PROTECTED',external='OWNED_RECORD_PAYLOAD_OR_ACTOR_EXTERNAL_POLYMORPHIC_ID_NEVER_USED_TO_EXPAND_DELETION';
 const classifications=chatColumns.map(column=>({column,classification:column.endsWith('.userId')?external:historical}));
 const documents=[],reviews=[];
 for(const[file,reviewFile,known,owned]of profiles){
  const manifest=read('../../ops/backup/lifecycle/'+file),review=read('../../ops/backup/lifecycle/'+reviewFile);documents.push(manifest);reviews.push(review);
  assert.equal(manifest.knownTables.length,known);assert.equal(manifest.tables.length,owned);assert.equal(review.executionEnabled,false);
  for(const name of chatTables){
   assert.equal(manifest.knownTables.filter(table=>table===name).length,1,name);
   assert.deepEqual(manifest.knownColumns[name],expectedColumns[name],name);
   assert.deepEqual(manifest.tables.filter(node=>node.name===name),[{name,owner:{kind:'DIRECT'},reset:'REMOVE',references:[{parent:'StoreChatMessage',columns:[['messageId','id']],historical:true}]}],name);
  }
  assert.equal(manifest.knownColumns.StoreChatMessage.length,22);assert.deepEqual(manifest.knownColumns.StoreChatMessage[21],['replyToId','text',false]);
  assert.deepEqual(manifest.tables.find(node=>node.name==='StoreChatMessage'),{name:'StoreChatMessage',owner:{kind:'DIRECT'},reset:'REMOVE',references:[{parent:'AiReaderJob',columns:[['aiReaderJobId','id']],historical:true},historicalChatReference]});
  assert.deepEqual(manifest.reviewedColumns.filter(column=>chatColumns.includes(column)),chatColumns);
  assert.deepEqual(review.columns.filter(entry=>chatColumns.includes(entry.column)).sort((a,b)=>a.column.localeCompare(b.column)),classifications);
  assert.equal(manifest.tables.some(node=>node.name==='User'),false,'external actors cannot become selected/deleted owners');
  assert.doesNotThrow(()=>createLifecycleExecutionCore(manifest,{sourceRevision:'1'.repeat(40),persistAndVerifyRecovery:async()=>assert.fail('pure Chat review cannot execute recovery')}),'historical self-reference is not recursive ownership');
 }
 // Removing only the named monthly extension restores exact current BASE;
 // arbitrary additional columns, references, nodes or flags cannot disappear.
 for(const[index,monthlyTables]of [[1,['MonthlyInventorySnapshot']],[2,['MonthlyInventorySnapshot','MonthlyInventoryCaptureGrant','MonthlyInventoryCaptureJob']]]){
  const projected=structuredClone(documents[index]);projected.id=documents[0].id;
  projected.knownTables=projected.knownTables.filter(name=>!monthlyTables.includes(name));
  for(const name of monthlyTables)delete projected.knownColumns[name];
  projected.tables=projected.tables.filter(node=>!monthlyTables.includes(node.name));
  projected.reviewedColumns=projected.reviewedColumns.filter(column=>!monthlyTables.includes(column.split('.')[0]));
  assert.deepEqual(projected,documents[0]);
  const projectedReview=structuredClone(reviews[index]);projectedReview.profileId=reviews[0].profileId;
  projectedReview.columns=projectedReview.columns.filter(entry=>!monthlyTables.includes(entry.column.split('.')[0]));
  assert.deepEqual(projectedReview,reviews[0]);
 }
});
