import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {z} from 'zod';

const source=readFileSync(new URL('../src/routes/purchase-orders.js',import.meta.url),'utf8');
const draftRoute=source.slice(source.indexOf('router.post("/",'),source.indexOf('router.get("/:orderId/supplier-correction-preview"'));
const mount=new Function('router','z','id','prisma','requireStaffAction','store','supplier','writePurchaseAudit',draftRoute);

function fixture({hasGrant=true,hasSupplier=true,delegated=true}={}){
  const calls=[];
  let handler;
  const db={
    $queryRaw:async(strings,...values)=>{
      assert.match(strings.join('?'),/"companyId"=\?.*"active"=true FOR SHARE/);
      assert.deepEqual(values,['sup','company']);
      calls.push('scoped-supplier');
      return hasSupplier?[{id:'sup'}]:[];
    },
    $executeRaw:async(strings,...values)=>{
      assert.match(strings.join('?'),/INSERT INTO "PurchaseOrder"/);
      assert.deepEqual(values.slice(0,5),['draft','company','store','sup','A1']);
      calls.push('insert');
    }
  };
  mount({post:(path,fn)=>{assert.equal(path,'/');handler=fn}},z,()=> 'draft',
    {$transaction:async fn=>{calls.push('transaction');return fn(db)}},
    async(tx,req,storeId,capability)=>{
      assert.equal(tx,db);
      assert.equal(capability,'invoices.create');
      calls.push('live-grant');
      if(!hasGrant||storeId!==req.user.storeId)throw Object.assign(new Error('denied'),{status:403});
    },
    async(companyId,storeId)=>{assert.deepEqual([companyId,storeId],['company','store']);calls.push('owner-store');return {id:storeId}},
    async(companyId,supplierId)=>{assert.deepEqual([companyId,supplierId],['company','sup']);calls.push('owner-supplier');return {id:supplierId}},
    async(tx,req,event)=>{
      assert.equal(tx,db);
      assert.equal(event.storeId,'store');
      assert.equal(event.eventType,'PURCHASE_ORDER_DRAFT_CREATED');
      calls.push('audit');
    });
  async function run(storeId='store'){
    const body={storeId,supplierId:'sup',invoiceNumber:'A1'};
    const user={id:'actor',companyId:'company',storeId:'store',staffAccess:delegated};
    const result={};
    await handler({body,user},{status(code){result.status=code;return this},json(value){result.body=value}},error=>{result.status=error.status});
    return result;
  }
  return {run,calls};
}

test('delegated invoice creation verifies live grant, supplier and audit atomically',async()=>{
  const f=fixture();
  assert.deepEqual(await f.run(),{status:201,body:{id:'draft',status:'NEW'}});
  assert.deepEqual(f.calls,['transaction','live-grant','scoped-supplier','insert','audit']);
});

test('delegated invoice creation denies revoked grants, foreign stores and unavailable suppliers before the write',async()=>{
  for(const [options,storeId,status,calls] of [
    [{hasGrant:false},'store',403,['transaction','live-grant']],
    [{},'foreign',403,['transaction','live-grant']],
    [{hasSupplier:false},'store',404,['transaction','live-grant','scoped-supplier']]
  ]){
    const f=fixture(options);
    assert.equal((await f.run(storeId)).status,status);
    assert.deepEqual(f.calls,calls);
  }
});

test('ordinary management and POS continue using the original store and supplier checks',async()=>{
  const f=fixture({delegated:false});
  assert.equal((await f.run()).status,201);
  assert.deepEqual(f.calls,['owner-store','owner-supplier','transaction','insert','audit']);
});
