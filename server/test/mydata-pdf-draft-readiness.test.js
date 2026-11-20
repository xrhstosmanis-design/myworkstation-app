import test from 'node:test';
import assert from 'node:assert/strict';
import {readMyDataPdfDraftReadiness as read} from '../src/lib/mydata-pdf-draft-readiness.js';
const input={companyId:'c',storeId:'s',inboxId:'i',orderId:'o'},row={orderStatus:'NEW',documentStatus:'DRAFT',orderSourceType:'POS_OCR_DRAFT',documentSourceType:'POS_OCR_DRAFT',inboxStatus:'IN_REVIEW',pdfPrefix:true,orderLineCount:0,documentLineCount:0};
test('one scoped metadata SELECT identifies empty existing PDF without requiring modern job provenance or fetching bytes',async()=>{
 let calls=0;const actual=await read({$queryRawUnsafe:async(sql,...args)=>{calls++;assert.match(sql,/FROM "MyDataInboundDocument"/);assert.match(sql,/LIMIT 2/);assert.doesNotMatch(sql,/resultJson|SELECT.*a\."contentData",|INSERT|UPDATE|CREATE|ALTER/);assert.deepEqual(args,['c','s','i','o']);return [{...row}]}},input);
 assert.equal(calls,1);assert.equal(actual.state,'NEEDS_READING');assert.equal(actual.needsPdfReading,true);assert.equal(actual.orderLineCount,0);assert.equal(actual.documentLineCount,0);
});
test('existing rows are preserved and finalized or processed sources never trigger reading',async()=>{
 for(const patch of [{orderLineCount:1},{documentLineCount:1}])assert.equal((await read({$queryRawUnsafe:async()=>[{...row,...patch}]},input)).state,'HAS_LINES');
 for(const patch of [{orderStatus:'FINAL'},{documentStatus:'APPROVED'},{inboxStatus:'PROCESSED'}]){const result=await read({$queryRawUnsafe:async()=>[{...row,...patch}]},input);assert.equal(result.state,'READ_ONLY');assert.equal(result.needsPdfReading,false)}
});
test('missing duplicate foreign malformed and wrong-PDF metadata fail closed',async()=>{
 for(const rows of [[],[row,row],[{...row,pdfPrefix:false}],[{...row,pdfPrefix:null}],[{...row,orderLineCount:'0'}],[{...row,documentLineCount:-1}],[{...row,orderSourceType:'MANUAL'}]]){const result=await read({$queryRawUnsafe:async()=>rows},input);assert.equal(result.state,'UNAVAILABLE');assert.equal(result.needsPdfReading,false)}
 for(const patch of [{storeId:''},{orderId:['o']},{inboxId:'i\n'}])assert.equal((await read({$queryRawUnsafe:()=>{throw Error('must not read')}},{...input,...patch})).state,'UNAVAILABLE');
 for(const field of ['orderStatus','documentStatus','inboxStatus'])for(const status of [null,undefined,'UNKNOWN','CANCELLED','DELETED','MERGED','REVERSED']){const result=await read({$queryRawUnsafe:async()=>[{...row,[field]:status}]},input);assert.equal(result.state,'UNAVAILABLE',field+':'+status);assert.equal(result.needsPdfReading,false)}
});
