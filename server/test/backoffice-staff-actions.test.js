import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {staffCapabilities,staffProfiles,changeStaffCapability,validStaffCapabilities,staffRequestCapability} from '../../shared/backoffice-staff.mjs';
import {previewPurchaseOrderCancel,cancelPurchaseOrder} from '../src/services/purchase-order-reopen.js';
import {enforceBackofficeStaff,requireStaffGrant,requireStaffAction,requireStaffOrderAction} from '../src/services/backoffice-staff-access.js';

const expense={type:'OTHER_EXPENSE',amount:2,evidenceMode:'NO_DOCUMENT',description:'Synthetic expense',responsibilityAcknowledged:true,paymentSource:'EXTERNAL',paymentMethod:'EMPLOYEE_REIMBURSEMENT',idempotencyKey:'synthetic-fixed-key'};
function policy({profile='AUDITOR',grantedStore=null}={}){
 let capabilities=[...staffCapabilities],revoked=false,status='NEW',inventoryEnabled=true;const calls=[];
 const user={id:'staff',companyId:'a',storeId:'a1',sessionId:'session',sessionVersion:0,role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true};
 const db={company:{findUnique:async()=>({id:'a',active:true,licenseStatus:'ACTIVE',modules:['DOCUMENTS','INVENTORY','CASH_CONTROL','STORE_MODE'].map(moduleKey=>({moduleKey,active:true}))})},
  $queryRaw:async(strings,...values)=>{const sql=strings.join('?');calls.push({sql,values});
   if(sql.includes('FROM "BackofficeStaffAccount" a'))return revoked?[]:[{userId:'staff',companyId:'a',mustChangePassword:false}];
   if(sql.includes('FROM "BackofficeStaffGrant" g'))return grantedStore&&values[2]!==grantedStore?[]:[{profile,capabilities}];
   if(sql.includes('FROM "StorePaidModule"')&&values.includes('INVENTORY'))return inventoryEnabled?[]:[{active:false}];
   if(sql.includes('FROM "PurchaseOrder"'))return values.includes('foreign')?[]:[{id:'order',storeId:'a1',status}];
   if(sql.includes('FROM "CashShiftSession"'))return [{id:'shift'}];
   if(sql.includes('FROM "Product" p'))return values.includes('foreign')?[]:[{id:'product'}];
   return [];
  },$queryRawUnsafe:async()=>[{schema:'isolated',fence:null}]};
 return {db,user,calls,grant(value){capabilities=value},revoke(){revoked=true},close(){status='FINAL'},disableInventory(){inventoryEnabled=false}};
}
test('manager and another staff profile get the same four exact permissions only in the assigned store',async()=>{
 const rights=['invoices.read','invoices.reopen','invoices.cancel','shifts.read'];
 const granted=[
  ['GET','/api/commerce/documents/inbox/archive?storeId=a1','invoices.read'],
  ['GET','/api/purchase-orders/order/reopen-preview?storeId=a1','invoices.reopen'],
  ['GET','/api/purchase-orders/order/cancel-preview?storeId=a1','invoices.cancel'],
  ['GET','/api/cash/stores/a1/reporting-overview','shifts.read'],
 ];
 for(const profile of ['MANAGER','AUDITOR']){
  const p=policy({profile,grantedStore:'a1'});
  p.grant(rights);
  const request=async(method,originalUrl,storeId='a1',body={})=>{
   const req={user:{...p.user},method,originalUrl,body,query:Object.fromEntries(new URL(originalUrl,'https://isolated.invalid').searchParams),get:key=>key==='x-backoffice-store-id'?storeId:undefined};
   await enforceBackofficeStaff(p.db,req,{setHeader(){}});
   return req.staffGrant.capability;
  };
  for(const [method,path,capability] of granted)assert.equal(await request(method,path),capability);
  await assert.rejects(request('GET','/api/cash/stores/a2/reporting-overview','a2'),{code:'STAFF_ACCESS_DENIED'});
  await assert.rejects(request('GET','/api/commerce/documents/inbox/archive?storeId=a2','a2'),{code:'STAFF_ACCESS_DENIED'});
  await assert.rejects(request('GET','/api/backoffice-staff/cash/stores/a1'),{code:'STAFF_ACCESS_DENIED'});
  await assert.rejects(request('PATCH','/api/purchase-orders/order','a1',{description:'Synthetic edit'}),{code:'STAFF_ACCESS_DENIED'});
  await assert.rejects(request('POST','/api/cash/sessions/shift/close'),{code:'STAFF_ACCESS_DENIED'});
  p.grant(['invoices.read','shifts.read']);
  for(const [method,path,capability] of granted){
   if(capability.endsWith('.read'))assert.equal(await request(method,path),capability);
   else await assert.rejects(request(method,path),{code:'STAFF_ACCESS_DENIED'});
  }
  p.grant(['invoices.read']);
  await assert.rejects(request('GET','/api/cash/stores/a1/reporting-overview'),{code:'STAFF_ACCESS_DENIED'});
  assert.equal(await request('GET','/api/commerce/documents/inbox/archive?storeId=a1'),'invoices.read');
 }
});
test('new actions remain explicit, dependency-closed and absent from every existing role preset',()=>{
 for(const key of ['invoices.edit','invoices.approve','payments.supplier','payments.expense','payments.cash','sales.cancel','shifts.close']){
  const rights=changeStaffCapability([],key,true);assert.ok(validStaffCapabilities(rights));if(key==='shifts.close')assert.deepEqual(rights,[key]);else assert.ok(rights.length>1);
  for(const profile of Object.values(staffProfiles))assert.equal(profile.capabilities.includes(key),false);
 }
 assert.equal(staffRequestCapability('POST','/api/store-pos/stores/a1/sales/sale/reverse',{kind:'CANCEL'}),'sales.cancel');
 for(const kind of ['RETURN','VOID','CANCELLED',null])assert.equal(staffRequestCapability('POST','/api/store-pos/stores/a1/sales/sale/reverse',{kind}),null);
 assert.equal(staffRequestCapability('PATCH','/api/purchase-orders/order',{status:'FINAL'}),'invoices.approve');
 assert.equal(staffRequestCapability('PATCH','/api/purchase-orders/order',{description:'edit'}),'invoices.edit');
 assert.equal(staffRequestCapability('POST','/api/purchase-orders/order/lines',{productId:'existing'}),'invoices.edit');
 assert.equal(staffRequestCapability('POST','/api/purchase-orders/order/lines',{description:'unmatched'}),null);
 assert.equal(staffRequestCapability('GET','/api/commerce/purchase-orders/order/catalog-matches'),'invoices.edit');
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
   ['/api/cash-control/stores/a1/reporting-overview','GET',{},'shifts.read'],
   ['/api/cash/stores/a1/reporting-overview','GET',{},'shifts.read'],
   ['/api/purchase-orders/order/cancel-preview?storeId=a1','GET',{},'invoices.cancel'],
   ['/api/purchase-orders/order/cancel','POST',{storeId:'a1'},'invoices.cancel'],
   ['/api/purchase-orders/order','PATCH',{status:'INVOICED',expectedReopenVersion:0,excludeStockLineIds:['line-a']},'invoices.approve'],
   ['/api/transactions/stores/a1','POST',expense,'payments.expense'],
   ['/api/transactions/stores/a1/supplier-settlements','POST',{},'payments.supplier'],
   ['/api/store-pos/stores/a1/sales/sale/reverse','POST',{kind:'CANCEL'},'sales.cancel'],
   ['/api/cash/sessions/shift/close','POST',{},'shifts.close']]){
   const r=await send(path,method,body);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.capability,cap);
  }
  const before=reached;
  for(const [path,method,body]of [
   ['/api/purchase-orders/foreign','PATCH',{description:'other store'}],
   ['/api/purchase-orders/foreign/cancel-preview?storeId=a1','GET',{}],
   ['/api/purchase-orders/foreign/cancel','POST',{storeId:'a1'}],
   ['/api/purchase-orders/order/cancel-preview?storeId=a2','GET',{}],
   ['/api/purchase-orders/order/cancel','POST',{storeId:'a2'}],
   ['/api/purchase-orders/order','PATCH',{status:'FINAL',description:'smuggled edit'}],
   ['/api/purchase-orders/order','PATCH',{status:'FINAL',totalMismatchOverride:true}],
   ['/api/purchase-orders/order','PATCH',{status:'FINAL',excludeStockLineIds:['line-a']}],
   ['/api/purchase-orders/order','PATCH',{status:'INVOICED',excludeStockLineIds:['line-a'],totalMismatchOverride:true}],
   ['/api/purchase-orders/foreign','PATCH',{status:'INVOICED',excludeStockLineIds:['line-a']}],
   ['/api/cash-control/stores/a2/reporting-overview','GET',{}],
   ['/api/cash/stores/a2/reporting-overview','GET',{}],
   ['/api/cash-control/stores/a1/reporting-overview','POST',{}],
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
  p.grant(['invoices.read','invoices.reopen']);
  assert.equal((await send('/api/purchase-orders/order/cancel-preview?storeId=a1','GET')).status,403);
  assert.equal((await send('/api/purchase-orders/order/cancel','POST',{storeId:'a1'})).status,403);
  p.grant(['invoices.read','invoices.cancel']);
  assert.equal((await send('/api/purchase-orders/order/reopen-preview?storeId=a1','GET')).status,403);
  assert.equal((await send('/api/purchase-orders/order/reopen','POST',{storeId:'a1'})).status,403);
  for(const unrelated of ['sales.read','shifts.close','cash.read']){
   p.grant([unrelated]);
   assert.equal((await send('/api/cash-control/stores/a1/reporting-overview','GET')).status,403);
  }
  p.grant(['shifts.read']);
  assert.equal((await send('/api/cash-control/stores/a1/reporting-overview','GET')).status,200);
  assert.equal((await send('/api/backoffice-staff/sales/stores/a1/terminals','GET')).status,403);
  assert.equal((await send('/api/cash/stores/a1/close-context','GET')).status,403);
  assert.equal((await send('/api/cash/sessions/shift/close','POST',{})).status,403);
  p.grant(['invoices.read']);p.disableInventory();
  assert.equal((await send('/api/purchase-orders/report?storeId=a1','GET')).status,403,'purchase review needs the selected store inventory module');
  assert.equal((await send('/api/commerce/documents/inbox/archive?storeId=a1','GET')).status,200,'existing document-only archive remains available');
 }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})}
});
test('writer revalidation uses current locked grants, selected terminal, declaration and editable draft state',async()=>{
 const p=policy(),req={user:p.user,staffGrant:{capability:'payments.expense'},body:expense,get:key=>key==='x-mws-terminal-pos'?'POS2':undefined};
 await requireStaffAction(p.db,req,'a1','payments.expense');
 assert.ok(p.calls.some(c=>c.sql.includes('FOR SHARE OF a,u,s,c')));assert.ok(p.calls.some(c=>c.sql.includes('FOR SHARE OF g,s')));
 await assert.rejects(requireStaffAction(p.db,{...req,body:{...expense,responsibilityAcknowledged:false}},'a1','payments.expense'),{code:'STAFF_PAYMENT_DECLARATION'});
 await assert.rejects(requireStaffAction(p.db,{...req,body:{...expense,paymentMethod:'CASH_SHIFT'}},'a1','payments.expense'),{code:'STAFF_PAYMENT_INVALID'});
 await assert.rejects(requireStaffAction(p.db,{...req,body:{...expense,supplierId:'foreign'}},'a1','payments.expense'),{code:'STAFF_PAYMENT_INVALID'});
 const cancel={...req,staffGrant:{capability:'sales.cancel'},body:{kind:'CANCEL'},get:()=>''};
 await assert.rejects(requireStaffAction(p.db,cancel,'a1','sales.cancel'),{code:'STAFF_TERMINAL_REQUIRED'});
 const edit={...req,staffGrant:{capability:'invoices.edit'},body:{productId:'foreign'}};
 await assert.rejects(requireStaffOrderAction(p.db,edit,'order','invoices.edit'),{code:'STAFF_OBJECT_NOT_FOUND'});
 edit.body={description:'edit'};await requireStaffOrderAction(p.db,edit,'order','invoices.edit');p.close();
 await assert.rejects(requireStaffOrderAction(p.db,edit,'order','invoices.edit'),{code:'STAFF_DRAFT_CLOSED'});
 p.grant(['invoices.read']);await assert.rejects(requireStaffAction(p.db,{...edit,staffGrant:{capability:'invoices.approve'}},'a1','invoices.approve'),{code:'STAFF_ACCESS_DENIED'});
 p.revoke();await assert.rejects(requireStaffAction(p.db,req,'a1','payments.expense'),{code:'STAFF_SESSION_INVALID'});
});

