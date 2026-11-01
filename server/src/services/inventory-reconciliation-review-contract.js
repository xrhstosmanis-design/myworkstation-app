import {createHash} from 'node:crypto';
import {z} from 'zod';
export const reviewEntity='INVENTORY_RECONCILIATION_REVIEW';
export const reviewLimit=5000;
export const reviewError=(code,message='Η ενέργεια ελέγχου δεν μπορεί να καταχωριστεί. Ανανέωσε την αναφορά.',status=409)=>Object.assign(new Error(message),{code,status});
const id=z.string().trim().min(1).max(120),digest=z.string().regex(/^[a-f0-9]{64}$/),generation=z.string().regex(/^(0|[1-9][0-9]{0,18})$/);
const reason=z.string().trim().min(3).max(500),evidence=z.string().trim().min(5).max(500);
export const reviewActionSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('LINK'),productIds:z.array(id).min(2).max(20).refine(x=>new Set(x).size===x.length),canonicalProductId:id,reason,evidence}).strict(),
  z.object({kind:z.literal('CORRECTION'),productId:id,quantity:z.number().finite().min(-10000000).max(10000000).refine(x=>x!==0&&Math.abs(x*10000-Math.round(x*10000))<0.000001),reason,evidence}).strict(),
  z.object({kind:z.literal('REVOKE'),actionId:digest,reason,evidence}).strict()
]);
export const reviewRequestSchema=z.object({requestId:z.string().uuid(),previousStocktakeId:id,generation,head:digest.nullable(),expectedFingerprint:digest,action:reviewActionSchema}).strict();
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export const reviewHash=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
export const reviewKey=scope=>reviewHash([reviewEntity,scope.companyId,scope.storeId,scope.generation,scope.previousId,scope.currentId]);
export const reviewId=(actorId,requestId)=>reviewHash([reviewEntity,actorId,requestId]);
export function normalizeReviewRequest(input){
  const parsed=reviewRequestSchema.parse(input);
  if(parsed.action.kind==='LINK'){
    parsed.action.productIds.sort();
    if(!parsed.action.productIds.includes(parsed.action.canonicalProductId))throw reviewError('INVENTORY_REVIEW_CANONICAL_INVALID');
  }
  return parsed;
}
export const reviewRequestHash=(scope,actorId,request)=>reviewHash([scope,actorId,request]);
export function inventoryReviewState(rows,scope,{available=true}={}){
  if(rows.length>reviewLimit)throw reviewError('INVENTORY_REVIEW_LIMIT');
  const parsed=rows.map(row=>{
    const d=row.afterJson;
    const keys=['version','generation','previousId','currentId','actorId','actorName','sequence','basisFingerprint','createdAt','request','requestHash','head'];
    if(!d||Object.keys(d).some(k=>!keys.includes(k))||d.version!==1||row.entityType!==reviewEntity||row.action!=='INVENTORY_REVIEWED'||row.companyId!==scope.companyId||row.storeId!==scope.storeId||row.entityId!==reviewKey(scope)||
       d.generation!==scope.generation||d.previousId!==scope.previousId||d.currentId!==scope.currentId||row.actorUserId!==d.actorId||typeof d.actorName!=='string'||!Number.isInteger(d.sequence)||d.sequence<1||
       typeof d.basisFingerprint!=='string'||!digest.safeParse(d.basisFingerprint).success||!Number.isFinite(new Date(row.createdAt).getTime())||new Date(row.createdAt).toISOString()!==d.createdAt)throw reviewError('INVENTORY_REVIEW_HISTORY_INVALID');
    let request;try{request=normalizeReviewRequest(d.request)}catch{throw reviewError('INVENTORY_REVIEW_HISTORY_INVALID')}
    if(row.id!==reviewId(d.actorId,request.requestId)||request.generation!==scope.generation||request.previousStocktakeId!==scope.previousId||d.requestHash!==reviewRequestHash(scope,d.actorId,request))throw reviewError('INVENTORY_REVIEW_HISTORY_INVALID');
    return {id:row.id,...d,request};
  }).sort((a,b)=>a.sequence-b.sequence);
  let head=null;const revoked=new Set(),seen=new Map();
  for(let i=0;i<parsed.length;i++){
    const r=parsed[i];
    if(r.sequence!==i+1||r.request.head!==head||r.head!==reviewHash([head,r.id,r.requestHash,r.basisFingerprint,r.createdAt]))throw reviewError('INVENTORY_REVIEW_HISTORY_INVALID');
    if(r.request.action.kind==='REVOKE'){
      const target=seen.get(r.request.action.actionId);
      if(!target||target.request.action.kind==='REVOKE'||revoked.has(target.id))throw reviewError('INVENTORY_REVIEW_HISTORY_INVALID');
      revoked.add(target.id);
    }
    seen.set(r.id,r);head=r.head;
  }
  return {available,head,records:parsed,active:parsed.filter(r=>r.request.action.kind!=='REVOKE'&&!revoked.has(r.id)),revoked};
}
const round=x=>Math.round((x+Number.EPSILON)*10000)/10000;
export function projectInventoryReviews(base,state){
  if(!state.available)return {...base,review:{version:1,available:false,head:null,history:[]},rawFingerprint:base.fingerprint};
  const parents=new Map(base.rows.map(x=>[x.productId,x.productId])),find=id=>{
    let current=id;const path=[];while(parents.get(current)!==current){const next=parents.get(current);if(next===undefined)throw reviewError('INVENTORY_REVIEW_SOURCE_CHANGED');path.push(current);current=next;}for(const key of path)parents.set(key,current);return current;
  };
  for(const r of state.active.filter(x=>x.request.action.kind==='LINK')){
    const a=r.request.action;
    if(a.productIds.some(id=>!parents.has(id)))throw reviewError('INVENTORY_REVIEW_SOURCE_CHANGED');
    for(const id of a.productIds)parents.set(find(id),find(a.canonicalProductId));
  }
  const linksByRoot=new Map(),correctionsByRoot=new Map();
  for(const r of state.active){const a=r.request.action;
    if(a.kind==='CORRECTION'&&!parents.has(a.productId))throw reviewError('INVENTORY_REVIEW_SOURCE_CHANGED');
    const root=find(a.kind==='LINK'?a.canonicalProductId:a.productId),map=a.kind==='LINK'?linksByRoot:correctionsByRoot;
    if(!map.has(root))map.set(root,[]);map.get(root).push(r);
  }
  const buckets=new Map();for(const row of base.rows){const root=find(row.productId);if(!buckets.has(root))buckets.set(root,[]);buckets.get(root).push(row);}
  const groups=[...buckets.values()].map(members=>{
    const ids=new Set(members.map(x=>x.productId)),root=find(members[0].productId),links=linksByRoot.get(root)||[];
    const primary=links.length?members.find(x=>x.productId===links.at(-1).request.action.canonicalProductId):members[0];
    if(!primary)throw reviewError('INVENTORY_REVIEW_SOURCE_CHANGED');
    const corrections=correctionsByRoot.get(root)||[];
    const stale=corrections.filter(r=>r.basisFingerprint!==base.fingerprint);
    const initialDifference=members.every(x=>x.difference!==null)?round(members.reduce((s,x)=>s+x.difference,0)):null;
    const correctionQuantity=stale.length?null:round(corrections.reduce((s,x)=>s+x.request.action.quantity,0));
    const finalDifference=initialDifference===null||correctionQuantity===null?null:round(initialDifference+correctionQuantity);
    const cost=Number(primary.unitCost),unitCost=Number.isFinite(cost)&&cost>0?cost:null;
    return {id:primary.productId,name:primary.name,sku:primary.sku,productIds:[...ids].sort(),canonicalProductId:primary.productId,
      initialDifference,correctionQuantity,finalDifference,unitCost,
      initialValue:initialDifference===null||unitCost===null?null:round(initialDifference*unitCost),
      correctionValue:correctionQuantity===null||unitCost===null?null:round(correctionQuantity*unitCost),
      finalValue:finalDifference===null||unitCost===null?null:round(finalDifference*unitCost),
      linkIds:links.map(r=>r.id),correctionIds:corrections.map(r=>r.id),staleCorrectionIds:stale.map(r=>r.id),
      findings:[...new Set(members.flatMap(x=>x.findings).concat(stale.length?['STALE_REVIEW_CORRECTION']:[]))]};
  });
  const quantitiesComplete=groups.every(x=>x.finalDifference!==null),costComplete=groups.every(x=>x.finalDifference===0||x.finalValue!==null);
  const negatives=groups.filter(x=>x.finalDifference<0),positives=groups.filter(x=>x.finalDifference>0);
  const summary={...base.summary,groupCount:groups.length,
    shortageQuantity:quantitiesComplete?round(-negatives.reduce((s,x)=>s+x.finalDifference,0)):null,
    surplusQuantity:quantitiesComplete?round(positives.reduce((s,x)=>s+x.finalDifference,0)):null,
    netQuantity:quantitiesComplete?round(groups.reduce((s,x)=>s+x.finalDifference,0)):null,
    shortageValue:costComplete?round(-negatives.reduce((s,x)=>s+x.finalValue,0)):null,
    surplusValue:costComplete?round(positives.reduce((s,x)=>s+x.finalValue,0)):null,
    netValue:costComplete?round(groups.reduce((s,x)=>s+(x.finalValue||0),0)):null,
    uncomputedItems:groups.filter(x=>x.finalDifference===null).length,missingCostItems:groups.filter(x=>x.unitCost===null).length};
  const activeIds=new Set(state.active.map(r=>r.id));
  const history=state.records.map(r=>({id:r.id,requestId:r.request.requestId,actorId:r.actorId,actorName:r.actorName,createdAt:r.createdAt,action:r.request.action,active:activeIds.has(r.id),basisFingerprint:r.basisFingerprint}));
  const report={...base,version:2,initialSummary:base.summary,summary,groups,rawFingerprint:base.fingerprint,
    costMethod:'Για επιβεβαιωμένη ομάδα ίδιου προϊόντος χρησιμοποιείται το αποθηκευμένο κόστος της νεότερης απογραφής του ρητά επιλεγμένου κύριου κωδικού. Άγνωστο ή μηδενικό κόστος δεν αποτιμάται.',
    coverage:{...base.coverage,identityGrouping:true,reviewedCorrections:true},review:{version:1,available:true,head:state.head,history}};
  report.fingerprint=reviewHash([base.fingerprint,report.version,state.head,groups,summary,report.costMethod]);return report;
}
