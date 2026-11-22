import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAutomaticPromotionPayload,readPromotionResultEvent,listDuePromotionResultEvents} from '../src/services/promotion-result-email.js';

const scope={companyId:'company',storeId:'store',eventId:'promo',now:'2026-11-17T12:00:00.000Z'};
const promotion={id:'promo',companyId:'company',validFrom:new Date('2026-11-01T00:00:00.000Z'),validUntil:new Date('2026-11-10T00:00:00.000Z'),updatedAt:new Date('2026-11-01T00:00:00Z')};
const db={async $queryRaw(){return [promotion]}};
const args={...scope,storeName:'LAB',settingsVersion:1,period:{from:promotion.validFrom.toISOString(),to:new Date(promotion.validUntil.getTime()+1).toISOString()}};
const report={sourceCoverage:{complete:true},unattributedPromotionReversal:false,items:[{promotionId:'promo',productId:'a',name:'A',unit:'ΤΜΧ',salesQuantity:2,grossSales:3,discountValue:1},{promotionId:'other',productId:'b',name:'B',salesQuantity:10,grossSales:20,discountValue:5}]};
test('event source rejects missing, open and unfinished promotions',async()=>{
  for(const row of [null,{...promotion,validUntil:null},{...promotion,validUntil:new Date('2026-12-01')}]){
    await assert.rejects(readPromotionResultEvent({$queryRaw:async()=>row?[row]:[]},scope),{code:'REPORT_DISPATCH_HOLD'});
  }
});
test('event payload includes only the selected promotion and hashes stable result fields',async()=>{
  let called;
  const readReport=async(input,options)=>{called={input,options};return report};
  const payload=await buildAutomaticPromotionPayload(db,args,{readReport});
  const body=JSON.parse(payload.body);
  assert.equal(body.eventId,'promo');assert.equal(body.frequency,'EVENT');
  assert.match(body.text,/Σύνολο πωλήσεων: 3,00/);assert.doesNotMatch(body.text,/B ·/);
  assert.equal(called.input.promotionsOnly,true);assert.equal(called.options.db,db);
  const changedStock={...report,items:report.items.map(item=>({...item,currentStock:123}))};
  const stable=await buildAutomaticPromotionPayload(db,args,{readReport:async()=>changedStock});
  assert.equal(payload.payloadFingerprint,stable.payloadFingerprint);
  const changed=await buildAutomaticPromotionPayload(db,args,{readReport:async()=>({...report,items:report.items.map(item=>({...item,grossSales:4}))})});
  assert.notEqual(payload.payloadFingerprint,changed.payloadFingerprint);
});
test('incomplete and ambiguous reversal sources cannot produce an email',async()=>{
  for(const source of [{...report,sourceCoverage:{complete:false}},{...report,unattributedPromotionReversal:true}]){
    await assert.rejects(buildAutomaticPromotionPayload(db,args,{readReport:async()=>source}),{code:'REPORT_DISPATCH_HOLD'});
  }
});
test('due discovery is bounded and binds store, authorization cutoff and cursor',async()=>{
  let query;
  await listDuePromotionResultEvents({$queryRaw:async(strings,...values)=>{query={text:strings.join('?'),values};return []}}, {...scope,afterEventId:'last',limit:3});
  assert.match(query.text,/"notBefore"/);assert.match(query.text,/PriceCatalogPromotionStore/);
  assert.ok(query.values.includes('last'));assert.ok(query.values.includes(3));
  await assert.rejects(listDuePromotionResultEvents(db,{...scope,limit:21}),TypeError);
});

test('inclusive promotion end becomes exclusive report boundary',async()=>{
  await assert.rejects(readPromotionResultEvent(db,{...scope,now:promotion.validUntil.toISOString()}),{code:'REPORT_DISPATCH_HOLD'});
  const event=await readPromotionResultEvent(db,{...scope,now:args.period.to});
  assert.equal(event.to,args.period.to);
  let upper;
  await buildAutomaticPromotionPayload(db,args,{readReport:async(input)=>{upper=input.to;return report}});
  assert.equal(upper.getTime(),promotion.validUntil.getTime()+1);
});
test('money totals sum rounded signed cents and reject unsafe values',async()=>{
  const items=[0.1,0.2,1.005,-1.005].map((grossSales,index)=>({...report.items[0],productId:String(index),grossSales,discountValue:0}));
  const payload=await buildAutomaticPromotionPayload(db,args,{readReport:async()=>({...report,items})});
  assert.match(JSON.parse(payload.body).text,/Σύνολο πωλήσεων: 0,30/);
  await assert.rejects(buildAutomaticPromotionPayload(db,args,{readReport:async()=>({...report,items:[{...items[0],grossSales:Number.MAX_SAFE_INTEGER}]})}),{code:'REPORT_DISPATCH_HOLD'});
});
test('oversized result messages stay on hold before persistence',async()=>{
  const items=Array.from({length:10000},(_,index)=>({...report.items[0],productId:String(index),name:'Ω'.repeat(200)}));
  await assert.rejects(buildAutomaticPromotionPayload(db,args,{readReport:async()=>({...report,items})}),{code:'REPORT_DISPATCH_HOLD'});
});
