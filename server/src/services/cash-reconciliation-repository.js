import {readLifecycleGeneration,assertLifecycleMutation} from './store-lifecycle-generation.js';
import {createCashPaperRepository} from './cash-paper-repository.js';
import {reconciliationEntity,reconciliationLimit,scopeKey,hash,actionId,requestHash,chainState,activeRecords,reconcileError,transactionMatchesPaper,periodSchema} from './cash-reconciliation-contract.js';
import {readReconciliationSources,readReconciliationSession} from './cash-reconciliation-source.js';
import {projectReconciliation,immediateCashPair} from './cash-reconciliation-report.js';
import {cashReportRowDay} from '../../../client/src/lib/cash-report-period.js';

export function createCashReconciliationRepository(db){
  async function generation(scope){const s=await readLifecycleGeneration(db,scope);if(s.maintenance||s.retired)throw reconcileError('STORE_LIFECYCLE_MAINTENANCE');return s.generation;}
  async function state(tx,scope){const key=scopeKey(scope),rows=await tx.$queryRaw`SELECT "id","companyId","storeId","action","entityType","entityId","afterJson","createdAt" FROM "WorkforceAuditLog" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "entityType"=${reconciliationEntity} AND "entityId"=${key} ORDER BY "createdAt","id" LIMIT ${reconciliationLimit+1}`;return chainState(rows,scope);}
  async function paperReading(tx,scope,data){
    const papers=createCashPaperRepository(tx);await papers.source(scope,data.messageId,data.checksum);
    const reading=await papers.get(scope,data.checksum);
    if(reading.status!=='EXTRACTED_UNVERIFIED'||reading.sourceKey!==data.sourceKey)throw reconcileError('CASH_RECONCILIATION_PAPER_UNAVAILABLE');
    return reading;
  }
  async function paperProof(tx,scope,data,cachedReading){
    const reading=cachedReading||await paperReading(tx,scope,data),line=reading.extraction?.lines?.[data.line];
    if(!line)throw reconcileError('CASH_RECONCILIATION_PAPER_UNAVAILABLE');
    return {paperLineHash:hash(line),rawLine:line,printedDate:reading.extraction.dateText,modelDocumentDate:reading.extraction.documentDate};
  }
  async function materialize(tx,scope,period,chain,extraIds=[],selection=null){
    const active=activeRecords(chain.records),source=await readReconciliationSources(tx,scope,period,extraIds);
    if(selection){source.selectedIds=selection.ids;source.period=selection.displayPeriod;}
    const connected=new Set(source.sessions.keys());let expanded=true;
    while(expanded){expanded=false;for(const r of active.filter(r=>r.data.kind==='OFFSET')){
      const ids=[r.data.previousSessionId,r.data.nextSessionId];if(ids.some(id=>connected.has(id)))for(const id of ids)if(!connected.has(id)){connected.add(id);expanded=true;}
    }if(connected.size>500)throw reconcileError('CASH_RECONCILIATION_LIMIT');}
    for(const id of connected)if(!source.sessions.has(id))source.sessions.set(id,await readReconciliationSession(tx,scope,id,source.rule));
    const validity=new Map(),associations=active.filter(r=>r.data.kind==='ASSOCIATE'&&source.sessions.has(r.data.sessionId));
    const readings=new Map(),fileKey=d=>JSON.stringify([d.messageId,d.checksum,d.sourceKey]);
    if(new Set(associations.map(r=>fileKey(r.data))).size>50)throw reconcileError('CASH_RECONCILIATION_LIMIT');
    for(const r of associations){
      try{const key=fileKey(r.data);if(!readings.has(key)){try{readings.set(key,await paperReading(tx,scope,r.data));}catch{readings.set(key,null);}}
        if(!readings.get(key))throw reconcileError('CASH_RECONCILIATION_PAPER_UNAVAILABLE');
        const proof=await paperProof(tx,scope,r.data,readings.get(key)),s=source.sessions.get(r.data.sessionId),t=r.data.transactionId?s.transactions.find(t=>t.id===r.data.transactionId):null;
        validity.set(r.id,proof.paperLineHash===r.proof.paperLineHash&&(!r.data.transactionId||transactionMatchesPaper(r.data.confirmedKind,t,r.data.confirmedAmountCents)));
      }catch{validity.set(r.id,false);}
    }
    const report=projectReconciliation(source,chain.records,validity);
    return {source,report};
  }
  const response=(chain,report,extra={},historyPage=0,requestId=null)=>{
    const ids=new Set(activeRecords(chain.records).map(r=>r.id)),end=Math.max(0,chain.records.length-historyPage*50),start=Math.max(0,end-50);
    return {...report,head:chain.head,requestId,requestStatus:requestId?(chain.records.some(r=>r.requestId===requestId)?'APPLIED':'NOT_FOUND'):null,historyPage,historyPages:Math.max(1,Math.ceil(chain.records.length/50)),historyTotal:chain.records.length,history:chain.records.slice(start,end).map(r=>({id:r.id,kind:r.data.kind,note:r.data.note,actorName:r.actorName,createdAt:r.createdAt,active:r.data.kind==='REVOKE'?null:ids.has(r.id),sessionId:r.data.sessionId||r.data.previousSessionId||null,relatedSessionId:r.data.nextSessionId||null,amountCents:r.data.amountCents??null,paper:r.data.kind==='ASSOCIATE'?{label:r.proof.rawLine?.label||'Χαρτί',rawAmountText:r.proof.rawLine?.amountText??null,rawTimeText:r.proof.rawLine?.timeText??null,rawDate:r.proof.printedDate??null,confirmedKind:r.data.confirmedKind,confirmedDate:r.data.confirmedDate,confirmedAmountCents:r.data.confirmedAmountCents}:null})),...extra};
  };
  async function read(scope,period,{historyPage=0,requestId=null}={}){
    if(!Number.isInteger(historyPage)||historyPage<0||historyPage>199)throw reconcileError('CASH_RECONCILIATION_SCOPE_INVALID',400);
    return db.$transaction(async tx=>{
      if(await generationFor(tx,scope)!==scope.generation)throw reconcileError('STORE_LIFECYCLE_STALE_GENERATION');
      const chain=await state(tx,scope);if(historyPage>=Math.max(1,Math.ceil(chain.records.length/50)))throw reconcileError('CASH_RECONCILIATION_SCOPE_INVALID',400);
      const {report}=await materialize(tx,scope,period,chain);
      return response(chain,report,{generation:scope.generation,checkedAt:new Date().toISOString()},historyPage,requestId);
    },{isolationLevel:'RepeatableRead',maxWait:5000,timeout:15000});
  }
  async function generationFor(tx,scope){const s=await readLifecycleGeneration(tx,scope);if(s.maintenance||s.retired)throw reconcileError('STORE_LIFECYCLE_MAINTENANCE');return s.generation;}
  // Internal consumer only: the caller supplies session IDs from its trusted,
  // same-transaction business-window query. This is not a public ID-list API.
  async function readSelectedInTransaction(tx,scope,scanPeriod,sessionIds){
    if(!periodSchema.safeParse(scanPeriod).success||!Array.isArray(sessionIds)||!sessionIds.length||sessionIds.length>200||sessionIds.some(id=>typeof id!=='string'||!id.trim())||new Set(sessionIds).size!==sessionIds.length)throw reconcileError('CASH_RECONCILIATION_SCOPE_INVALID',400);
    if(await generationFor(tx,scope)!==scope.generation)throw reconcileError('STORE_LIFECYCLE_STALE_GENERATION');
    const chain=await state(tx,scope);
    const source=await readReconciliationSources(tx,scope,scanPeriod,sessionIds);
    const chosen=sessionIds.map(id=>source.sessions.get(id));
    if(chosen.some(s=>!s||s.session.status!=='CLOSED'||!s.session.openedAt||!s.session.closedAt||!Number.isFinite(new Date(s.session.openedAt).getTime())||!Number.isFinite(new Date(s.session.closedAt).getTime())||new Date(s.session.closedAt)<new Date(s.session.openedAt)))throw reconcileError('CASH_RECONCILIATION_SOURCE_CHANGED');
    chosen.sort((a,b)=>new Date(a.session.closedAt)-new Date(b.session.closedAt)||a.session.id.localeCompare(b.session.id));
    const days=chosen.map(s=>cashReportRowDay(s.session.closedAt)).sort();
    const displayPeriod={from:days[0],to:days.at(-1)};
    if(!days.every(d=>typeof d==='string')||(Date.parse(displayPeriod.to)-Date.parse(displayPeriod.from))/86400000>=32)throw reconcileError('CASH_RECONCILIATION_LIMIT');
    const ids=chosen.map(s=>s.session.id);
    const {report}=await materialize(tx,scope,scanPeriod,chain,ids,{ids,displayPeriod});
    return {report,head:chain.head,generation:scope.generation};
  }
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
        if(d.transactionId&&!transactionMatchesPaper(d.confirmedKind,t,d.confirmedAmountCents))throw reconcileError('CASH_RECONCILIATION_TRANSACTION_MISMATCH');
        proof={...proof,...p,sourceHash:s.sourceHash};
      }else if(d.kind==='OFFSET'){
        const a=source.sessions.get(d.previousSessionId),b=source.sessions.get(d.nextSessionId),ra=allRows.find(r=>r.sessionId===d.previousSessionId),rb=allRows.find(r=>r.sessionId===d.nextSessionId);
        if(![d.previousSessionId,d.nextSessionId].some(id=>source.selectedIds.includes(id))||!a||!b||!immediateCashPair(a,b,source.rule)||a.sourceHash!==d.previousHash||b.sourceHash!==d.nextHash)throw reconcileError('CASH_RECONCILIATION_PAIR_INVALID');
        if(active.some(r=>r.data.kind==='OFFSET'&&r.data.previousSessionId===d.previousSessionId&&r.data.nextSessionId===d.nextSessionId))throw reconcileError('CASH_RECONCILIATION_PAIR_ALREADY_REVIEWED');
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
  return {generation,read,apply,readSelectedInTransaction};
}
