import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {staffRequestCapability} from '../../shared/backoffice-staff.mjs';

const source=readFileSync(new URL('../src/routes/store-transactions.js',import.meta.url),'utf8');
function overview({staff=true,revoked=false}={}){
  const start=source.indexOf('router.get("/stores/:storeId/overview",route(async(req,res)=>{');
  const end=source.indexOf('\nrouter.get("/stores/:storeId/cash-transfer/context"',start);
  assert.ok(start>=0&&end>start);
  let handler,reconciled=0,revalidated=0;
  const db={$queryRaw:async(strings)=>{
    const sql=strings.join('?');
    if(sql.includes('FROM "CashShiftSession"'))return [{id:'shift',shiftLabel:'Synthetic shift',terminalPos:'MAIN',openingOperational:4}];
    if(sql.includes('FROM "Supplier"')||sql.includes('FROM "PurchaseDocument"')){assert.equal(staff,false,'staff read must not load unrelated company supplier/invoice pickers');return []}
    if(sql.includes('FROM "StoreTransaction"'))return [];
    assert.fail(sql);
  },$executeRaw:()=>assert.fail('read must not execute a business mutation')};
  new Function('router','route','assertStoreAccess','ownedStore','requestTerminal','prisma','reconcileOnlineSalesForOpenSession','normalize','totals','canCorrectPayment','requireStaffGrant',source.slice(start,end))(
    {get:(_path,h)=>{handler=h}},h=>h,()=>{},async()=>({id:'store',name:'Synthetic'}),async()=> 'MAIN',db,
    async()=>{reconciled++},row=>row,()=>({}),()=>false,
    async(_db,user,storeId,cap)=>{revalidated++;assert.equal(user.staffAccess,true);assert.equal(storeId,'store');assert.equal(cap,'sales.read');if(revoked)throw Object.assign(Error('revoked'),{status:403})}
  );
  return {invoke:async()=>{let result;await handler({params:{storeId:'store'},user:{id:'reader',companyId:'company',staffAccess:staff,role:staff?'EMPLOYEE':'OWNER',tokenType:'BACKOFFICE_USER'}},{json:x=>{result=x}});return result},observe:()=>({reconciled,revalidated})};
}
test('delegated sales read reuses actual overview without online reconciliation, write controls or unrelated pickers',async()=>{
  const route=overview(),result=await route.invoke();
  assert.deepEqual(route.observe(),{reconciled:0,revalidated:1});
  assert.equal(result.store.id,'store');assert.deepEqual(result.suppliers,[]);assert.deepEqual(result.purchaseDocuments,[]);
  assert.equal(result.access.canReverse,false);assert.equal(result.access.canForceClose,false);
});
test('ordinary owner overview keeps existing online reconciliation',async()=>{
  const route=overview({staff:false}),result=await route.invoke();
  assert.deepEqual(route.observe(),{reconciled:1,revalidated:0});assert.equal(result.access.canForceClose,true);
});
test('revoked sales grant refuses late overview before sending a response',async()=>{
  const route=overview({revoked:true});await assert.rejects(route.invoke(),{status:403});assert.deepEqual(route.observe(),{reconciled:0,revalidated:1});
});
test('sales permission admits only three exact GET endpoints and no correction/payment/shift action',()=>{
  for(const path of ['/api/transactions/stores/s/overview','/api/cash/stores/s/overview','/api/store-pos/stores/s/sales/recent'])assert.equal(staffRequestCapability('GET',path),'sales.read');
  for(const [method,path] of [['POST','/api/transactions/stores/s'],['POST','/api/owner-shifts/shift/force-close'],['POST','/api/transactions/stores/s/payments/p/correct-amount'],['GET','/api/store-pos/sales/journal'],['GET','/api/cash/stores/s/reporting-overview']])assert.equal(staffRequestCapability(method,path),null);
});
