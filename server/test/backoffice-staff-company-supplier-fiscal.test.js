import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {staffSupplierManagementRoute,staffCompanyRequestCapability,supplierContactPath as prefix,supplierFiscalCapability as capability} from '../../shared/backoffice-staff-company.mjs';
const source=readFileSync(new URL('../src/services/backoffice-staff-supplier-fiscal.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export async function','async function');
const makeWriter=new Function('z','randomUUID','staffSupplierManagementRoute','supplierFiscalCapability','staffError','requireStaffCompanyGrant',source+';return updateStaffSupplierFiscal');
const error=(status=403,code='STAFF_ACCESS_DENIED')=>Object.assign(new Error(code),{status,code});
const date='2026-11-22T09:00:00.000Z';
const defaults={taxOffice:'New office',accountingCode:null,legacyCode:null,erpCode:null,myfEnabled:true,supplierCategory:'A',scope:'INTERNAL',paymentPreference:'CREDIT',vatMode:'NORMAL',updatedAt:date};
function fixture({revision=3,exists=true,diff={}}={}){
 const calls=[];
 const req={method:'PATCH',originalUrl:prefix+'/supplier/fiscal',params:{partyId:'supplier'},
 user:{id:'actor',companyId:'company',staffAccess:true},staffCompanyGrant:{capability,companyId:'company',revision:3},
 get:k=>k==='x-backoffice-company-id'?'company':undefined,body:{...defaults,...diff}};
 const tx={$queryRaw:async(strings,...values)=>{
  assert.match(strings.join('?'),/"active"=true FOR UPDATE/);assert.deepEqual(values,['supplier','company']);
  calls.push('lock');return exists?[{...defaults,taxOffice:'Old office'}]:[];
 },$executeRaw:async(strings,...values)=>{
  const sql=strings.join('?');
  if(sql.includes('INSERT')){calls.push('audit');assert.deepEqual(JSON.parse(values.at(-1)),{supplierId:'supplier',changes:{taxOffice:{before:'Old office',after:'New office'}}});return}
  calls.push('write');assert.match(sql,/WHERE "id"=\? AND "companyId"=\?/);assert.doesNotMatch(sql,/"taxId"|"active"|StoreTransaction|PurchaseDocument/);
  assert.deepEqual(values.slice(-2),['supplier','company']);
 }};
 const writer=makeWriter(z,()=> 'audit',staffSupplierManagementRoute,capability,error,
  async(client,user,key)=>{assert.equal(client,tx);assert.equal(user,req.user);assert.equal(key,capability);calls.push('grant');return {revision}});
 return {calls,run:()=>writer({$transaction:fn=>fn(tx)},req)};
}
test('supplier fiscal changes have one exact opt-in action',()=>{
 assert.equal(staffCompanyRequestCapability('PATCH',prefix+'/supplier/fiscal'),capability);
 for(const method of ['GET','DELETE','POST'])assert.equal(staffCompanyRequestCapability(method,prefix+'/supplier/fiscal'),null);
});
test('supplier fiscal change locks live authority and active supplier with an atomic audit',async()=>{
 const f=fixture();assert.deepEqual(await f.run(),{ok:true,companyId:'company',supplierId:'supplier'});
 assert.deepEqual(f.calls,['grant','lock','write','audit']);
});
test('issuer identity and account scope cannot be overwritten by fiscal editing',async()=>{
 for(const [options,status,calls] of [
  [{revision:4},403,['grant']],[{exists:false},404,['grant','lock']],
  [{diff:{updatedAt:'2026-11-21T09:00:00.000Z'}},409,['grant','lock']],
  [{diff:{taxId:'123456789'}},400,[]],[{diff:{vatMode:'OTHER'}},400,[]]
 ]){
  const f=fixture(options);await assert.rejects(f.run(),{status});assert.deepEqual(f.calls,calls);
 }
});
