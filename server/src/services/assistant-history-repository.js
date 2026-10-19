import {createHash} from 'node:crypto';
import {z} from 'zod';
import {HISTORY_TTL_MS,historyAccessSchema,historyMutationSchema,parseHistoryArchive,emptyHistoryArchive,historyScopeKey,historyAccessKey,assertHistoryCapabilities} from './assistant-history-contract.js';

const conflict=()=>Object.assign(new Error('Το ιστορικό άλλαξε. Φόρτωσέ το ξανά πριν αποθηκεύσεις.'),{status:409,code:'ASSISTANT_HISTORY_CONFLICT'});
const expired=()=>Object.assign(new Error('Το παλιό ιστορικό έληξε. Ξεκίνα νέο αρχείο ιστορικού.'),{status:410,code:'ASSISTANT_HISTORY_EXPIRED'});
const denied=()=>Object.assign(new Error('Η πρόσβαση στο ιστορικό άλλαξε.'),{status:403,code:'ASSISTANT_HISTORY_CONTEXT_CHANGED'});
const revisionValue=z.union([z.number().int().positive().max(Number.MAX_SAFE_INTEGER-1),z.bigint().positive().max(BigInt(Number.MAX_SAFE_INTEGER-1))]).transform(Number);
const changedRows=z.array(z.object({revision:revisionValue}).strict()).length(1);
const rowSchema=z.object({revision:revisionValue,payload:z.unknown(),requestId:z.string().uuid(),digest:z.string().regex(/^[a-f0-9]{64}$/),expiresAt:z.coerce.date()}).strict();
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Unmounted foundation. The subsequent integration must provision the table,
// supply fresh native authorization and derive capability requirements server-side.
// There is intentionally no default DB, request-time DDL, route or browser cache.
export function createAssistantHistoryRepository({db,authorize,now=()=>new Date()}){
 if(typeof db?.$transaction!=='function'||typeof authorize!=='function')throw new TypeError('Explicit history storage and native authorization are required');
 const access=async req=>historyAccessSchema.parse(await authorize(req));
 const recheck=async(req,captured)=>{if(historyAccessKey(await access(req))!==historyAccessKey(captured))throw denied();};
 const clock=()=>{const value=new Date(now());if(!Number.isFinite(value.getTime()))throw new TypeError('Invalid history clock');return value;};
 const select=async(tx,key)=>{
  const rows=await tx.$queryRaw`SELECT "revision","payload","requestId","digest","expiresAt" FROM "AssistantHistoryArchive" WHERE "scopeKey"=${key} FOR UPDATE`;
  if(!Array.isArray(rows)||rows.length>1)throw new Error('Invalid history storage response');
  return rows.length?rowSchema.parse(rows[0]):null;
 };
 const snapshot=(row,time,a)=>{
  if(!row||row.expiresAt<=time)return {revision:row?.revision||0,archive:emptyHistoryArchive(),historical:true,expired:Boolean(row)};
  const archive=parseHistoryArchive(row.payload);assertHistoryCapabilities(archive,a);
  return {revision:row.revision,archive,historical:true,expired:false,expiresAt:row.expiresAt.toISOString()};
 };
 const transaction=async(req,fn)=>{
  const a=await access(req),key=historyScopeKey(a);
  const result=await db.$transaction(async tx=>{
   // Serialize absent-row creation and updates for exactly this actor/scope.
   await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${key},0))`;
   await recheck(req,a);
   const row=await select(tx,key);await recheck(req,a);
   const result=await fn({tx,a,key,row,time:clock()});
   await recheck(req,a);
   if(result.expiresAt&&new Date(result.expiresAt)<=clock())throw expired();
   return result;
  });
  // Native transaction commit itself is an await boundary too.
  await recheck(req,a);
  if(result.expiresAt&&new Date(result.expiresAt)<=clock())throw expired();
  return result;
 };
 const mutate=async(req,input,reset)=>{
  const checked=historyMutationSchema.parse(input),archive=parseHistoryArchive(checked.archive);
  if(reset&&archive.threads.length)throw new TypeError('Reset must begin with an empty archive');
  // Include the expected revision: the same UUID cannot mean a different write.
  const hash=digest({reset,...checked,archive});
  return transaction(req,async({tx,a,key,row,time})=>{
   assertHistoryCapabilities(archive,a);
   if(row&&row.expiresAt<=time&&!reset)throw expired();
   if(row?.requestId===checked.requestId){if(row.digest!==hash)throw conflict();return snapshot(row,time,a);}
   if((row?.revision||0)!==checked.expectedRevision)throw conflict();
   const revision=(row?.revision||0)+1;
   if(!Number.isSafeInteger(revision)||revision>=Number.MAX_SAFE_INTEGER)throw conflict();
   const expiresAt=reset||!row?new Date(time.getTime()+HISTORY_TTL_MS):row.expiresAt;
   const payload=JSON.stringify(archive);
   if(row){
    const rows=await tx.$queryRaw`UPDATE "AssistantHistoryArchive" SET "revision"=${revision},"payload"=${payload}::jsonb,"requestId"=${checked.requestId},"digest"=${hash},"expiresAt"=${expiresAt} WHERE "scopeKey"=${key} AND "revision"=${row.revision} RETURNING "revision"`;
    if(!changedRows.safeParse(rows).success||changedRows.parse(rows)[0].revision!==revision)throw conflict();
   }else{
    const rows=await tx.$queryRaw`INSERT INTO "AssistantHistoryArchive" ("scopeKey","revision","payload","requestId","digest","expiresAt") VALUES (${key},${revision},${payload}::jsonb,${checked.requestId},${hash},${expiresAt}) ON CONFLICT ("scopeKey") DO NOTHING RETURNING "revision"`;
    if(!changedRows.safeParse(rows).success||changedRows.parse(rows)[0].revision!==revision)throw conflict();
   }
   return snapshot({revision,payload:archive,requestId:checked.requestId,digest:hash,expiresAt},time,a);
  });
 };
 return {
  read:req=>transaction(req,async({row,time,a})=>snapshot(row,time,a)),
  save:(req,input)=>mutate(req,input,false),
  reset:(req,input)=>mutate(req,input,true)
 };
}
