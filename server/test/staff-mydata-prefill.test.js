import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {staffRequestCapability,validStaffCapabilities} from '../../shared/backoffice-staff.mjs';

const original=readFileSync(new URL('../src/mydata-original.js',import.meta.url),'utf8');
const route=readFileSync(new URL('../src/routes/commerce-mydata-inbox.js',import.meta.url),'utf8');
const source=original.slice(original.indexOf('async function prefillStoredMyDataDraft'),original.indexOf('async function prefillReviewDraft'));
const scope={companyId:'company',storeId:'store',orderId:'order',actorId:'staff'};
const row={inboxId:'inbox',attachmentId:'attachment',supplierId:'supplier',sourceDocumentId:'document',invoiceType:'1.1',totalGross:12};

async function fixture({sources=[row],canFill=true,allowed=true}={}){
  const trace=[];
  const tx={
    $queryRaw:async(sql,...params)=>{
      const text=sql.join('?');
      if(text.includes('FROM "MyDataInboundDocument"')){
        assert.deepEqual(params,['company','store','order']);
        assert.match(text,/mydataDraftOrderId/);
        assert.match(text,/mydataDraftDocumentId/);
        assert.match(text,/FOR UPDATE OF m,i,o,d/);
        trace.push('source');
        return sources;
      }
      if(text.includes('FROM "AiReaderJob"')){
        assert.deepEqual(params,['attachment','company','store','document']);
        trace.push('job');
        return [];
      }
      assert.deepEqual(params,['order']);
      trace.push('count');
      return [{lineCount:2}];
    },
    $executeRaw:async(sql,...params)=>{
      assert.match(sql.join('?'),/PURCHASE_MYDATA_PREFILLED/);
      assert.deepEqual(params.slice(0,4),['audit','company','store','staff']);
      assert.deepEqual(JSON.parse(params[4]),{orderId:'order',documentId:'document',inboxId:'inbox',lineCount:2});
      trace.push('audit');
    }
  };
  const db={$transaction:async fn=>fn(tx)};
  const run=vm.runInNewContext(source+'\nprefillStoredMyDataDraft',{
    crypto:{randomUUID:()=>'audit'},error:(message,status)=>Object.assign(new Error(message),{status}),
    lockInvoiceStore:async(db,company,store)=>{
      assert.equal(db,tx);assert.equal(company,'company');assert.equal(store,'store');trace.push('lock');
    },
    prefillReviewDraft:async(db,source,job,company,store,order,supplier)=>{
      assert.equal(db,tx);assert.equal(source,row);assert.equal(job,undefined);
      assert.deepEqual([company,store,order,supplier],['company','store','order','supplier']);
      trace.push('prefill');return canFill;
    }
  });
  try{
    const result=await run(db,scope,async live=>{
      assert.equal(live,tx);trace.push('grant');
      if(!allowed)throw Object.assign(new Error('denied'),{status:403});
    });
    return {result,trace};
  }catch(error){return {status:error.status,trace}}
}

test('stored myDATA prefill checks scope and a live grant before reusing the writer',async()=>{
  const denied=await fixture({allowed:false});
  assert.deepEqual(denied,{status:403,trace:['grant']});
  const result=await fixture();
  assert.equal(result.result.lineCount,2);
  assert.deepEqual(result.trace,['grant','lock','source','job','prefill','count','audit']);
});

test('stored prefill rejects ambiguous origins and leaves existing lines untouched',async()=>{
  assert.deepEqual(await fixture({sources:[row,row]}),{status:409,trace:['grant','lock','source']});
  assert.deepEqual(await fixture({sources:[{...row,invoiceType:'9.3'}]}),{status:409,trace:['grant','lock','source']});
  const repeat=await fixture({canFill:false});
  assert.equal(repeat.result.lineCount,2);
  assert.deepEqual(repeat.trace,['grant','lock','source','job','prefill','count']);
});

test('delegated route reaches the stored-only writer and needs a distinct capability',()=>{
  assert.equal(staffRequestCapability('POST','/api/commerce/documents/mydata/orders/id/prefill'), 'invoices.mydata-prefill');
  assert.equal(staffRequestCapability('POST','/api/commerce/documents/inbox/id/original'),null);
  assert.equal(validStaffCapabilities(['invoices.mydata-prefill']),false);
  assert.equal(validStaffCapabilities(['invoices.read','invoices.edit','invoices.mydata-prefill']),true);
  assert.match(route,/tx=>requireStaffAction\(tx,req,storeId,"invoices.mydata-prefill"\)/);
});
