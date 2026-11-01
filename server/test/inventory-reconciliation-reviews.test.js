import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {inventoryReviewState,normalizeReviewRequest,projectInventoryReviews,reviewEntity,reviewHash,reviewId,reviewKey,reviewRequestHash} from '../src/services/inventory-reconciliation-review-contract.js';
const scope={companyId:'c',storeId:'s',generation:'0',previousId:'old',currentId:'new'},basis='a'.repeat(64);
const row=(productId,difference,unitCost=2)=>({productId,name:productId,sku:productId,difference,unitCost,findings:[],movements:[]});
const base=rows=>({current:{id:'new',companyId:'c',storeId:'s'},previous:{id:'old'},rows,summary:{itemCount:rows.length},coverage:{identityGrouping:false,reviewedCorrections:false,invoiceAuditComplete:false},fingerprint:basis});
function add(rows,action,{source=basis,actorId='owner'}={}){
  const state=inventoryReviewState(rows,scope),request=normalizeReviewRequest({requestId:randomUUID(),previousStocktakeId:'old',generation:'0',head:state.head,expectedFingerprint:basis,action});
  const id=reviewId(actorId,request.requestId),requestHash=reviewRequestHash(scope,actorId,request),createdAt=new Date(Date.UTC(2026,10,1,0,0,rows.length)).toISOString();
  const detail={version:1,generation:'0',previousId:'old',currentId:'new',actorId,actorName:'Ελεγκτής',sequence:rows.length+1,basisFingerprint:source,createdAt,request,requestHash,head:reviewHash([state.head,id,requestHash,source,createdAt])};
  return [...rows,{id,companyId:'c',storeId:'s',actorUserId:actorId,action:'INVENTORY_REVIEWED',entityType:reviewEntity,entityId:reviewKey(scope),afterJson:detail,createdAt:new Date(createdAt)}];
}
const link=(productIds,canonicalProductId=productIds[0])=>({kind:'LINK',productIds,canonicalProductId,reason:'Ίδιο φυσικό προϊόν',evidence:'Επιβεβαιωμένη φυσική αντιστοίχιση'});
const correction=(productId,quantity)=>({kind:'CORRECTION',productId,quantity,reason:'Διόρθωση καταμέτρησης',evidence:'Φύλλο φυσικής επανακαταμέτρησης'});
const revoke=actionId=>({kind:'REVOKE',actionId,reason:'Ανάκληση λανθασμένης επιβεβαίωσης',evidence:'Νέο φύλλο ελέγχου'});
test('confirmed umbrellas -244/+233 form one -11 group; unconfirmed codes stay separate and original rows survive',()=>{
  const source=base([row('umbrella-A',-244),row('umbrella-B',233)]),original=structuredClone(source);
  const separate=projectInventoryReviews(source,inventoryReviewState([],scope));assert.equal(separate.summary.shortageQuantity,244);assert.equal(separate.summary.surplusQuantity,233);
  const rows=add([],link(['umbrella-A','umbrella-B'])),report=projectInventoryReviews(source,inventoryReviewState(rows,scope));
  assert.equal(report.groups.length,1);assert.equal(report.groups[0].initialDifference,-11);assert.equal(report.groups[0].correctionQuantity,0);assert.equal(report.groups[0].finalDifference,-11);
  assert.equal(report.summary.shortageQuantity,11);assert.equal(report.summary.surplusQuantity,0);assert.equal(report.summary.netValue,-22);assert.deepEqual(source,original);
});
test('glasses -263 plus reviewed +240 yields -23, with intervening sales retained only in original movement detail',()=>{
  const source=base([row('glasses',-263,3)]);source.rows[0].movements=[{id:'sale',quantity:-5}];
  const report=projectInventoryReviews(source,inventoryReviewState(add([],correction('glasses',240)),scope)),group=report.groups[0];
  assert.equal(group.initialDifference,-263);assert.equal(group.correctionQuantity,240);assert.equal(group.finalDifference,-23);
  assert.equal(group.initialValue,-789);assert.equal(group.correctionValue,720);assert.equal(group.finalValue,-69);assert.equal(report.summary.shortageQuantity,23);
  assert.deepEqual(report.rows[0].movements,[{id:'sale',quantity:-5}]);assert.equal(report.review.history.length,1);
});
test('revocation preserves the old correction and restores the uncorrected result without deleting history',()=>{
  const source=base([row('p',-263)]),first=add([],correction('p',240)),records=add(first,revoke(first[0].id));
  const report=projectInventoryReviews(source,inventoryReviewState(records,scope));assert.equal(report.groups[0].finalDifference,-263);assert.equal(report.review.history.length,2);assert.equal(report.review.history[0].active,false);
});
test('transitive identity has an explicit latest canonical cost, and link revocation splits groups',()=>{
  const source=base([row('a',-244),row('b',233),row('c',3,5)]);
  let records=add([],link(['a','b']));records=add(records,link(['b','c'],'c'));
  const report=projectInventoryReviews(source,inventoryReviewState(records,scope));assert.equal(report.groups.length,1);assert.equal(report.groups[0].canonicalProductId,'c');assert.equal(report.groups[0].finalDifference,-8);assert.equal(report.summary.netValue,-40);
  records=add(records,revoke(records[1].id));assert.equal(projectInventoryReviews(source,inventoryReviewState(records,scope)).groups.length,2);
});
test('changed source never silently reapplies an old count correction or reports a partial final total',()=>{
  const source={...base([row('p',-263)]),fingerprint:'b'.repeat(64)},records=add([],correction('p',240));
  const report=projectInventoryReviews(source,inventoryReviewState(records,scope));assert.equal(report.groups[0].finalDifference,null);assert.equal(report.groups[0].correctionQuantity,null);assert.equal(report.summary.netQuantity,null);assert.equal(report.summary.netValue,null);assert.deepEqual(report.groups[0].staleCorrectionIds,[records[0].id]);
});
test('missing or zero canonical cost stays unknown even when the corrected quantity is known',()=>{
  for(const cost of [null,0,-1,undefined]){const source=base([row('p',-263,cost)]);if(cost===undefined)source.rows[0].unitCost=undefined;
    const report=projectInventoryReviews(source,inventoryReviewState(add([],correction('p',240)),scope));assert.equal(report.groups[0].finalDifference,-23);assert.equal(report.groups[0].unitCost,null);assert.equal(report.summary.shortageValue,null);assert.equal(report.summary.netValue,null);}
});
test('cross-scope rows, tampered payloads, unknown fields and broken sequence/head refuse the whole history',()=>{
  const records=add([],correction('p',240));
  for(const mutate of [r=>r[0].storeId='foreign',r=>r[0].afterJson.request.action.quantity=241,r=>r[0].afterJson.sequence=2,r=>r[0].afterJson.head='0'.repeat(64),r=>r[0].afterJson.futureSecret=true,r=>r[0].actorUserId='foreign']){
    const copy=structuredClone(records);mutate(copy);assert.throws(()=>inventoryReviewState(copy,scope));
  }
});
test('unknown and already revoked actions cannot disappear into a partial projection',()=>{
  const records=add([],link(['a','missing']));assert.throws(()=>projectInventoryReviews(base([row('a',-1)]),inventoryReviewState(records,scope)),{code:'INVENTORY_REVIEW_SOURCE_CHANGED'});
  const unknown=add([],revoke('f'.repeat(64)));assert.throws(()=>inventoryReviewState(unknown,scope),{code:'INVENTORY_REVIEW_HISTORY_INVALID'});
});
test('strict normalized requests bind the same semantic payload and reject unsafe quantities and identities',()=>{
  const input={requestId:randomUUID(),previousStocktakeId:'old',generation:'0',head:null,expectedFingerprint:basis,action:link(['b','a'],'a')};
  const first=normalizeReviewRequest(input),second=normalizeReviewRequest({...input,action:{...input.action,productIds:['a','b'],reason:'  Ίδιο φυσικό προϊόν  '}});
  assert.equal(reviewRequestHash(scope,'owner',first),reviewRequestHash(scope,'owner',second));assert.notEqual(reviewRequestHash(scope,'owner',first),reviewRequestHash(scope,'other',first));
  for(const action of [link(['a','a']),link(['a','b'],'c'),correction('p',0),correction('p',1.00001),correction('p',Infinity)])assert.throws(()=>normalizeReviewRequest({...input,action}));
  assert.throws(()=>normalizeReviewRequest({...input,actorId:'spoofed'}));
});
