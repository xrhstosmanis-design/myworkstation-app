// Server-only turn capture. No route, provider call or browser-supplied answer.
import {randomUUID} from 'node:crypto';
// This existing presenter is pure ESM (no DOM/React); the native Node monorepo
// includes it. Reuse its canonical evidence text without changing its owners.
import {presentAssistantAnswer} from '../../../client/src/components/voice/presentAssistantAnswer.js';
import {z} from 'zod';
import {createAssistantHistoryRepository} from './assistant-history-repository.js';
import {emptyHistoryArchive,historyAccessKey,historyAccessSchema,parseHistoryArchive} from './assistant-history-contract.js';
import {parseAssistantSourceRead} from './assistant-source-read.js';
export const assistantHistoryTurnMetadata=z.object({generation:historyAccessSchema.shape.generation,threadId:z.string().uuid(),requestId:z.string().uuid(),expectedRevision:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1)}).strict();
const changed=()=>{throw Object.assign(new Error('Η πρόσβαση ή η κατάσταση του καταστήματος άλλαξε.'),{status:403,code:'ASSISTANT_HISTORY_CONTEXT_CHANGED'})};
const athensDay=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const stale=()=>{throw Object.assign(new Error('Το ιστορικό ανήκει σε προηγούμενη κατάσταση καταστήματος.'),{status:409,code:'STORE_LIFECYCLE_STALE_GENERATION'})};
const conflict=()=>{throw Object.assign(new Error('Το ιστορικό άλλαξε. Φόρτωσέ το ξανά πριν συνεχίσεις.'),{status:409,code:'ASSISTANT_HISTORY_CONFLICT'})};
const projection=z.object({answer:z.string(),highlights:z.array(z.string()).optional().default([]),limitations:z.string().optional().default('')});
export function historyRequirementsFromReads(reads){
 if(!Array.isArray(reads)||reads.length>20)throw new TypeError('Actual bounded server read log required');
 return [...new Set(reads.map(value=>{const r=parseAssistantSourceRead(value);return r.name==='business_records'?r.name+':'+r.args.domain:r.name}))].sort();
}
export function createAssistantHistoryTurns({db,authorize,now=()=>new Date(),repository=createAssistantHistoryRepository}){
 if(typeof authorize!=='function'||typeof repository!=='function')throw new TypeError('Explicit history turn dependencies required');
 const clock=()=>{const t=new Date(now());if(!Number.isFinite(t.getTime()))throw new TypeError('Invalid history turn clock');return t.toISOString()};
 const bound=async req=>{
  const connected=()=>{if(req.aborted||req.res?.destroyed||req.socket?.destroyed)throw Object.assign(new Error('Η αίτηση ιστορικού διακόπηκε.'),{status:499,code:'ASSISTANT_HISTORY_CANCELLED'})};
  connected();const access=await authorize(req),identity=historyAccessKey(access);connected();
  const verify=async(_req=req,tx)=>{connected();const current=await authorize(req,tx);connected();if(historyAccessKey(current)!==identity)changed();return current};
  const repo=repository({db,authorize:verify,now});return {repo,verify,access};
 };
 return {
  async load(req){const {repo,access}=await bound(req);return {...await repo.read(req),generation:access.generation}},
  async reset(req,input){const metadata=assistantHistoryTurnMetadata.omit({threadId:true}).parse(input);const {repo,access}=await bound(req);if(metadata.generation!==access.generation)stale();const {generation,...mutation}=metadata;return {...await repo.reset(req,{...mutation,archive:emptyHistoryArchive()}),generation:access.generation}},
  async begin(req,input,question){
   const metadata=assistantHistoryTurnMetadata.parse(input),text=z.string().trim().min(3).max(600).parse(question),{repo,verify,access}=await bound(req);
   if(metadata.generation!==access.generation)stale();
   const stored=await repo.read(req);await verify();
   if(stored.expired)throw Object.assign(new Error('Το ιστορικό έληξε. Ξεκίνα νέο αρχείο ιστορικού.'),{status:410,code:'ASSISTANT_HISTORY_EXPIRED'});
   if(stored.revision!==metadata.expectedRevision)conflict();
   const archive=parseHistoryArchive(stored.archive),thread=archive.threads.find(t=>t.id===metadata.threadId),createdAt=clock();let finished=false;
   return {
    // Fresh sources remain mandatory. This is dialogue context, not evidence.
    history:(thread?.messages||[]).filter(m=>athensDay(m.createdAt)===athensDay(createdAt)).slice(-10).map(m=>({role:m.role,content:m.content})),
    async finish(checkedAnswer,actualReads){
     if(finished)throw new TypeError('A checked turn can only be captured once');finished=true;await verify();
     const checked=projection.parse(checkedAnswer),answer=projection.parse(presentAssistantAnswer({...checkedAnswer,...checked})),content=[answer.answer,...answer.highlights,answer.limitations].filter(Boolean).join('\n').trim();
     // Refuse an oversized projection; never silently truncate financial prose.
     if(!content||content.length>2000)return {saved:false,reason:'TEXT_LIMIT'};
     const requiredCapabilities=historyRequirementsFromReads(actualReads),messages=[...(thread?.messages||[]).slice(-38),{id:randomUUID(),role:'user',content:text,createdAt,requiredCapabilities:[]},{id:randomUUID(),role:'assistant',content,createdAt:clock(),requiredCapabilities}];
     let next;try{next=parseHistoryArchive({schemaVersion:1,threads:[{id:metadata.threadId,title:thread?.title||text.slice(0,120),messages},...archive.threads.filter(t=>t.id!==metadata.threadId)].slice(0,8)})}catch(error){await verify();if(error.code==='ASSISTANT_HISTORY_TOO_LARGE')return {saved:false,reason:'ARCHIVE_LIMIT'};throw error}
     try{
      const saved=await repo.save(req,{requestId:metadata.requestId,expectedRevision:metadata.expectedRevision,archive:next});await verify();
      return {saved:true,revision:saved.revision,expiresAt:saved.expiresAt};
     }catch(error){
      // A conflict cannot trigger another provider/report/export request.
      await verify();if(error.code==='ASSISTANT_HISTORY_CONFLICT')return {saved:false,reason:'CONFLICT'};
      if(error.status===401||error.status===403||String(error.code||'').startsWith('STORE_LIFECYCLE_')||error.code==='ASSISTANT_HISTORY_CONTEXT_CHANGED')throw error;
      return {saved:false,reason:'UNAVAILABLE'};
     }
    }
   };
  }
 };
}
