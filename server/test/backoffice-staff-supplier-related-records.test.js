import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {staffSupplierManagementRoute,supplierContactPath as prefix,supplierAddressCapability,supplierUnitCapability} from '../../shared/backoffice-staff-company.mjs';
import {createSupplierRelatedRecord,lockSupplierRelatedRecords,parseSupplierRelatedRecord,removeSupplierRelatedRecord} from '../src/services/supplier-related-records.js';

const source=readFileSync(new URL('../src/services/backoffice-staff-supplier-related-records.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export async function','async function');
const makeWriter=new Function('randomUUID','staffSupplierManagementRoute','staffError','requireStaffCompanyGrant','createSupplierRelatedRecord','lockSupplierRelatedRecords','parseSupplierRelatedRecord','removeSupplierRelatedRecord',source+';return mutateStaffSupplierRelatedRecord');
const denial=(status=403,code='STAFF_ACCESS_DENIED')=>Object.assign(new Error(code),{status,code});
function fixture({method='POST',resource='addresses',revision=1,exists=true,deleteCount=1,body={address:'Street',isPrimary:true}}={}){
 const calls=[],itemId=method==='DELETE'?'item':undefined,capability=resource==='addresses'?supplierAddressCapability:supplierUnitCapability;
 const tx={$queryRaw:async(strings,...values)=>{
  assert.match(strings.join('?'),/SELECT "id" FROM "Supplier".*FOR UPDATE/);
  assert.deepEqual(values,['supplier','company',true]);calls.push('lock');
  return exists?[{id:'supplier'}]:[];
 },$executeRaw:async(strings,...values)=>{
  const sql=strings.join('?');
  if(sql.includes('BackofficeStaffAudit')){
   calls.push('audit');assert.deepEqual(JSON.parse(values.at(-1)),{supplierId:'supplier',resource,itemId:itemId??calls.id});
  }else if(sql.startsWith('INSERT INTO')){
   calls.push('insert');[calls.id]=values;assert.deepEqual(values.slice(1,3),['company','supplier']);
  }else if(sql.startsWith('DELETE FROM')){
   calls.push('delete');assert.deepEqual(values,['item','supplier','company']);return deleteCount;
  }else{
   assert.match(sql,/^UPDATE "SupplierAddress".*"isPrimary"=true/);
   assert.deepEqual(values,['company','supplier']);calls.push('clear-primary');
  }
  return 1;
 }};
 const req={method,originalUrl:prefix+'/supplier/'+resource+(itemId?'/item':''),params:{partyId:'supplier',itemId},
  user:{id:'actor',companyId:'company',staffAccess:true},staffCompanyGrant:{capability,companyId:'company',revision:1},
  get:key=>key==='x-backoffice-company-id'?'company':undefined,body};
 const writer=makeWriter(()=> 'audit-id',staffSupplierManagementRoute,denial,
  async(db,_user,key)=>{assert.equal(db,tx);assert.equal(key,capability);calls.push('grant');return {revision}},
  createSupplierRelatedRecord,lockSupplierRelatedRecords,parseSupplierRelatedRecord,removeSupplierRelatedRecord);
 return {calls,run:()=>writer({$transaction:async fn=>fn(tx)},req)};
}
test('company supplier record routes require explicit independent grants and exact IDs',()=>{
 assert.equal(staffSupplierManagementRoute('POST',prefix+'/supplier/addresses').capability,supplierAddressCapability);
 assert.deepEqual(staffSupplierManagementRoute('DELETE',prefix+'/supplier/units/item'),{supplierId:'supplier',resource:'units',capability:supplierUnitCapability,itemId:'item'});
 for(const [method,path] of [['DELETE','/supplier/addresses'],['PATCH','/supplier/units/item'],['POST','/supplier/units/item'],['DELETE','/supplier/addresses/%2Fother'],['POST','/supplier/units/']])assert.equal(staffSupplierManagementRoute(method,prefix+path),null);
});
test('primary address and business unit writes lock supplier and audit in the grant transaction',async()=>{
 const address=fixture(),unit=fixture({resource:'units',body:{name:'Business unit'}});
 assert.equal((await address.run()).resource,'addresses');
 assert.equal((await unit.run()).resource,'units');
 assert.deepEqual([...address.calls],['grant','lock','clear-primary','insert','audit']);
 assert.deepEqual([...unit.calls],['grant','lock','insert','audit']);
});
test('removal matches the company and supplier and is audited only when a child was removed',async()=>{
 const f=fixture({method:'DELETE',resource:'units',body:null});
 assert.equal((await f.run()).itemId,'item');
 assert.deepEqual(f.calls,['grant','lock','delete','audit']);
 const foreign=fixture({method:'DELETE',resource:'units',body:null,deleteCount:0});
 await assert.rejects(foreign.run(),{status:404});
 assert.deepEqual(foreign.calls,['grant','lock','delete']);
});
test('revoked grants and unknown suppliers cannot mutate',async()=>{
 for(const [options,status,expected] of [[{revision:2},403,['grant']],[{exists:false},404,['grant','lock']],[{body:{address:'Street',taxId:'x'}},400,[]]]){
  const f=fixture(options);await assert.rejects(f.run(),{status});assert.deepEqual(f.calls,expected);
 }
});
