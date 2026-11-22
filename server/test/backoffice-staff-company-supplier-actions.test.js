import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {
 changeStaffCompanyCapability,staffCompanyRequestCapability,staffSupplierManagementRoute,
 supplierBalanceAdjustCapability,supplierContactPath,supplierDeactivateCapability
} from '../../shared/backoffice-staff-company.mjs';

const source=readFileSync(new URL('../src/services/backoffice-staff-supplier-actions.js',import.meta.url),'utf8')
 .replace(/^import .*;$/gm,'').replace('export async function','async function');
const createWriter=new Function(
 'z','createHash','staffSupplierManagementRoute','supplierBalanceAdjustCapability','supplierDeactivateCapability','staffError','requireStaffCompanyGrant',
 source+';return applyStaffSupplierAction');
const updatedAt='2026-11-22T09:40:00.000Z',operationId='891d3ac0-6378-446a-836e-c62503e6796c';

function fixture({adjust=true,revision=7,supplier={active:true,updatedAt},change={}}={}){
 const calls=[],audits=[];
 const event=adjust?'SUPPLIER_BALANCE_ADJUSTED':'SUPPLIER_DEACTIVATED';
 const capability=adjust?supplierBalanceAdjustCapability:supplierDeactivateCapability;
 const req={
  method:'POST',originalUrl:supplierContactPath+'/supplier/'+(adjust?'balance-adjustments':'deactivate'),params:{partyId:'supplier'},
  user:{id:'staff',companyId:'company',staffAccess:true},staffCompanyGrant:{capability,companyId:'company',revision:7},
  get:name=>name==='x-backoffice-company-id'?'company':undefined,
  body:{operationId,confirmed:true,...(adjust?{amount:-12.5544,note:'Συμφωνία με υπόλοιπο'}:{reason:'Διπλή καρτέλα',updatedAt}),...change}
 };
 const tx={
  $queryRaw:async(parts,...values)=>{
   const sql=parts.join('?');
   if(sql.includes('FROM "Supplier"')){
    calls.push('lock-supplier');assert.match(sql,/FOR UPDATE/);assert.deepEqual(values,['supplier','company']);return supplier?[supplier]:[];
   }
   calls.push('read-audit');assert.match(sql,/FROM "BackofficeStaffAudit"/);
   assert.deepEqual(values.slice(1),['company','staff',event]);return audits;
  },
  $executeRaw:async(parts,...values)=>{
   const sql=parts.join('?');
   assert.doesNotMatch(sql,/DELETE|StoreTransaction|PurchaseDocument/);
   if(sql.includes('INSERT INTO "SupplierBalanceAdjustment"')){
    calls.push('adjust');assert.deepEqual(values.slice(1,6),['company','supplier',-12.5544,'Συμφωνία με υπόλοιπο','staff']);
   }else if(sql.includes('UPDATE "Supplier"')){
    calls.push('deactivate');assert.match(sql,/SET "active"=false/);assert.deepEqual(values,['supplier','company']);
    supplier.active=false;
   }else{
    calls.push('audit');assert.match(sql,/INSERT INTO "BackofficeStaffAudit"/);assert.deepEqual(values.slice(1,5),['company','staff','staff',event]);
    audits.push({detail:JSON.parse(values[5])});
   }
  }
 };
 const writer=createWriter(z,createHash,staffSupplierManagementRoute,supplierBalanceAdjustCapability,supplierDeactivateCapability,
  (status=403,code='STAFF_DENIED',message='denied')=>Object.assign(new Error(message),{status,code}),
  async(db,user,received)=>{assert.equal(db,tx);assert.equal(user,req.user);assert.equal(received,capability);calls.push('live-grant');return {revision}});
 return {calls,req,write:()=>writer({$transaction:async fn=>fn(tx)},req)};
}

test('balance and status authority are company-only and independently assigned exact action routes',()=>{
 for(const [suffix,key] of [['balance-adjustments',supplierBalanceAdjustCapability],['deactivate',supplierDeactivateCapability]]){
  assert.equal(staffCompanyRequestCapability('POST',supplierContactPath+'/supplier/'+suffix),key);
  assert.equal(staffCompanyRequestCapability('DELETE',supplierContactPath+'/supplier/'+suffix),null);
  assert.equal(staffCompanyRequestCapability('POST',supplierContactPath+'/%2Fforeign/'+suffix),null);
  assert.equal(staffCompanyRequestCapability('POST',supplierContactPath+'/supplier/'+suffix+'/anything'),null);
 }
 const balance=changeStaffCompanyCapability([],supplierBalanceAdjustCapability,true);
 assert.ok(balance.includes('supplier-balances.read'));
 assert.ok(!balance.includes(supplierDeactivateCapability));
});

test('balance mutation and soft deactivation recheck authority and audit atomically, and replay without writes',async()=>{
 for(const adjust of [true,false]){
  const f=fixture({adjust}),first=await f.write(),replay=await f.write();
  assert.deepEqual(first,replay);
  assert.equal(first.supplierId,'supplier');
  assert.deepEqual(f.calls,['live-grant','lock-supplier','read-audit',adjust?'adjust':'deactivate','audit','live-grant','lock-supplier','read-audit']);
  f.req.body=adjust?{...f.req.body,amount:33}:{...f.req.body,reason:'Αλλαγή αιτιολογίας'};
  await assert.rejects(f.write(),{status:409,code:'STAFF_SUPPLIER_ACTION_CHANGED'});
 }
});

test('foreign or inactive targets, stale grants and payloads fail without writing',async()=>{
 for(const [options,status,calls] of [
  [{revision:8},403,['live-grant']],
  [{supplier:null},404,['live-grant','lock-supplier']],
  [{supplier:{active:false,updatedAt}},409,['live-grant','lock-supplier','read-audit']],
  [{adjust:false,change:{updatedAt:'2026-11-22T09:39:00.000Z'}},409,['live-grant','lock-supplier','read-audit']],
  [{change:{amount:0}},400,[]],
  [{change:{confirmed:false}},400,[]]
 ]){
  const f=fixture(options);
  await assert.rejects(f.write(),{status});
  assert.deepEqual(f.calls,calls);
 }
 const f=fixture();f.req.get=()=> 'other-company';
 await assert.rejects(f.write(),{status:403});
 assert.deepEqual(f.calls,[]);
});
