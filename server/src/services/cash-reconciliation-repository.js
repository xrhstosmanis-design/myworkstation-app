import {readLifecycleGeneration,assertLifecycleMutation} from './store-lifecycle-generation.js';
import {createCashPaperRepository} from './cash-paper-repository.js';
import {reconciliationEntity,reconciliationLimit,scopeKey,hash,actionId,requestHash,chainState,activeRecords,reconcileError} from './cash-reconciliation-contract.js';
import {readReconciliationSources,readReconciliationSession} from './cash-reconciliation-source.js';
import {projectReconciliation,immediateCashPair} from './cash-reconciliation-report.js';

export function createCashReconciliationRepository(db){
  async function generation(scope){const s=await readLifecycleGeneration(db,scope);if(s.maintenance||s.retired)throw reconcileError('STORE_LIFECYCLE_MAINTENANCE');return s.generation;}
  async function state(tx,scope){const key=scopeKey(scope),rows=await tx.$queryRaw`SELECT "id","companyId","storeId","action","entityType","entityId","afterJson","createdAt" FROM "WorkforceAuditLog" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "entityType"=${reconciliationEntity} AND "entityId"=${key} ORDER BY "createdAt","id" LIMIT 501`;return chainState(rows,scope);}
  async function paperProof(tx,scope,data){
    const papers=createCashPaperRepository(tx);await papers.source(scope,data.messageId,data.checksum);
    const reading=await papers.get(scope,data.checksum),line=reading.extraction?.lines?.[data.line];
    if(reading.status!=='EXTRACTED_UNVERIFIED'||reading.sourceKey!==data.sourceKey||!line)throw reconcileError('CASH_RECONCILIATION_PAPER_UNAVAILABLE');
    return {paperLineHash:hash(line),rawLine:line,printedDate:reading.extraction.dateText,modelDocumentDate:reading.extraction.documentDate};
  }
  async function materialize(tx,scope,period,chain,extraIds=[]){
    const active=activeRecords(chain.records),source=await readReconciliationSources(tx,scope,period,extraIds);
    const connected=new Set(source.sessions.keys());let expanded=true;
    while(expanded){expanded=false;for(const r of active.filter(r=>r.data.kind==='OFFSET')){
      const ids=[r.data.previousSessionId,r.data.nextSessionId];if(ids.some(id=>connected.has(id)))for(const id of ids)if(!connected.has(id)){connected.add(id);expanded=true;}
    }if(connected.size>500)throw reconcileError('CASH_RECONCILIATION_LIMIT');}
    for(const id of connected)if(!source.sessions.has(id))source.sessions.set(id,await readReconciliationSession(tx,scope,id,source.rule));
    const validity=new Map(),associations=active.filter(r=>r.data.kind==='ASSOCIATE'&&source.sessions.has(r.data.sessionId));
    if(associations.length>20)throw reconcileError('CASH_RECONCILIATION_LIMIT');
    for(const r of associations){
      try{const proof=await paperProof(tx,scope,r.data),s=source.sessions.get(r.data.sessionId),t=r.data.transactionId?s.transactions.find(t=>t.id===r.data.transactionId):null;
        validity.set(r.id,proof.paperLineHash===r.proof.paperLineHash&&(!r.data.transactionId||Boolean(t&&!t.reversed&&t.amountCents!==null&&Math.abs(t.amountCents)===Math.abs(r.data.confirmedAmountCents))));
      }catch{validity.set(r.id,false);}
    }
    const report=projectReconciliation(source,chain.records,validity);
    return {source,report};
  }
  const response=(chain,report,extra={})=>{const ids=new Set(activeRecords(chain.records).map(r=>r.id));return {...report,head:chain.head,completedRequestIds:chain.records.map(r=>r.requestId),history:chain.records.slice(-50).map(r=>({id:r.id,kind:r.data.kind,note:r.data.note,actorName:r.actorName,createdAt:r.createdAt,active:ids.has(r.id),sessionId:r.data.sessionId||r.data.previousSessionId||null,relatedSessionId:r.data.nextSessionId||null,amountCents:r.data.amountCents??null})),...extra};};
  async function read(scope,period){
    return db.$transaction(async tx=>{
      if(await generationFor(tx,scope)!==scope.generation)throw reconcileError('STORE_LIFECYCLE_STALE_GENERATION');
      const chain=await state(tx,scope),{report}=await materialize(tx,scope,period,chain);
      return response(chain,report,{generation:scope.generation,checkedAt:new Date().toISOString()});
    },{isolationLevel:'RepeatableRead',maxWait:5000,timeout:15000});
  }
  async function generationFor(tx,scope){const s=await readLifecycleGeneration(tx,scope);if(s.maintenance||s.retired)throw reconcileError('STORE_LIFECYCLE_MAINTENANCE');return s.generation;}
  async function apply(scope,actor,request){
    return db.$transaction(async tx=>{
      const stores=await tx.$queryRaw`SELECT s."id" FROM "Store" s JOIN "Company" c ON c."id"=s."companyId" WHERE s."id"=${scope.storeId} AND s."companyId"=${scope.companyId} AND s."active"=TRUE AND c."active"=TRUE FOR UPDATE OF s`;
      if(!stores.length)throw reconcileError('CASH_RECONCILIATION_NOT_FOUND',404);
      await assertLifecycleMutation(tx,scope,scope.generation);
      const chain=await state(tx,scope),digest=requestHash(request),replay=chain.records.find(r=>r.requestId===request.requestId);
      if(replay){if(replay.requestHash!==digest)throw reconcileError('CASH_RECONCILIATION_REPLAY_CHANGED');const {report}=await materialize(tx,scope,request.period,chain);return response(chain,report,{reused:true,actionId:replay.id,generation:scope.generation});}
      if(chain.head!==request.head)throw reconcileError('CASH_RECONCILIATION_STALE_HEAD');
      if(chain.records.length>=reconciliationLimit)throw reconcileError('CASH_RECONCILIATION_LIMIT');
      const d=request.data,extra=d.kind==='OFFSET'?[d.previousSessionId,d.nextSessionId]:d.sessionId?[d.sessionId]:[];
      const {source,report}=await materialize(tx,scope,request.period,chain,extra),active=activeRecords(chain.records),allRows=[...report.rows,...report.context];
      let proof={period:request.period};
      if(d.kind==='ASSOCIATE'){
        const s=source.sessions.get(d.sessionId);if(!source.selectedIds.includes(d.sessionId)||!s||s.sourceHash!==d.sourceHash)throw reconcileError('CASH_RECONCILIATION_SOURCE_CHANGED');
        if(active.some(r=>r.data.kind==='ASSOCIATE'&&r.data.sourceKey===d.sourceKey&&r.data.line===d.line))throw reconcileError('CASH_RECONCILIATION_LINE_USED');
        const p=await paperProof(tx,scope,d),t=d.transactionId?s.transactions.find(t=>t.id===d.transactionId):null;
        if(d.transactionId&&(!t||t.reversed||t.amountCents===null||Math.abs(t.amountCents)!==Math.abs(d.confirmedAmountCents)))throw reconcileError('CASH_RECONCILIATION_TRANSACTION_MISMATCH');
        proof={...proof,...p,sourceHash:s.sourceHash};
      }else if(d.kind==='OFFSET'){
        const a=source.sessions.get(d.previousSessionId),b=source.sessions.get(d.nextSessionId),ra=allRows.find(r=>r.sessionId===d.previousSessionId),rb=allRows.find(r=>r.sessionId===d.nextSessionId);
        if(![d.previousSessionId,d.nextSessionId].some(id=>source.selectedIds.includes(id))||!a||!b||!immediateCashPair(a,b,source.rule)||a.sourceHash!==d.previousHash||b.sourceHash!==d.nextHash)throw reconcileError('CASH_RECONCILIATION_PAIR_INVALID');
        if(!ra||!rb||ra.recheck||rb.recheck||ra.remainingCents===null||rb.remainingCents===null||ra.remainingCents*rb.remainingCents>=0||d.amountCents>Math.min(Math.abs(ra.remainingCents),Math.abs(rb.remainingCents)))throw reconcileError('CASH_RECONCILIATION_AMOUNT_INVALID');
        proof={...proof,previousHash:a.sourceHash,nextHash:b.sourceHash,previousRemainingCents:ra.remainingCents,nextRemainingCents:rb.remainingCents};
      }else if(d.kind==='CONFIRM'){
        const row=report.rows.find(r=>r.sessionId===d.sessionId);
        if(!row?.eligible||row.sourceHash!==d.sourceHash||row.planHash!==d.planHash)throw reconcileError('CASH_RECONCILIATION_SOURCE_CHANGED');
        proof={...proof,sourceHash:row.sourceHash,planHash:row.planHash,remainingCents:row.remainingCents};
      }else if(d.kind==='REVOKE'){
        const target=active.find(r=>r.id===d.targetId&&['ASSOCIATE','OFFSET','CONFIRM'].includes(r.data.kind));
        if(!target||![target.data.sessionId,target.data.previousSessionId,target.data.nextSessionId].some(id=>source.selectedIds.includes(id)))throw reconcileError('CASH_RECONCILIATION_NOT_FOUND',404);
        proof={...proof,targetId:d.targetId};
      }else if(d.kind==='CHECKPOINT'){
        if(d.reportHash!==report.reportHash||!report.rows.length)throw reconcileError('CASH_RECONCILIATION_SOURCE_CHANGED');
        const pending=report.rows.filter(r=>!r.reviewed&&r.status!=='NOT_APPLICABLE').map(r=>r.day).sort();
        const nextDay=new Date(Date.parse(request.period.to+'T12:00:00Z')+86400000).toISOString().slice(0,10);
        if(d.resumeFrom<request.period.from||d.resumeFrom>nextDay||(pending.length&&d.resumeFrom>pending[0]))throw reconcileError('CASH_RECONCILIATION_CHECKPOINT_INVALID');
        proof={...proof,reportHash:report.reportHash,pendingSessions:report.rows.filter(r=>!r.reviewed).map(r=>r.sessionId)};
      }
      const id=actionId(chain.key,request.requestId),detail={version:1,generation:scope.generation,sequence:chain.records.length+1,previousHead:chain.head,requestId:request.requestId,requestHash:digest,data:d,proof,actorName:String(actor.fullName||actor.email||'Ελεγκτής').slice(0,180)};
      detail.head=hash({id,sequence:detail.sequence,previousHead:detail.previousHead,requestHash:digest,data:d,proof,actorName:detail.actorName});
      if(JSON.stringify(detail).length>12000)throw reconcileError('CASH_RECONCILIATION_LIMIT');
      await tx.$queryRaw`INSERT INTO "WorkforceAuditLog" ("id","companyId","storeId","actorUserId","action","entityType","entityId","afterJson","createdAt") VALUES (${id},${scope.companyId},${scope.storeId},${actor.id},'CASH_RECONCILIATION_REVIEWED',${reconciliationEntity},${chain.key},${JSON.stringify(detail)}::jsonb,NOW()) RETURNING "id"`;
      const next=await state(tx,scope),material=await materialize(tx,scope,request.period,next);
      return response(next,material.report,{generation:scope.generation,actionId:id,reused:false,checkedAt:new Date().toISOString()});
    },{isolationLevel:'ReadCommitted',maxWait:5000,timeout:15000});
  }
  return {generation,read,apply};
}
