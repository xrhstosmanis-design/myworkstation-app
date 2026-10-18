import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewLifecycleApplicationLinks} from '../src/services/store-lifecycle-application-links.js';
test('application link review counts exact tenant/store without exporting payloads or inferring deletion',async()=>{
 const calls=[],tx={$queryRawUnsafe:async(...args)=>{calls.push(args);return [{count:57,inconsistent:0}]}};
 const result=await reviewLifecycleApplicationLinks(tx,{schema:'quoted"schema',tables:new Map([['PurchaseOrderLine',new Set(['id','orderId'])],['PurchaseOrder',new Set(['id','storeId'])]]),companyId:'company',storeId:'target',inventory:[{table:'PurchaseOrder',action:'REMOVE'}]});
 assert.deepEqual(calls[0].slice(1),['target','company']);assert.match(calls[0][0],/"quoted""schema"/);assert.match(calls[0][0],/s\."companyId"=\$2/);assert.doesNotMatch(calls[0][0],/SELECT \*|DELETE|UPDATE|INSERT/);
 assert.deepEqual(result,[{table:'PurchaseOrderLine',parent:'PurchaseOrder',column:'orderId',count:57,inconsistent:0,parentAction:'REMOVE',action:'REVIEW',status:'APPLICATION_LINK'}]);
});
test('missing reviewed link layout fails closed while absent modules do not query',async()=>{
 const tx={$queryRawUnsafe(){throw Error('unexpected query')}};
 assert.deepEqual(await reviewLifecycleApplicationLinks(tx,{schema:'s',tables:new Map(),inventory:[]}),[]);
 const result=await reviewLifecycleApplicationLinks(tx,{schema:'s',tables:new Map([['PurchaseOrderLine',new Set(['id'])]]),inventory:[]});
 assert.equal(result[0].status,'SCHEMA_CHANGED');assert.equal(result[0].count,null);assert.equal(result[0].action,'REVIEW');
});
