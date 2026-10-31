import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {staffCapabilities,staffProfiles,changeStaffCapability,validStaffCapabilities,staffRequestCapability} from '../../shared/backoffice-staff.mjs';
import {enforceBackofficeStaff,requireStaffAction,requireStaffOrderAction} from '../src/services/backoffice-staff-access.js';

const expense={type:'OTHER_EXPENSE',amount:2,evidenceMode:'NO_DOCUMENT',description:'Synthetic expense',responsibilityAcknowledged:true,paymentSource:'EXTERNAL',paymentMethod:'EMPLOYEE_REIMBURSEMENT',idempotencyKey:'synthetic-fixed-key'};
function policy(){
 let capabilities=[...staffCapabilities],revoked=false,status='NEW';const calls=[];
 const user={id:'staff',companyId:'a',storeId:'a1',sessionId:'session',sessionVersion:0,role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true};
 const db={company:{findUnique:async()=>({id:'a',active:true,licenseStatus:'ACTIVE',modules:['DOCUMENTS','INVENTORY','CASH_CONTROL','STORE_MODE'].map(moduleKey=>({moduleKey,active:true}))})},
  $queryRaw:async(strings,...values)=>{const sql=strings.join('?');calls.push({sql,values});
   if(sql.includes('FROM "BackofficeStaffAccount" a'))return revoked?[]:[{userId:'staff',companyId:'a',mustChangePassword:false}];
   if(sql.includes('FROM "BackofficeStaffGrant" g'))return [{profile:'AUDITOR',capabilities}];
   if(sql.includes('FROM "PurchaseOrder"'))return values.includes('foreign')?[]:[{id:'order',storeId:'a1',status}];
   if(sql.includes('FROM "CashShiftSession"'))return [{id:'shift'}];
   if(sql.includes('FROM "Product" p'))return values.includes('foreign')?[]:[{id:'product'}];
   return [];
  },$queryRawUnsafe:async()=>[{schema:'isolated',fence:null}]};
 return {db,user,calls,grant(value){capabilities=value},revoke(){revoked=true},close(){status='FINAL'}};
}
test('new actions remain explicit, dependency-closed and absent from every existing role preset',()=>{
 for(const key of ['invoices.edit','invoices.approve','payments.supplier','payments.expense','payments.cash','sales.cancel','shifts.close']){
  const rights=changeStaffCapability([],key,true);assert.ok(validStaffCapabilities(rights));assert.ok(rights.length>1);
  for(const profile of Object.values(staffProfiles))assert.equal(profile.capabilities.includes(key),false);
 }
 assert.equal(staffRequestCapability('POST','/api/store-pos/stores/a1/sales/sale/reverse',{kind:'CANCEL'}),'sales.cancel');
 for(const kind of ['RETURN','VOID','CANCELLED',null])assert.equal(staffRequestCapability('POST','/api/store-pos/stores/a1/sales/sale/reverse',{kind}),null);
 assert.equal(staffRequestCapability('PATCH','/api/purchase-orders/order',{status:'FINAL'}),'invoices.approve');
 assert.equal(staffRequestCapability('PATCH','/api/purchase-orders/order',{description:'edit'}),'invoices.edit');
 assert.equal(staffRequestCapability('POST','/api/transactions/stores/a1',expense),'payments.expense');
 for(const body of [{...expense,type:'SALE_CASH'},{...expense,amount:-2},{...expense,deferredInvoice:{}},{...expense,evidenceMode:'LEGACY'}])assert.equal(staffRequestCapability('POST','/api/transactions/stores/a1',body),null);
});
test('actual admission binds actions to selected store/object and never grants overrides, reviews, force-close or fiscal return',async()=>{
 const p=policy(),app=express();app.use(express.json());let reached=0;
 app.use(async(req,res,next)=>{req.user={...p.user};try{await enforceBackofficeStaff(p.db,req,res);next()}catch(error){next(error)}});
 app.use((req,res)=>{reached++;res.json({capability:req.staffGrant?.capability})});
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
 const send=async(path,method='POST',body={},storeId='a1')=>{const r=await fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{'content-type':'application/json','x-backoffice-store-id':storeId,'x-mws-terminal-pos':'POS2'},...(method==='GET'?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()}};
 try{
  for(const [path,method,body,cap]of [
   ['/api/purchase-orders/order','PATCH',{description:'edit'},'invoices.edit'],
   ['/api/purchase-orders/order','PATCH',{status:'FINAL'},'invoices.approve'],
   ['/api/transactions/stores/a1','POST',expense,'payments.expense'],
   ['/api/transactions/stores/a1/supplier-settlements','POST',{},'payments.supplier'],
   ['/api/store-pos/stores/a1/sales/sale/reverse','POST',{kind:'CANCEL'},'sales.cancel'],
   ['/api/cash/sessions/shift/close','POST',{},'shifts.close']]){
   const r=await send(path,method,body);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.capability,cap);
  }
  const before=reached;
  for(const [path,method,body]of [
   ['/api/purchase-orders/foreign','PATCH',{description:'other store'}],
   ['/api/purchase-orders/order','PATCH',{status:'FINAL',description:'smuggled edit'}],
   ['/api/purchase-orders/order','PATCH',{status:'FINAL',totalMismatchOverride:true}],
   ['/api/transactions/stores/a2','POST',expense],
   ['/api/transactions/stores/a1/supplier-settlements/s/review','POST',{}],
   ['/api/transactions/tx/reverse','POST',{}],
   ['/api/store-pos/stores/a1/sales/sale/reverse','POST',{kind:'RETURN'}],
   ['/api/store-pos/stores/a1/sales/sale/internal-return','POST',{}],
   ['/api/owner-shifts/shift/force-close','POST',{}],
   ['/api/commerce/purchases/doc/approve','POST',{}],
   ['/api/purchase-orders/order','DELETE',{}]
  ])assert.ok([403,404].includes((await send(path,method,body)).status),path);
  assert.equal(reached,before);
  p.grant(['sales.read','payments.read','payments.expense']);
  assert.equal((await send('/api/transactions/stores/a1','POST',{...expense,paymentSource:'CASH_SHIFT',paymentMethod:'CASH_SHIFT'})).status,403);
  assert.equal((await send('/api/store-pos/stores/a1/sales/sale/reverse','POST',{kind:'CANCEL'})).status,403);
 }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})}
});
test('writer revalidation uses current locked grants, selected terminal, declaration and editable draft state',async()=>{
 const p=policy(),req={user:p.user,staffGrant:{capability:'payments.expense'},body:expense,get:key=>key==='x-mws-terminal-pos'?'POS2':undefined};
 await requireStaffAction(p.db,req,'a1','payments.expense');
 assert.ok(p.calls.some(c=>c.sql.includes('FOR SHARE OF a,u,s,c')));assert.ok(p.calls.some(c=>c.sql.includes('FOR SHARE OF g,s')));
 await assert.rejects(requireStaffAction(p.db,{...req,body:{...expense,responsibilityAcknowledged:false}},'a1','payments.expense'),{code:'STAFF_PAYMENT_DECLARATION'});
 await assert.rejects(requireStaffAction(p.db,{...req,body:{...expense,paymentMethod:'CASH_SHIFT'}},'a1','payments.expense'),{code:'STAFF_PAYMENT_INVALID'});
 const cancel={...req,staffGrant:{capability:'sales.cancel'},body:{kind:'CANCEL'},get:()=>''};
 await assert.rejects(requireStaffAction(p.db,cancel,'a1','sales.cancel'),{code:'STAFF_TERMINAL_REQUIRED'});
 const edit={...req,staffGrant:{capability:'invoices.edit'},body:{productId:'foreign'}};
 await assert.rejects(requireStaffOrderAction(p.db,edit,'order','invoices.edit'),{code:'STAFF_OBJECT_NOT_FOUND'});
 edit.body={description:'edit'};await requireStaffOrderAction(p.db,edit,'order','invoices.edit');p.close();
 await assert.rejects(requireStaffOrderAction(p.db,edit,'order','invoices.edit'),{code:'STAFF_DRAFT_CLOSED'});
 p.grant(['invoices.read']);await assert.rejects(requireStaffAction(p.db,{...edit,staffGrant:{capability:'invoices.approve'}},'a1','invoices.approve'),{code:'STAFF_ACCESS_DENIED'});
 p.revoke();await assert.rejects(requireStaffAction(p.db,req,'a1','payments.expense'),{code:'STAFF_SESSION_INVALID'});
});
