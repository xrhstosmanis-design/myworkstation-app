import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewedFreshStoreManifest} from '../src/services/store-lifecycle-manifest.js';
import {createLifecycleExecutionCore} from '../src/services/store-lifecycle-executor.js';
const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8'));
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
 const review=read('../../ops/backup/lifecycle/column-review.json');assert.equal(review.executionEnabled,false);assert.deepEqual([...new Set(review.columns.map(c=>c.column))].sort(),m.reviewedColumns);
 const proposed=read('../../ops/backup/lifecycle/automatic-report-manifest.proposed.json');
 assert.deepEqual(m,proposed);assert.deepEqual(review,read('../../ops/backup/lifecycle/automatic-report-column-review.proposed.json'));
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
 assert.equal(nodes.get('OnlineOrderingConfig').reset,'REMOVE');assert.deepEqual(nodes.get('OnlineOrderingConfig').owner,{kind:'DIRECT'});
 const copy=reviewedFreshStoreManifest();copy.tables.length=0;assert.ok(reviewedFreshStoreManifest().tables.length>100,'Caller mutated canonical selection.');
});
