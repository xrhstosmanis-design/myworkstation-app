import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {staffSupplierManagementRoute,staffCompanyRequestCapability,supplierContactPath as prefix,supplierTaxIdCapability as capability} from '../../shared/backoffice-staff-company.mjs';

const source=readFileSync(new URL('../src/services/backoffice-staff-supplier-tax-id.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export async function','async function');
const make=new Function('z','randomUUID','staffSupplierManagementRoute','supplierTaxIdCapability','staffError','requireStaffCompanyGrant',source+';return correctStaffSupplierTaxId');
const error=(status=403,code='STAFF_ACCESS_DENIED')=>Object.assign(new Error(code),{status,code});
const updatedAt='2026-11-22T09:00:00.000Z';
function fixture({liveRevision=3,history=false,duplicate=false,originalTaxId=null,patch={}}={}){
 const calls=[];
 const req={method:'PATCH',originalUrl:prefix+'/supplier/tax-id',params:{partyId:'supplier'},user:{id:'actor',companyId:'company',staffAccess:true},
 staffCompanyGrant:{capability,companyId:'company',revision:3},get:head=>head==='x-backoffice-company-id'?'company':undefined,
 body:{taxId:'EL 123456783',reason:'Επαλήθευση πρωτοτύπου',confirmOriginal:true,updatedAt,...patch}};
 const tx={$queryRaw:async(strings,...values)=>{
  const sql=strings.join('?');
  if(sql.includes('advisory_xact_lock')){calls.push('tax-lock');assert.equal(values[0],'invoice-issuer-supplier:company:123456783');return []}
  if(sql.includes('FOR UPDATE')){calls.push('supplier-lock');assert.deepEqual(values,['supplier','company']);return[{taxId:originalTaxId,updatedAt}]}
  if(sql.includes('EXISTS')){calls.push('history');assert.deepEqual(values,['company','supplier','company','supplier','company','supplier']);return[{linked:history}]}
  calls.push('duplicate');assert.deepEqual(values,['company','supplier','123456783']);return duplicate?[{id:'another'}]:[];
 },$executeRaw:async(strings,...values)=>{
  const sql=strings.join('?');
  if(sql.includes('UPDATE "Supplier"')){calls.push('write');assert.deepEqual(values,['123456783','supplier','company']);return}
  calls.push('audit');assert.match(sql,/SUPPLIER_TAX_ID_CORRECTED/);
  assert.deepEqual(JSON.parse(values.at(-1)),{supplierId:'supplier',before:originalTaxId,after:'123456783',reason:'Επαλήθευση πρωτοτύπου'});
 }};
 const write=make(z,()=> 'auditid',staffSupplierManagementRoute,capability,error,
  async(db,user,grant)=>{assert.equal(db,tx);assert.equal(user,req.user);assert.equal(grant,capability);calls.push('live');return {revision:liveRevision}});
 return {calls,run:()=>write({$transaction:fn=>fn(tx)},req)};
}
test('supplier AFM correction matches only the dedicated company mutation',()=>{
 assert.equal(staffCompanyRequestCapability('PATCH',prefix+'/supplier/tax-id'),capability);
 for(const method of ['GET','POST','DELETE'])assert.equal(staffCompanyRequestCapability(method,prefix+'/supplier/tax-id'),null);
});
test('supplier AFM is normalized, checked and persisted with its reason and audit',async()=>{
 const f=fixture();assert.deepEqual(await f.run(),{ok:true,companyId:'company',supplierId:'supplier'});
 assert.deepEqual(f.calls,['live','tax-lock','supplier-lock','duplicate','history','write','audit']);
});
test('financial history blocks a new identity but permits equivalent AFM normalization',async()=>{
 const f=fixture({history:true});await assert.rejects(f.run(),{code:'STAFF_SUPPLIER_HAS_FINANCIAL_HISTORY'});
 assert.ok(!f.calls.includes('write'));
 const same=fixture({history:true,originalTaxId:'EL 123456783'});
 await same.run();assert.deepEqual(same.calls,['live','tax-lock','supplier-lock','duplicate','write','audit']);
});
test('revoked grant, duplicate AFM, stale card and unconfirmed or invalid identity stop before the write',async()=>{
 for(const [input,status] of [[{liveRevision:4},403],[{duplicate:true},409],
  [{patch:{updatedAt:'2026-11-21T09:00:00.000Z'}},409],[{patch:{taxId:'123456780'}},400],[{patch:{confirmOriginal:false}},400]]){
  const f=fixture(input);await assert.rejects(f.run(),{status});assert.ok(!f.calls.includes('write'));
 }
});
