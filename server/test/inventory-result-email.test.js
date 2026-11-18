import test from 'node:test';
import assert from 'node:assert/strict';
import {readInventoryResultEvent,buildAutomaticInventoryPayload} from '../src/services/inventory-result-email.js';
const current={id:'current',companyId:'company',storeId:'store',status:'FINALIZED',startedAt:'2026-11-10T00:00:00.000Z',finalizedAt:'2026-11-11T00:00:00.000Z'};
const scope={companyId:'company',storeId:'store',eventId:'current',now:'2026-11-12T00:00:00.000Z'};
const tx={$queryRaw:async()=>[current]};
const report={current,previous:{id:'prior'},fingerprint:'fingerprint',rows:[],coverage:{transactionSourcesAvailable:true},sourceEvidence:{coverage:{invoices:true},checkedCounts:{transactions:5,invoices:2,systemEvents:1}},summary:{uncomputedItems:0,shortageQuantity:1,surplusQuantity:0,netQuantity:-1,shortageValue:null,surplusValue:null,netValue:null,missingCostItems:1}};
const args={...scope,settingsVersion:1,period:{from:current.startedAt,to:'2026-11-11T00:00:00.001Z'}};
test('finalized event binds same selected store and inclusive final millisecond',async()=>{
  assert.equal((await readInventoryResultEvent(tx,scope)).to,args.period.to);
  await assert.rejects(readInventoryResultEvent(tx,{...scope,now:current.finalizedAt}),{code:'REPORT_DISPATCH_HOLD'});
  await assert.rejects(readInventoryResultEvent({$queryRaw:async()=>[]},scope),{code:'REPORT_DISPATCH_HOLD'});
});
test('canonical reconciliation stays in caller transaction and preserves unknown costs/evidence',async()=>{
  const payload=await buildAutomaticInventoryPayload(tx,args,{readReport:async(db,selected)=>{assert.equal(selected,current);assert.equal(await db.$transaction(bound=>bound),tx);return report}});
  const content=JSON.parse(payload.body);assert.equal(content.previousStocktakeId,'prior');
  assert.match(content.text,/Αξία ελλείμματος EUR: Άγνωστο/);assert.match(content.text,/Παραστατικά: 2/);
  const changed=await buildAutomaticInventoryPayload(tx,args,{readReport:async()=>({...report,fingerprint:'changed'})});
  assert.notEqual(changed.sourceFingerprint,payload.sourceFingerprint);
});
test('missing comparison and uncomputed or unavailable transaction evidence stay on hold',async()=>{
  for(const value of [{...report,previous:null},{...report,summary:{...report.summary,uncomputedItems:1}},{...report,coverage:{transactionSourcesAvailable:false}},{...report,sourceEvidence:{...report.sourceEvidence,coverage:{invoices:false}}}]){
    await assert.rejects(buildAutomaticInventoryPayload(tx,args,{readReport:async()=>value}),{code:'REPORT_DISPATCH_HOLD'});
  }
});

test('reviewed V2 groups render final values consistently with corrected summary',async()=>{
 const reviewed={...report,version:2,rows:[{productId:'old',sku:'RAW',name:'Raw original',difference:-9,differenceValue:-90}],groups:[{id:'canonical',canonicalProductId:'canonical',sku:'FINAL',name:'Reviewed group',productIds:['old','canonical'],finalDifference:2,finalValue:20}],summary:{...report.summary,shortageQuantity:0,surplusQuantity:2,netQuantity:2,shortageValue:0,surplusValue:20,netValue:20,missingCostItems:0}};
 const payload=await buildAutomaticInventoryPayload(tx,args,{readReport:async()=>reviewed});
 const {text}=JSON.parse(payload.body);
 assert.match(text,/Καθαρή διαφορά ποσότητας: 2/);
 assert.match(text,/FINAL · Reviewed group · Κωδικοί old, canonical · Τελική διαφορά 2 · Τελική αξία EUR 20/);
 assert.doesNotMatch(text,/Raw original|RAW|Διαφορά -9|Αξία EUR -90/);
 await assert.rejects(buildAutomaticInventoryPayload(tx,args,{readReport:async()=>({...reviewed,groups:null})}),{code:'REPORT_DISPATCH_HOLD'});
});
