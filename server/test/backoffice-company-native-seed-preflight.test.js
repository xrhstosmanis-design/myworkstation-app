import {nativeCompanyProductCenterSeedPlan} from './fixtures/backoffice-company-product-center-native.mjs';
import {nativeCompanyOperationsSeedPlan} from './fixtures/backoffice-company-operations-native.mjs';
import {nativeCompanyWholesaleSeedPlan} from './fixtures/backoffice-company-wholesale-native.mjs';
import {nativeCompanyPartyControlSeedPlan} from './fixtures/backoffice-company-party-control-native.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeCompanyOwnerReportSeedPlan} from './fixtures/backoffice-company-owner-reports-native.mjs';
import {nativeCompanyConfigurationSeedPlan} from './fixtures/backoffice-company-configuration-native.mjs';
import {nativeCompanyPartyReportSeedPlan} from './fixtures/backoffice-company-party-reports-native.mjs';
import {nativeLegacyStoreReportSeedPlan} from './fixtures/backoffice-store-reports-legacy-native.mjs';
import {nativeCompanyInventorySeedPlan} from './fixtures/backoffice-company-inventory-reports-native.mjs';
const metadata=JSON.parse(readFileSync(new URL('./fixtures/ftext-full-schema-metadata-20261024.json',import.meta.url),'utf8'));
function validateSeedPlan(plan){
 for(const {table,row,mode='INSERT'}of plan){
  assert.ok(['INSERT','UPDATE'].includes(mode));
  const columns=metadata.columns.filter(c=>c.table===table);assert.ok(columns.length,`Unknown table ${table}`);
  for(const [name,value]of Object.entries(row)){
   const column=columns.find(c=>c.name===name);assert.ok(column,`Unknown column ${table}.${name}`);assert.notEqual(value,undefined,`Undefined ${table}.${name}`);
   if(value===null){assert.equal(column.required,false,`NOT NULL ${table}.${name} (defaults do not permit explicit NULL)`);continue}
   const type=column.type;
   if(type==='text')assert.equal(typeof value,'string',`${table}.${name} text`);
   else if(type==='boolean')assert.equal(typeof value,'boolean',`${table}.${name} boolean`);
   else if(type==='integer'||type==='bigint')assert.ok(Number.isSafeInteger(value),`${table}.${name} integer`);
   else if(type.startsWith('numeric')||type==='double precision')assert.ok(typeof value==='number'&&Number.isFinite(value),`${table}.${name} finite numeric`);
   else if(type==='jsonb'||type==='json'){assert.ok(typeof value==='object'&&!(value instanceof Date),`${table}.${name} JSON`);assert.equal(typeof JSON.stringify(value),'string')}
   else if(type.startsWith('timestamp'))assert.ok(value instanceof Date&&Number.isFinite(value.getTime()),`${table}.${name} timestamp`);
   else if(/^"[^"]+"$/.test(type)){const definition=metadata.enums.find(e=>e.name===type.slice(1,-1));assert.ok(definition,`Unknown enum ${type}`);assert.ok(definition.labels.includes(value),`${table}.${name} valid enum label`)}
   else assert.fail(`Unreviewed seed type ${table}.${name}: ${type}`);
  }
  for(const column of columns.filter(c=>mode==='INSERT'&&c.required&&c.default===null))assert.ok(Object.hasOwn(row,column.name),`Missing required ${table}.${column.name}`);
 }
}
test('COMPANY32 native financial seed plan matches actual immutable column metadata including explicit NULL/default semantics',()=>{
 assert.equal(metadata.format,'FTEXT_FULL_SCHEMA_METADATA_NO_BUSINESS_ROWS_V1');assert.equal(metadata.serverVersion,'180004');
 const plan=nativeCompanyInventorySeedPlan();assert.equal(plan.length,32);validateSeedPlan(plan);
 assert.ok(plan.some(({table,row})=>table==='StocktakeLine'&&row.unitCost===null),'native unknown cost uses a genuinely nullable column');
 assert.ok(plan.some(({table,row})=>table==='Product'&&row.costPrice===0),'real zero remains a stored native numeric value');
 // This is schema-only preflight, never evidence that PostgreSQL SQL ran.
});
test('preflight rejects explicit NULL even when NOT NULL has a default, unknown columns and omitted required columns',()=>{
 const product=nativeCompanyInventorySeedPlan().find(r=>r.table==='Product');
 assert.ok(metadata.columns.find(c=>c.table==='Product'&&c.name==='costPrice').default!==null);
 for(const name of ['costPrice','salePrice'])assert.throws(()=>validateSeedPlan([{table:'Product',row:{...product.row,[name]:null}}]),new RegExp('NOT NULL Product\\.'+name));
 assert.throws(()=>validateSeedPlan([{table:'Product',row:{...product.row,notAColumn:1}}]),/Unknown column/);
 const {companyId,...missing}=product.row;assert.throws(()=>validateSeedPlan([{table:'Product',row:missing}]),/Missing required Product.companyId/);
});

