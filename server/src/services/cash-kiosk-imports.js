import {createHash} from 'node:crypto';
import {z} from 'zod';
import {hash,periodSchema,reconcileError} from './cash-reconciliation-contract.js';
import {assertLifecycleMutation} from './store-lifecycle-generation.js';
import {parseKioskCashWorkbook,compareKioskCashWorkbooks,kioskXlsLimits} from './cash-kiosk-xls.js';

const ENTITY='CASH_KIOSK_IMPORT',TYPE='CASH_KIOSK_SOURCE',MAX_HISTORY=2000,MAX_BYTES=14*1024*1024;
const id=z.string().min(1).max(180),sha=z.string().regex(/^[a-f0-9]{64}$/),generation=z.string().regex(/^(0|[1-9][0-9]{0,18})$/);
const label=z.string().trim().min(1).max(180).refine(s=>!/[\u0000-\u001f\u007f]/.test(s));
const binding=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('EVENTS')}).strict(),
 z.object({kind:z.literal('JOURNAL'),kioskShiftId:label,kioskOperator:label}).strict()
]);
export const kioskImportRequest=z.object({requestId:z.string().uuid(),generation,period:periodSchema,fileName:label,contentData:z.string().min(12).max(Math.ceil(kioskXlsLimits.bytes/3)*4),binding,selectedStoreConfirmed:z.literal(true)}).strict();
export const kioskRevokeRequest=z.object({requestId:z.string().uuid(),generation,sourceId:id,reason:z.string().trim().min(10).max(500)}).strict();
const base={version:z.literal(1),generation,sequence:z.number().int().min(1).max(MAX_HISTORY),requestId:z.string().uuid(),requestHash:sha,actorName:label};
const metadata=z.discriminatedUnion('kind',[
 z.object({...base,kind:z.literal('IMPORT'),sourceId:id,attachmentId:id,checksum:sha,fileName:label,bytes:z.number().int().min(8).max(kioskXlsLimits.bytes),mimeType:z.enum(['application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),period:periodSchema,binding,documentHash:sha,parserStatus:z.enum(['AVAILABLE','LIMITED'])}).strict(),
 z.object({...base,kind:z.literal('REUSE'),targetId:id}).strict(),
 z.object({...base,kind:z.literal('REVOKE'),targetId:id,reason:z.string().min(10).max(500)}).strict()
]);
const key=scope=>hash([ENTITY,scope.companyId,scope.storeId,scope.generation]);
const rowId=(scope,requestId)=>'cash-kiosk:'+hash([key(scope),requestId]);
const attachmentId=(scope,checksum)=>'cash-kiosk-file:'+hash([key(scope),checksum]);
const byteHash=bytes=>createHash('sha256').update(bytes).digest('hex');
const auditAction=kind=>({IMPORT:'CASH_KIOSK_IMPORTED',REUSE:'CASH_KIOSK_REUSED',REVOKE:'CASH_KIOSK_REVOKED'})[kind];
const error=(code,status=409)=>reconcileError('CASH_KIOSK_'+code,status);
const overlaps=(a,b)=>a.from<=b.to&&b.from<=a.to;
const identity=d=>hash({checksum:d.checksum,period:d.period,binding:d.binding});
export function kioskImportState(rows,scope){
 if(!Array.isArray(rows)||rows.length>MAX_HISTORY)throw error('LIMIT');
 const parsed=rows.map(r=>({...r,detail:metadata.parse(r.detail)})).sort((a,b)=>a.detail.sequence-b.detail.sequence),active=new Map(),requests=new Map();
 for(let i=0;i<parsed.length;i++){
  const r=parsed[i],d=r.detail;
  if(r.companyId!==scope.companyId||r.storeId!==scope.storeId||r.entityType!==ENTITY||r.entityId!==key(scope)||d.generation!==scope.generation||d.sequence!==i+1||r.id!==rowId(scope,d.requestId)||requests.has(d.requestId)||r.action!==auditAction(d.kind))throw error('INVALID_HISTORY');
  if(d.kind==='IMPORT'){
   if(d.sourceId!==r.id||d.attachmentId!==attachmentId(scope,d.checksum)||[...active.values()].some(x=>x.detail.checksum===d.checksum))throw error('INVALID_HISTORY');
   active.set(r.id,r);
  }else{if(!active.has(d.targetId))throw error('INVALID_HISTORY');if(d.kind==='REVOKE')active.delete(d.targetId);}
  requests.set(d.requestId,r);
 }
 return {rows:parsed,active:[...active.values()],requests};
}
async function readState(tx,scope){
 const entityId=key(scope);
 const rows=await tx.$queryRaw`SELECT "id","companyId","storeId","entityType","entityId","action",("afterJson" - 'document') AS detail,"createdAt" FROM "WorkforceAuditLog" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "entityType"=${ENTITY} AND "entityId"=${entityId} ORDER BY "createdAt","id" LIMIT ${MAX_HISTORY+1}`;
 return kioskImportState(rows,scope);
}
const summary=r=>({id:r.id,sequence:r.detail.sequence,fileName:r.detail.fileName,checksum:r.detail.checksum,kind:r.detail.binding.kind,binding:r.detail.binding,period:r.detail.period,bytes:r.detail.bytes,status:r.detail.parserStatus,actorName:r.detail.actorName,createdAt:r.createdAt});
function decode(value){
 if(typeof value!=='string'||!value.length||value.length>Math.ceil(kioskXlsLimits.bytes/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw error('INVALID_FILE',400);
 const bytes=Buffer.from(value,'base64');if(bytes.length<8||bytes.length>kioskXlsLimits.bytes||bytes.toString('base64')!==value)throw error('INVALID_FILE',400);return bytes;
}
function within(document,period){
 return [...document.events.map(e=>e.when),...document.sales.map(s=>s.when)].every(w=>w?.wall&&w.wall.slice(0,10)>=period.from&&w.wall.slice(0,10)<=period.to);
}
let inFlight=0;
export function createKioskCashImports(db,{parse=parseKioskCashWorkbook}={}){
 async function list(scope,period){const state=await readState(db,scope);return {storeId:scope.storeId,generation:scope.generation,period,sources:state.active.filter(r=>overlaps(r.detail.period,period)).map(summary)};}
 async function lock(tx,scope,authorize){
  const stores=await tx.$queryRaw`SELECT s."id" FROM "Store" s JOIN "Company" c ON c."id"=s."companyId" WHERE s."id"=${scope.storeId} AND s."companyId"=${scope.companyId} AND s."active"=TRUE AND c."active"=TRUE FOR UPDATE OF s`;
  if(!stores.length)throw error('NOT_FOUND',404);
  await assertLifecycleMutation(tx,scope,scope.generation);await authorize(tx);
 }
 async function append(tx,scope,actor,state,request,detail,document){
  if(state.rows.length>=MAX_HISTORY)throw error('LIMIT');
  const id=rowId(scope,request.requestId),data={version:1,generation:scope.generation,sequence:state.rows.length+1,requestId:request.requestId,actorName:String(actor.fullName||actor.id).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,180),...detail,...(document?{document}:{})};
  await tx.$executeRaw`INSERT INTO "WorkforceAuditLog" ("id","companyId","storeId","actorUserId","action","entityType","entityId","afterJson","createdAt") VALUES (${id},${scope.companyId},${scope.storeId},${actor.id},${auditAction(detail.kind)},${ENTITY},${key(scope)},${JSON.stringify(data)}::jsonb,NOW())`;
  return id;
 }
 async function importFile(scope,actor,body,authorize){
  const request=kioskImportRequest.parse(body);if(request.generation!==scope.generation)throw error('STALE');
  const bytes=decode(request.contentData),checksum=byteHash(bytes),requestHash=hash({...request,contentData:undefined,checksum});
  if(inFlight>=2)throw error('BUSY',503);
  let document;inFlight++;
  try{document=await parse(bytes,{companyId:scope.companyId,storeId:scope.storeId,sourceId:request.requestId,...request.binding});}finally{inFlight--;}
  if(!['AVAILABLE','LIMITED'].includes(document?.status)||!document.events||!document.sales||!within(document,request.period)||JSON.stringify(document).length>750000)throw error('UNREADABLE',400);
  if(document.source?.checksum!==checksum||document.source.companyId!==scope.companyId||document.source.storeId!==scope.storeId)throw error('INVALID_FILE',400);
  const mimeType=bytes[0]===0x50?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/vnd.ms-excel';
  return db.$transaction(async tx=>{
   await lock(tx,scope,authorize);const state=await readState(tx,scope),prior=state.requests.get(request.requestId);
   if(prior){if(prior.detail.requestHash!==requestHash)throw error('REPLAY_CHANGED');return {storeId:scope.storeId,generation:scope.generation,reused:true,sourceId:prior.detail.kind==='REUSE'?prior.detail.targetId:prior.id};}
   const detail={kind:'IMPORT',checksum,period:request.period,binding:request.binding};
   const duplicate=state.active.find(r=>r.detail.checksum===checksum);
   if(duplicate){if(identity(duplicate.detail)!==identity(detail))throw error('BINDING_CONFLICT');await append(tx,scope,actor,state,request,{kind:'REUSE',targetId:duplicate.id,requestHash});return {storeId:scope.storeId,generation:scope.generation,reused:true,sourceId:duplicate.id};}
   // History is retained. Limits apply to overlapping source windows, not an
   // instruction to revoke old files merely to make today's analysis fit.
   const relevant=state.active.filter(r=>overlaps(r.detail.period,request.period));
   if(relevant.length>=kioskXlsLimits.files||relevant.reduce((n,r)=>n+r.detail.bytes,bytes.length)>MAX_BYTES)throw error('LIMIT');
   const fileId=attachmentId(scope,checksum),contentData=`data:${mimeType};base64,${request.contentData}`;
   const existing=await tx.$queryRaw`SELECT "companyId","storeId","documentType","checksum","contentData" FROM "DocumentAttachment" WHERE "id"=${fileId} LIMIT 1`;
   if(existing.length){const r=existing[0];if(r.companyId!==scope.companyId||r.storeId!==scope.storeId||r.documentType!==TYPE||r.checksum!==checksum||r.contentData!==contentData)throw error('SOURCE_CHANGED');}
   else await tx.$executeRaw`INSERT INTO "DocumentAttachment" ("id","companyId","storeId","documentType","filename","mimeType","storageKey","checksum","contentData") VALUES (${fileId},${scope.companyId},${scope.storeId},${TYPE},${request.fileName},${mimeType},${'DATABASE:'+checksum},${checksum},${contentData})`;
   const sourceId=rowId(scope,request.requestId);
   await append(tx,scope,actor,state,request,{...detail,sourceId,attachmentId:fileId,fileName:request.fileName,bytes:bytes.length,mimeType,documentHash:hash(document),parserStatus:document.status,requestHash},document);
   return {storeId:scope.storeId,generation:scope.generation,reused:false,sourceId};
  },{maxWait:5000,timeout:15000});
 }
 async function revoke(scope,actor,body,authorize){
  const request=kioskRevokeRequest.parse(body),requestHash=hash(request);
  if(request.generation!==scope.generation)throw error('STALE');
  return db.$transaction(async tx=>{
   await lock(tx,scope,authorize);const state=await readState(tx,scope),prior=state.requests.get(request.requestId);
   if(prior){if(prior.detail.requestHash!==requestHash)throw error('REPLAY_CHANGED');return {storeId:scope.storeId,generation:scope.generation,reused:true};}
   if(!state.active.some(r=>r.id===request.sourceId))throw error('NOT_FOUND',404);
   await append(tx,scope,actor,state,request,{kind:'REVOKE',targetId:request.sourceId,reason:request.reason,requestHash});
   return {storeId:scope.storeId,generation:scope.generation,reused:false};
  },{maxWait:5000,timeout:15000});
 }
 return {list,importFile,revoke};
}

const unavailable=(reason,period)=>({status:'UNAVAILABLE',findings:[],financialAdjustmentCents:0,evidenceHash:hash([reason,period]),sourceChecksums:[],coverage:{eventCount:0,saleCount:0,eventQuantityAvailable:false,externalOnly:true,missingJournalShiftIds:[],unverifiedEventOverlapCount:0,sourceUnavailable:true}});
export async function readKioskCashEvidence(tx,scope,period){
 try{
  const state=await readState(tx,scope),active=state.active.filter(r=>overlaps(r.detail.period,period));
  if(!active.length)return null;
  if(active.length>kioskXlsLimits.files||active.reduce((n,r)=>n+r.detail.bytes,0)>MAX_BYTES)return unavailable('SOURCE_LIMIT',period);
  const documents=[];
  for(const entry of active){
   const d=entry.detail;
   const rows=await tx.$queryRaw`SELECT w."afterJson"->'document' AS document,a."companyId",a."storeId",a."documentType",a."checksum",a."contentData" FROM "WorkforceAuditLog" w JOIN "DocumentAttachment" a ON a."id"=${d.attachmentId} AND a."companyId"=w."companyId" AND a."storeId"=w."storeId" WHERE w."id"=${entry.id} AND w."companyId"=${scope.companyId} AND w."storeId"=${scope.storeId} AND w."entityType"=${ENTITY} AND w."entityId"=${key(scope)} LIMIT 1`;
   const r=rows[0],prefix=`data:${d.mimeType};base64,`;
   if(rows.length!==1||r.companyId!==scope.companyId||r.storeId!==scope.storeId||r.documentType!==TYPE||r.checksum!==d.checksum||typeof r.contentData!=='string'||!r.contentData.startsWith(prefix))return unavailable('SOURCE_CHANGED',period);
   const bytes=decode(r.contentData.slice(prefix.length)),doc=r.document;
   if(bytes.length!==d.bytes||byteHash(bytes)!==d.checksum||!doc||hash(doc)!==d.documentHash||doc.source?.checksum!==d.checksum||doc.source.companyId!==scope.companyId||doc.source.storeId!==scope.storeId||doc.source.sourceId!==d.requestId||doc.source.kind!==d.binding.kind||!Array.isArray(doc.sales)||!Array.isArray(doc.events))return unavailable('SOURCE_CHANGED',period);
   if(d.binding.kind==='JOURNAL'&&(String(doc.source.kioskShiftId)!==d.binding.kioskShiftId||String(doc.source.kioskOperator)!==d.binding.kioskOperator))return unavailable('SOURCE_CHANGED',period);
   documents.push({...doc,events:doc.events.filter(e=>e.when?.wall?.slice(0,10)>=period.from&&e.when.wall.slice(0,10)<=period.to),sales:doc.sales.filter(s=>s.when?.wall?.slice(0,10)>=period.from&&s.when.wall.slice(0,10)<=period.to)});
  }
  const result=compareKioskCashWorkbooks({scope,documents});
  if(!result.findings)return unavailable(result.reason,period);
  return {...result,evidenceHash:hash({period,sources:active.map(r=>({id:r.id,checksum:r.detail.checksum,documentHash:r.detail.documentHash})).sort((a,b)=>a.id.localeCompare(b.id))}),coverage:{...result.coverage,sourceUnavailable:false}};
 }catch{return unavailable('SOURCE_UNAVAILABLE',period);}
}
