import {readPlatformAssistantContext} from "../platform/platform-assistant-context.mjs";
import {readBackofficeContext} from "../../utils/backofficeSessionBoundary.mjs";
// Project server archives onto text-only messages. Never restore result/tickets/files.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function restoreAssistantHistory(snapshot){
 if(typeof snapshot?.generation!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(snapshot.generation)||BigInt(snapshot.generation)>9223372036854775807n||snapshot?.available!==true||snapshot.historical!==true||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<0||typeof snapshot.expired!=='boolean'||snapshot.archive?.schemaVersion!==1||!Array.isArray(snapshot.archive.threads)||snapshot.archive.threads.length>8)throw new Error('Μη έγκυρο αποθηκευμένο ιστορικό.');
 if(snapshot.expired&&snapshot.archive.threads.length)throw new Error("Το ιστορικό έχει λήξει.");
 const ids=new Set();
 return snapshot.archive.threads.map(thread=>{
  if(!uuid.test(thread.id)||ids.has(thread.id)||typeof thread.title!=='string'||!thread.title.trim()||thread.title.length>120||!Array.isArray(thread.messages)||thread.messages.length>40)throw new Error('Μη έγκυρη αποθηκευμένη συνομιλία.');ids.add(thread.id);
  let previous='';const messages=new Set();
  return {id:thread.id,title:thread.title,files:[],messages:thread.messages.map(m=>{
   const time=new Date(m.createdAt);if(!uuid.test(m.id)||messages.has(m.id)||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim()||m.content.length>(m.role==='user'?600:2000)||!Number.isFinite(time.getTime()))throw new Error('Μη έγκυρο αποθηκευμένο μήνυμα.');messages.add(m.id);
   const value=time.toISOString();if(value<previous)throw new Error('Μη έγκυρη σειρά ιστορικού.');previous=value;
   return {id:m.id,role:m.role,content:m.content,time:value,historical:true};
  })};
 });
}

// Reuse the issued native context selector, then enforce its boundary across
// the new history GET without expanding generic Platform request allowlists.
export async function requestAssistantHistory(api,path,options,{mode,storage,sessions}){
 const platform=mode==='platform';
 const method=options?.method||'GET',load=method==='GET'&&(platform?/^\/api\/platform\/ai-command-center\/history\?[^#]+$/:/^\/api\/owner-assistant\/stores\/[^/?#]+\/history$/).test(path),reset=method==='POST'&&(platform?path==='/api/platform/ai-command-center/history/reset':/^\/api\/owner-assistant\/stores\/[^/?#]+\/history\/reset$/.test(path));
 if(!load&&!reset)throw new Error('Μη επιτρεπόμενη αίτηση ιστορικού.');
 const read=()=>platform?readPlatformAssistantContext(storage,sessions):readBackofficeContext(storage),before=read();
 const verify=()=>{let current;try{current=read()}catch{throw historyContextChanged()}if(current.key!==before.key)throw historyContextChanged()};
 let result;try{result=await api(path,{...options,...(platform?{headers:{...options?.headers,Authorization:`Bearer ${before.token}`}}:{})})}catch(error){verify();throw error}
 verify();return result;
}
const historyContextChanged=()=>Object.assign(new Error('Η συνεδρία άλλαξε. Το προηγούμενο ιστορικό απορρίφθηκε.'),{code:'ASSISTANT_HISTORY_CLIENT_CONTEXT_CHANGED'});