test('STORE74 legacy eight-column financial seed plan passes metadata preflight without COMPANY authority fields',()=>{const plan=nativeLegacyStoreReportSeedPlan();assert.ok(plan.length>40);validateSeedPlan(plan);assert.ok(plan.every(({row})=>!Object.hasOwn(row,'companyCapabilities')));});

test('COMPANY36 party-report financial seeds obey actual schema nullable/default rules',()=>{const plan=nativeCompanyPartyReportSeedPlan();assert.equal(plan.length,23);validateSeedPlan(plan);assert.ok(plan.some(({row})=>row.totalGross===-30));assert.ok(plan.some(({row})=>row.amount===0));});

test('COMPANY53 configuration seed plan validates every JSON, terminal type and explicit nullable/default column',()=>{const plan=nativeCompanyConfigurationSeedPlan();validateSeedPlan(plan);assert.ok(plan.length>20);assert.ok(plan.some(e=>e.mode==='UPDATE'&&e.table==='Company'));assert.ok(plan.some(e=>e.table==='ManagementParameters'));});

test('COMPANY61 owner-report seed plan matches actual schema including real employee enum labels and nullable financial columns',()=>{const plan=nativeCompanyOwnerReportSeedPlan();validateSeedPlan(plan);assert.ok(plan.length>30);const employee=plan.find(e=>e.table==='Employee');assert.throws(()=>validateSeedPlan([{...employee,row:{...employee.row,type:'INVALID_EMPLOYEE_TYPE'}}]),/valid enum label/);assert.ok(plan.some(e=>e.table==='MasterProduct'&&e.row.defaultCostPrice===0));});

test('COMPANY74 supplier/customer native control seeds validate every real column, enum and explicit NULL',()=>{const plan=nativeCompanyPartyControlSeedPlan();validateSeedPlan(plan);assert.equal(plan.length,55);assert.ok(plan.some(e=>e.table==='CustomerOperatorCardLink'));assert.ok(plan.some(e=>e.table==='Customer'&&e.row.points===12.5));assert.ok(plan.every(e=>e.table!=='CustomerLoyaltyLedger'));});

test('native work-card seed hashes obey the actual global non-null unique index',()=>{
 assert.ok(metadata.indexes.includes('CREATE UNIQUE INDEX \"StoreOperatorCredential_card_hash_idx\" ON public.\"StoreOperatorCredential\" USING btree (\"cardCodeHash\") WHERE (\"cardCodeHash\" IS NOT NULL)'));
 const validate=plan=>{const hashes=plan.filter(e=>e.table==='StoreOperatorCredential'&&e.row.cardCodeHash!==null&&e.row.cardCodeHash!==undefined).map(e=>e.row.cardCodeHash);assert.equal(new Set(hashes).size,hashes.length,'duplicate non-null StoreOperatorCredential.cardCodeHash');};
 const plan=nativeCompanyPartyControlSeedPlan();validate(plan);const credentials=plan.filter(e=>e.table==='StoreOperatorCredential');assert.throws(()=>validate(credentials.map(e=>({...e,row:{...e.row,cardCodeHash:'DUPLICATE_SYNTHETIC_HASH'}}))),/duplicate non-null/);
});

test('COMPANY82 paid wholesale seed plan uses real nullable tiers, composite tenant references and native user enum',()=>{const plan=nativeCompanyWholesaleSeedPlan();validateSeedPlan(plan);assert.equal(plan.length,84);const tiers=plan.filter(e=>e.table==='WholesalePriceListProduct'&&e.row.companyId==='company'&&e.row.productId==='whole82-product-own');assert.equal(tiers.length,51);assert.ok(tiers.some(e=>e.row.unitPrice===0));assert.ok(tiers.some(e=>e.row.unitPrice===null&&e.row.priceBasis===null));});

test('COMPANY88 operations seeds match actual connector/provider/dispatch schema without invented columns',()=>{const plan=nativeCompanyOperationsSeedPlan();validateSeedPlan(plan);assert.equal(plan.length,19);assert.ok(plan.some(e=>e.table==='ConnectorEvent'&&Object.hasOwn(e.row,'connectorDeviceId')));assert.ok(plan.some(e=>e.table==='DispatchNoteLine'));});

