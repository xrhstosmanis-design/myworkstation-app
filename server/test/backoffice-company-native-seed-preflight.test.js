import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeCompanyPartyReportSeedPlan} from './fixtures/backoffice-company-party-reports-native.mjs';
import {nativeLegacyStoreReportSeedPlan} from './fixtures/backoffice-store-reports-legacy-native.mjs';
import {nativeCompanyInventorySeedPlan} from './fixtures/backoffice-company-inventory-reports-native.mjs';
const metadata=JSON.parse(readFileSync(new URL('./fixtures/ftext-full-schema-metadata-20261024.json',import.meta.url),'utf8'));
function validateSeedPlan(plan){
 for(const {table,row}of plan){
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
   else assert.fail(`Unreviewed seed type ${table}.${name}: ${type}`);
  }
  for(const column of columns.filter(c=>c.required&&c.default===null))assert.ok(Object.hasOwn(row,column.name),`Missing required ${table}.${column.name}`);
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