test('delegated invoice cancellation rechecks the grant inside preview and submission transactions',async()=>{
 const version='a'.repeat(64);
 for(const cancel of [
  (db,user)=>previewPurchaseOrderCancel(db,user,'order','a1'),
  (db,user)=>cancelPurchaseOrder(db,user,'order',{storeId:'a1',version,reason:'Synthetic duplicate',confirm:true}),
 ]){
  const p=policy();
  p.grant(['invoices.read','invoices.cancel']);
  p.db.$executeRawUnsafe=async()=>{};
  p.db.$transaction=async work=>{
   p.grant(['invoices.read']);
   return work({...p.db,$queryRawUnsafe:async()=>assert.fail('revoked grant reached invoice transaction')});
  };
  await assert.rejects(cancel(p.db,p.user),{code:'STAFF_ACCESS_DENIED'});
 }
});

test('canonical shift report redacts delegated data and revalidates immediately before response',async()=>{
 const source=await readFile(new URL('../src/routes/cash-control.js',import.meta.url),'utf8');
 const start=source.indexOf('function staffShiftReportRow(');
 const stop=source.indexOf('export async function readCashDailySummary(',start);
 assert.ok(start>=0&&stop>start);
 assert.match(source.slice(start,stop),/router\.get\("\/stores\/:storeId\/reporting-overview"/);
 const p=policy();
 p.grant(['shifts.read']);
 const staffQuery=p.db.$queryRaw;
 let revokeWhileLoading=false;
 let reportQueryCount=0;
 p.db.$queryRaw=async(strings,...values)=>{
  const sql=strings.join('?');
  if(sql.includes('FROM "CashShiftSession" s')){
   assert.deepEqual(values,['a','a1','a','a1']);
   reportQueryCount++;
   return [{id:'shift',status:'OPEN',openedByName:'Synthetic',terminalPos:'MAIN',liveCashSales:13,transactionCount:1,closingNote:'Internal evidence',duplicateReviewJson:[{privateRef:'control'}]}];
  }
  if(sql.includes('ORDER BY "occurredAt"')){
   assert.deepEqual(values,['a','a1',['shift']]);
   reportQueryCount++;
   if(revokeWhileLoading)p.grant([]);
   return [{id:'entry',sessionId:'shift',amount:'13.00'}];
  }
  return staffQuery(strings,...values);
 };
 let handler;
 const money=value=>Number(value||0);
 const assertStoreAccess=(req,storeId)=>{if(req.user.staffAccess&&req.user.storeId!==storeId)throw Object.assign(new Error('wrong store'),{status:403});};
 const ownedStore=async(id,companyId)=>{assert.deepEqual([id,companyId],['a1','a']);return {id,name:'A1'};};
 const normalized=row=>({...row});
 new Function('router','route','prisma','money','normalize','assertStoreAccess','ownedStore','requireStaffGrant',source.slice(start,stop))(
  {get:(_path,fn)=>{handler=fn;}},fn=>fn,p.db,money,normalized,assertStoreAccess,ownedStore,requireStaffGrant,
 );
 const invoke=async(user,storeId='a1')=>{
  let body;
  await handler({user,params:{storeId}},{json:value=>{body=value;}});
  return body;
 };
 await assert.rejects(invoke(p.user,'a2'),{status:403});
 assert.equal(reportQueryCount,0);
 const owner=await invoke({role:'OWNER',companyId:'a'});
 assert.equal(owner.recent[0].closingNote,'Internal evidence');
 const delegated=await invoke(p.user);
 assert.equal(delegated.recent[0].cashSales,13);
 assert.equal(delegated.recent[0].closingNote,undefined);
 assert.equal(delegated.recent[0].duplicateReviewJson,undefined);
 assert.deepEqual(delegated.openSessions,delegated.recent);
 assert.deepEqual(delegated.recentTransactions,[{id:'entry',sessionId:'shift',amount:13}]);
 revokeWhileLoading=true;
 await assert.rejects(invoke(p.user),{code:'STAFF_ACCESS_DENIED'});
});