test('wholesale native plan obeys actual composite company foreign keys while retaining permitted scalar-FK corruption controls',()=>{
 const plan=nativeCompanyWholesaleSeedPlan(),get=(table,id)=>plan.find(e=>e.table===table&&e.row.id===id)?.row,stores={selected:'company',sibling:'company',foreign:'foreign'};
 for(const e of plan){const r=e.row;
  if(['WholesalePortalAccount','WholesalePortalPublication'].includes(e.table)){assert.equal(get('WholesalePortalSite',r.siteId)?.companyId,r.companyId);assert.equal(stores[r.storeId],r.companyId);assert.equal(get(e.table==='WholesalePortalAccount'?'WholesaleCustomer':'Product',r.customerId??r.productId)?.companyId,r.companyId)}
  if(e.table==='WholesaleSellerMembership')assert.equal(get('User',r.userId)?.companyId,r.companyId);
  if(e.table==='WholesaleSellerAssignment'){assert.equal(get('User',r.userId)?.companyId,r.companyId);assert.equal(get('WholesaleCustomer',r.customerId)?.companyId,r.companyId);assert.equal(stores[r.storeId],r.companyId);assert.ok(plan.some(e=>e.table==='WholesaleSellerMembership'&&e.row.userId===r.userId&&e.row.companyId===r.companyId))}
 }
 for(const table of ['WholesalePortalAccount','WholesalePortalPublication','WholesaleSellerMembership','WholesaleSellerAssignment'])assert.ok(metadata.constraints.some(c=>c.table===table&&c.kind==='f'&&c.definition.includes('"companyId"')));
 assert.ok(plan.some(e=>e.table==='WholesalePriceListProduct'&&e.row.companyId==='company'&&get('Product',e.row.productId)?.companyId==='foreign'),'scalar product FK permits the genuine redaction control');
});
test('operations native plan obeys immutable connector/event, dispatch and provider unique indexes',()=>{
 const plan=nativeCompanyOperationsSeedPlan();
 for(const [name,table,columns,partial]of [['ConnectorDevice_store_type_key','ConnectorDevice',['storeId','connectorType'],false],['ConnectorDevice_cloud_device_key','ConnectorDevice',['cloudDeviceId'],true],['ConnectorEvent_device_event_key','ConnectorEvent',['connectorDeviceId','eventKey'],true],['DispatchNote_company_number_key','DispatchNote',['companyId','documentNumber'],false],['ProviderOutbox_idempotency_key','ProviderOutbox',['idempotencyKey'],false]]){
  assert.ok(metadata.indexes.some(sql=>sql.startsWith('CREATE UNIQUE INDEX "'+name+'" ')),name+' actual metadata index');
  const tuples=plan.filter(e=>e.table===table&&(!partial||columns.every(c=>e.row[c]!==undefined&&e.row[c]!==null))).map(e=>JSON.stringify(columns.map(c=>e.row[c])));assert.equal(new Set(tuples).size,tuples.length,name+' unique native seed values');
 }
});

test('COMPANY100 product native seeds validate actual nullable values, JSON and immutable schema without package inventions',()=>{const plan=nativeCompanyProductCenterSeedPlan();validateSeedPlan(plan);assert.equal(plan.length,450);assert.ok(plan.every(e=>!['StoreStockPackage','PosPackageStockPosting'].includes(e.table)));assert.ok(plan.some(e=>e.table==='ProductBarcode'&&e.row.salePrice===null));assert.ok(plan.some(e=>e.table==='ProductPriceHistory'&&e.row.newPrice===null));assert.ok(plan.some(e=>e.table==='ProductSetItem'&&e.row.relatedProductId==='product100-missing'));});

test('product native seeds satisfy actual scoped uniqueness without confusing repeated archive response document IDs',()=>{
 const plan=nativeCompanyProductCenterSeedPlan();
 for(const [table,columns]of [['Product',['companyId','sku']],['ProductBarcode',['productId','barcode']],['ProductSetItem',['companyId','productId','relatedProductId']],['SupplierProductLink',['companyId','supplierId','productId']],['StocktakeLine',['stocktakeId','productId']],['StoreProductAudienceDiscount',['storeId','productId','audience']],['CustomerWholesalePrice',['companyId','customerId','productId']]]){
  assert.ok(metadata.constraints.some(c=>c.table===table&&c.kind==='u')||metadata.indexes.some(sql=>sql.startsWith('CREATE UNIQUE INDEX')&&sql.includes('public."'+table+'"')),'actual unique metadata '+table);
  const tuples=plan.filter(e=>e.table===table).map(e=>JSON.stringify(columns.map(c=>e.row[c])));assert.equal(new Set(tuples).size,tuples.length,table+' unique native seeds');
 }
 assert.equal(plan.filter(e=>e.table==='PurchaseDocumentLine'&&e.row.purchaseDocumentId==='product100-doc-own').length,252,'many distinct lines legitimately share one document');
});
