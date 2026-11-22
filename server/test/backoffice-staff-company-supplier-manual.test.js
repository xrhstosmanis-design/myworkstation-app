import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {staffSupplierManagementRoute,staffCompanyRequestCapability,supplierContactPath as path,supplierManualCreateCapability as capability} from '../../shared/backoffice-staff-company.mjs';

const source=readFileSync(new URL('../src/services/backoffice-staff-supplier-manual.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export async function','async function');
const makeWriter=new Function('z','createHash','randomUUID','staffSupplierManagementRoute','supplierManualCreateCapability','staffError','requireStaffCompanyGrant',source+';return createStaffSupplierManually');
const error=(status=403,code='STAFF_ACCESS_DENIED')=>Object.assign(new Error(code),{status,code});
function fixture({revision=1,duplicate=false,change={}}={}){
 const calls=[];let audit=null;
 const req={method:'POST',originalUrl:path,staffCompanyGrant:{capability,companyId:'company',revision:1},
  user:{id:'actor',companyId:'company',staffAccess:true},get:k=>k==='x-backoffice-company-id'?'company':undefined,
  body:{requestId:'7b4bb91d-c959-47fb-8bb0-092e6b7c5d93',name:'New supplier',taxId:'EL 123456789',...change}};
 const tx={$queryRaw:async(template,...values)=>{
  const sql=template.join('?');
  if(sql.includes('advisory_xact_lock')){calls.push('lock');return []}
  if(sql.includes('FROM "BackofficeStaffAudit"')){calls.push('receipt');assert.deepEqual(values.slice(1),['company','actor']);return audit?[{detail:audit}]:[]}
  if(sql.includes('FROM "Supplier"')){calls.push('check-tax');assert.deepEqual(values,['company','123456789',true,'123456789']);return duplicate?[{id:'existing'}]:[]}
  assert.match(sql,/INSERT INTO "Supplier"/);calls.push('write');assert.deepEqual(values.slice(0,4),['supplier','company',req.body.name,'123456789']);return [{id:'supplier'}];
 },$executeRaw:async(template,...values)=>{
  assert.match(template.join('?'),/SUPPLIER_MANUALLY_CREATED/);calls.push('audit');assert.equal(values[1],'company');
  audit=JSON.parse(values.at(-1));assert.deepEqual(Object.keys(audit).sort(),['bodyHash','hasTaxId','supplierId']);
 }};
 const writer=makeWriter(z,createHash,()=> 'supplier',staffSupplierManagementRoute,capability,error,
  async(db,user,key)=>{assert.equal(db,tx);assert.equal(user,req.user);assert.equal(key,capability);calls.push('grant');return{revision}});
 return {req,calls,run:()=>writer({$transaction:fn=>fn(tx)},req)};
}
test('supplier master creation has a separate exact company action',()=>{
 assert.equal(staffCompanyRequestCapability('POST',path),capability);
 assert.equal(staffCompanyRequestCapability('GET',path),'supplier-control-report.read');
 for(const invalid of [path+'/',path+'?storeId=other',path+'/new'])assert.equal(staffCompanyRequestCapability('POST',invalid),null);
});
test('manual creation is atomically audited and same-request retry replays without writing',async()=>{
 const f=fixture();
 assert.deepEqual(await f.run(),{ok:true,companyId:'company',supplierId:'supplier',replay:false});
 assert.deepEqual(f.calls,['grant','lock','receipt','lock','check-tax','write','audit']);
 f.calls.length=0;
 assert.equal((await f.run()).replay,true);
 assert.deepEqual(f.calls,['grant','lock','receipt']);
 f.req.body.name='different';
 await assert.rejects(f.run(),{status:409});
});
test('unknown fields, grant revocation and duplicate tax IDs stop supplier creation',async()=>{
 for(const [options,status,calls] of [[{change:{companyId:'other'}},400,[]],[{revision:2},403,['grant']],[{duplicate:true},409,['grant','lock','receipt','lock','check-tax']]]){
  const f=fixture(options);await assert.rejects(f.run(),{status});assert.deepEqual(f.calls,calls);
 }
});
