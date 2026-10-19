import {z} from 'zod';
import {businessDomains} from '../../../shared/assistant-business.mjs';
import {normalizeLifecycleGeneration} from './store-lifecycle-generation.js';

export const HISTORY_TTL_MS=30*24*60*60*1000;
export const HISTORY_MAX_BYTES=128*1024;
const id=z.string().min(1).max(160).refine(v=>v.trim()===v,'Noncanonical archive identity');
const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1);
// Match the existing exact int64 protocol; Number would merge adjacent epochs.
const generation=z.string().refine(value=>{try{return normalizeLifecycleGeneration(value)!==null}catch{return false}},'Invalid lifecycle generation');
const capabilityNames=['cash_details','sales_by_product','sales_by_store','stock_by_product','consumption_details',...Object.keys(businessDomains).map(domain=>'business_records:'+domain)];
const capabilities=z.array(z.enum(capabilityNames)).max(capabilityNames.length).transform(v=>[...new Set(v)].sort());
export const historyAccessSchema=z.object({userId:id,mode:z.enum(['owner','platform']),companyId:id,storeId:id,generation,sessionId:id,sessionVersion:count,capabilities}).strict();
const message=z.object({id:z.string().uuid(),role:z.enum(['user','assistant']),content:z.string().trim().min(1).max(2000),createdAt:z.string().datetime({offset:true}).transform(v=>new Date(v).toISOString()),requiredCapabilities:capabilities}).strict().superRefine((m,c)=>{
 if(m.role==='user'&&(m.content.length>600||m.requiredCapabilities.length))c.addIssue({code:'custom',message:'Invalid archived question'});
});
const unique=(values,c)=>{if(new Set(values).size!==values.length)c.addIssue({code:'custom',message:'Duplicate archive identity'});};
const thread=z.object({id:z.string().uuid(),title:z.string().trim().min(1).max(120),messages:z.array(message).max(40)}).strict().superRefine((t,c)=>{
 unique(t.messages.map(m=>m.id),c);
 if(t.messages.some((m,i)=>i&&m.createdAt<t.messages[i-1].createdAt))c.addIssue({code:'custom',message:'Unordered archive messages'});
});
export const historyArchiveSchema=z.object({schemaVersion:z.literal(1),threads:z.array(thread).max(8)}).strict().superRefine((a,c)=>unique(a.threads.map(t=>t.id),c));
export const historyMutationSchema=z.object({requestId:z.string().uuid(),expectedRevision:count,archive:historyArchiveSchema}).strict();
export function parseHistoryArchive(value){
 const archive=historyArchiveSchema.parse(value);
 if(Buffer.byteLength(JSON.stringify(archive),'utf8')>HISTORY_MAX_BYTES)throw Object.assign(new Error('Το ιστορικό υπερβαίνει το επιτρεπόμενο μέγεθος.'),{status:413,code:'ASSISTANT_HISTORY_TOO_LARGE'});
 return archive;
}
export const emptyHistoryArchive=()=>({schemaVersion:1,threads:[]});
// Scope and capability requirements must come from a trusted server adapter.
// These helpers are not authentication and must never accept browser authority.
export const historyScopeKey=access=>{const a=historyAccessSchema.parse(access);return JSON.stringify(['assistant-history-v1',a.userId,a.mode,a.companyId,a.storeId,a.generation]);};
export const historyAccessKey=access=>JSON.stringify(historyAccessSchema.parse(access));
export function assertHistoryCapabilities(archive,access){
 const allowed=new Set(historyAccessSchema.parse(access).capabilities);
 if(archive.threads.some(t=>t.messages.some(m=>m.requiredCapabilities.some(c=>!allowed.has(c)))))throw Object.assign(new Error('Το ιστορικό δεν είναι διαθέσιμο με την τρέχουσα πρόσβαση.'),{status:403,code:'ASSISTANT_HISTORY_ACCESS_DENIED'});
}
