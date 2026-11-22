import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {staffSupplierContactId,supplierContactCapability as capability,supplierContactPath as path,staffCompanyRequestCapability,changeStaffCompanyCapability} from '../../shared/backoffice-staff-company.mjs';

const supplierContactCapability=capability;
const source=readFileSync(new URL('../src/services/backoffice-staff-supplier-contact.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export async function','async function');
const createWriter=new Function('z','randomUUID','staffSupplierContactId','supplierContactCapability','staffError','requireStaffCompanyGrant',source+';return updateStaffSupplierContact');
const updatedAt='2026-11-22T09:40:00.000Z';

function fixture({revision=7,contact={name:'Old',phone:null,mobile:null,email:null,updatedAt},change={}}={}){
 const calls=[];
 const tx={
  $queryRaw:async(strings,...values)=>{
   calls.push('lock-supplier');assert.match(strings.join('?'),/"active"=true FOR UPDATE/);
   assert.deepEqual(values,['supplier','company']);return contact?[contact]:[];
  },
  $executeRaw:async(strings,...values)=>{
   const sql=strings.join('?');
   if(sql.includes('UPDATE "Supplier"')){
    calls.push('update');assert.deepEqual(values,['New','2100000000',null,'supplier@example.test','supplier','company']);
    for(const forbidden of ['"taxId"','"vatMode"','"paymentPreference"','"active"'])assert.ok(!sql.includes(forbidden));
   }else{
    calls.push('audit');assert.match(sql,/SUPPLIER_CONTACT_UPDATED/);
    assert.deepEqual(values.slice(1,4),['company','staff','staff']);
    assert.deepEqual(JSON.parse(values[4]),{supplierId:'supplier',changed:['name','phone','email']});
   }
  }
 };
 const req={
  method:'PATCH',originalUrl:path+'/supplier/contact',params:{partyId:'supplier'},
  user:{id:'staff',companyId:'company',staffAccess:true},staffCompanyGrant:{capability,companyId:'company',revision:7},
  get:name=>name==='x-backoffice-company-id'?'company':undefined,
  body:{name:' New ',phone:'2100000000',mobile:null,email:'supplier@example.test',updatedAt,...change}
 };
 const writer=createWriter(z,()=> 'audit-id',staffSupplierContactId,supplierContactCapability,
  (status=403,code='STAFF_DENIED',message='denied')=>Object.assign(new Error(message),{status,code}),
  async(db,user,received)=>{assert.equal(db,tx);assert.equal(user,req.user);assert.equal(received,capability);calls.push('live-grant');return {revision}});
 return {calls,req,write:()=>writer({$transaction:async fn=>fn(tx)},req)};
}

test('company supplier contacts have one exact write route and depend on the existing supplier card rights',()=>{
 assert.equal(staffCompanyRequestCapability('PATCH',path+'/supplier/contact'),capability);
 for(const [method,suffix] of [['DELETE','/supplier/contact'],['GET','/supplier/contact'],['PATCH','/supplier/card'],['PATCH','/supplier/contact/extra'],['PATCH','/%2Fforeign/contact']])assert.equal(staffCompanyRequestCapability(method,path+suffix),null);
 assert.deepEqual(new Set(changeStaffCompanyCapability([],capability,true)),new Set(['supplier-control-report.read','supplier-card.read',capability]));
});

test('contact writer locks the live grant and supplier before recording the change and actor',async()=>{
 const f=fixture();
 assert.deepEqual(await f.write(),{ok:true,companyId:'company',supplierId:'supplier'});
 assert.deepEqual(f.calls,['live-grant','lock-supplier','update','audit']);
});

test('stale authority, stale editor, inactive/cross-company supplier and fiscal payload are rejected before any write',async()=>{
 for(const [options,status,calls] of [
  [{revision:8},403,['live-grant']],
  [{change:{updatedAt:'2026-11-22T09:39:00.000Z'}},409,['live-grant','lock-supplier']],
  [{contact:null},404,['live-grant','lock-supplier']],
  [{change:{taxId:'123456789'}},400,[]]
 ]){
  const f=fixture(options);
  await assert.rejects(f.write(),{status});
  assert.deepEqual(f.calls,calls);
 }
 const f=fixture();f.req.get=()=> 'other-company';
 await assert.rejects(f.write(),{status:403});assert.deepEqual(f.calls,[]);
});
