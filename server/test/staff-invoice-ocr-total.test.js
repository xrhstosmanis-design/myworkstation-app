import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/routes/purchase-orders.js',import.meta.url),'utf8');
const start=source.indexOf('router.post("/:orderId/reconcile-ocr-total"');
const handlerSource=source.slice(start,source.indexOf('function purchaseBatchError',start));
const client=readFileSync(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url),'utf8');

async function fixture({confirmed=true,staffAccess=true,deny=false,documentVisible=true}={}){
  const trace=[];
  let handler,data,status=200;
  const found={id:'order',sourceType:'POS_OCR_DRAFT',sourceDocumentId:'document',storeId:'store',status:'NEW'};
  const tx={
    $queryRaw:async(sql,...params)=>{
      if(sql[0].includes('FROM "PurchaseDocument"')){
        assert.deepEqual(params,['document','company','store']);
        trace.push('document');
        return documentVisible?[{totalGross:20}]:[];
      }
      trace.push('totals');
      return [{net:20,excise:0,gross:24.8}];
    },
    $executeRaw:async(sql,...params)=>{
      if(sql[0].startsWith('UPDATE "PurchaseDocument"'))assert.deepEqual(params,[20,'document','company','store']);
      trace.push('write');
      return 1;
    }
  };
  vm.runInNewContext(handlerSource,{
    router:{post:(path,fn)=>{assert.equal(path,'/:orderId/reconcile-ocr-total');handler=fn}},
    order:async()=>found,editable:()=>{},n:value=>Number(value||0),
    requireStaffOrderAction:async(db,req,id,capability)=>{
      assert.equal(db,tx);
      assert.equal(id,'order');
      assert.equal(capability,'invoices.edit');
      trace.push('grant');
      if(deny)throw Object.assign(new Error('denied'),{status:403});
    },
    lockEditablePurchaseOrder:async(db,row)=>{assert.equal(db,tx);assert.equal(row,found);trace.push('lock')},
    writePurchaseAudit:async(db,req,event)=>{
      assert.equal(db,tx);
      assert.equal(event.storeId,'store');
      assert.equal(event.eventType,'PURCHASE_OCR_TOTAL_RECONCILED');
      assert.equal(event.details.grossTotalAfter,20);
      trace.push('audit');
    },
    prisma:{$transaction:async fn=>{trace.push('begin');return fn(tx)}}
  });
  const res={status:code=>{status=code;return res},json:payload=>{data=payload}};
  await handler({user:{staffAccess,companyId:'company'},params:{orderId:'order'},body:{confirmed}},res,error=>{status=error.status||500;});
  return {trace,status,data};
}

test('delegated OCR reconciliation requires confirmation and a live grant before scoped document writes',async()=>{
  assert.deepEqual((await fixture({confirmed:false})).trace,[]);
  assert.equal((await fixture({confirmed:false})).status,400);
  const denied=await fixture({deny:true});
  assert.equal(denied.status,403);
  assert.deepEqual(denied.trace,['begin','grant']);
  const result=await fixture();
  assert.equal(result.data.repaired,true);
  assert.deepEqual(result.trace,['begin','grant','lock','document','totals','write','write','write','audit']);
});

test('missing scoped source document is never repaired and the original owner action still works',async()=>{
  const missing=await fixture({documentVisible:false});
  assert.equal(missing.data.reason,'DOCUMENT_NOT_EDITABLE');
  assert.deepEqual(missing.trace,['begin','grant','lock','document']);
  const owner=await fixture({staffAccess:false,confirmed:false});
  assert.equal(owner.data.repaired,true);
  assert.equal(owner.trace.includes('grant'),false);
});

test('delegated UI exposes only a confirmed OCR reconciliation in the editable invoice scope',()=>{
  assert.match(client,/if\(edit&&!locked&&o\.sourceType==="POS_OCR_DRAFT"&&o\.sourceDocumentId&&!Number\(o\.reopenVersion\)\)/);
  assert.match(client,/Έλεγχος συνόλου OCR/);
  assert.match(client,/reconcile-ocr-total`?,\{method:"POST",body:JSON\.stringify\(\{confirmed:true\}\)/);
});
