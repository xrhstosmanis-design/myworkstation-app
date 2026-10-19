// Purpose-bound history transport. No save endpoint accepts browser answers.
import {z} from 'zod';
import {prisma} from '../prisma.js';
import {readLifecycleGeneration} from './store-lifecycle-generation.js';
import {readHistoryRetentionReady} from './assistant-history-readiness.js';
import {createAssistantHistoryAccess} from './assistant-history-access.js';
import {createAssistantHistoryTurns,assistantHistoryTurnMetadata} from './assistant-history-turns.js';
const pair=z.object({companyId:z.string().min(1).max(160),storeId:z.string().min(1).max(160)}).strict();
export function createNativeAssistantHistory({db=prisma,mode,enabled=()=>process.env.ASSISTANT_HISTORY_ENABLED==='true',ready=()=>readHistoryRetentionReady(db)}){
 const authorize=createAssistantHistoryAccess({db,mode,selection:req=>req.body?.selection||(req.query?.companyId&&req.query?.storeId?{companyId:req.query.companyId,storeId:req.query.storeId}:null)});
 const turns=createAssistantHistoryTurns({db,authorize});
 const gate=async req=>{await authorize(req);if(!enabled())throw Object.assign(new Error('Το αποθηκευμένο ιστορικό δεν έχει ενεργοποιηθεί ακόμη.'),{status:503,code:'ASSISTANT_HISTORY_DISABLED'});if(!await ready())throw Object.assign(new Error('Ο έλεγχος διατήρησης ιστορικού δεν είναι διαθέσιμος.'),{status:503,code:'ASSISTANT_HISTORY_UNAVAILABLE'})};
 return {
  // Caller passes the already natively authorized status scope, never browser IDs.
  async status(req,authorizedScope){
   if(!enabled()||!authorizedScope||req.query?.readScope&&req.query.readScope!=='selected_store')return {};
   const state=await readLifecycleGeneration(db,authorizedScope);
   if(state.maintenance||state.retired)throw Object.assign(new Error('Το κατάστημα βρίσκεται σε συντήρηση.'),{status:409,code:'STORE_LIFECYCLE_MAINTENANCE'});
   return {historyGeneration:state.generation};
  },
  async load(req){await gate(req);return turns.load(req)},
  async reset(req,input){await gate(req);return turns.reset(req,input)},
  async begin(req,input,question){await gate(req);return turns.begin(req,input,question)}
 };
}
export function createAssistantHistoryHttp({turns,mode}){
 const loadQuery=mode==='platform'?pair:z.object({}).strict();
 const resetBody=assistantHistoryTurnMetadata.omit({threadId:true}).extend(mode==='platform'?{selection:pair}:{}).strict();
 const unavailable=(error,res,next)=>{
  if(error.code==='ASSISTANT_HISTORY_CANCELLED')return;
  if(error.code==='ASSISTANT_HISTORY_DISABLED')return res.json({available:false,code:'ASSISTANT_HISTORY_DISABLED'});
  if(error.status===401||error.status===403||String(error.code||'').startsWith('STORE_LIFECYCLE_')||error instanceof z.ZodError)return next(error);
  return res.status(503).json({available:false,code:'ASSISTANT_HISTORY_UNAVAILABLE',error:'Το αποθηκευμένο ιστορικό δεν είναι διαθέσιμο. Οι νέες ερωτήσεις παραμένουν διαθέσιμες χωρίς αποθήκευση.'});
 };
 return {
  async load(req,res,next){try{loadQuery.parse(req.query||{});const snapshot=await turns.load(req);res.json({available:true,...snapshot,retentionDays:30})}catch(error){unavailable(error,res,next)}},
  async reset(req,res,next){try{const {selection,...input}=resetBody.parse(req.body||{});const snapshot=await turns.reset(req,input);res.json({available:true,...snapshot,retentionDays:30})}catch(error){unavailable(error,res,next)}}
 };
}
