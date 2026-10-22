import {z} from 'zod';
import {reportRecipientListSchema,normalizeReportRecipients} from './report-recipients.js';
import {lockAutomaticReportBoundary} from './automatic-report-lock-boundary.js';
import {assertLifecycleMutation} from './store-lifecycle-generation.js';
import {lifecycleContext} from './store-lifecycle-context.js';
import {invalidateStoreDispatchRecipients} from './automatic-report-recipients.js';

export const storeMetadataSchema=z.object({name:z.string().trim().min(2).max(160),city:z.string().trim().max(100).optional().or(z.literal('')),address:z.string().trim().max(220).optional(),responsibleEmail:reportRecipientListSchema.optional(),cashCloseEmailEnabled:z.boolean().default(true)});
const tables=['AutomaticReportDispatchPolicy','AutomaticReportAutomationGrant','AutomaticReportRecipient','AutomaticReportRecipientConsent','AutomaticReportPayload','AutomaticReportDeliverySlot'];
const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code})};
const emails=value=>normalizeReportRecipients(value).sort();
export function saveStoreMetadata(db,scope,input){
 const detach=value=>{if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new TypeError('Plain metadata required');const result={};for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||['__proto__','constructor','prototype'].includes(key)||!d.enumerable||!Object.hasOwn(d,'value')||(d.value!==undefined&&typeof d.value!=='string'&&typeof d.value!=='boolean'))throw new TypeError('Scalar metadata required');result[key]=d.value}return result};
 const body=storeMetadataSchema.parse(detach(input||{})),fields=detach(scope),captured={companyId:fields.companyId,storeId:fields.storeId,actorId:fields.actorId};
 if(![captured.companyId,captured.storeId,captured.actorId].every(v=>typeof v==='string'&&v.trim()&&!v.includes('\0')))fail(400,'STORE_METADATA_SCOPE_INVALID','Απαιτείται συγκεκριμένο κατάστημα, εταιρεία και χρήστης.');
 const generation=lifecycleContext()[captured.storeId];
 return db.$transaction(async tx=>{
  // Inspect every time, including dispatch OFF. All six are provisioned together;
  // a partial deployment must never silently permit an unrevoked email change.
  const presence=await tx.$queryRaw`SELECT name, to_regclass(format('%I.%I',current_schema(),name))::text AS relation FROM unnest(${tables}::text[]) AS name`;
  if(presence.length!==tables.length||presence.some(row=>!tables.includes(row.name)||(row.relation!==null&&(typeof row.relation!=='string'||!row.relation)))||new Set(presence.map(row=>row.name)).size!==tables.length)fail(409,'REPORT_RECIPIENT_STORAGE_UNAVAILABLE','Δεν είναι διαθέσιμος ο έλεγχος παραληπτών.');
  const count=presence.filter(row=>row.relation!==null).length;
  if(count!==0&&count!==tables.length)fail(409,'REPORT_RECIPIENT_STORAGE_UNAVAILABLE','Απαιτείται πλήρης εγκατάσταση του ελέγχου παραληπτών.');
  if(count===tables.length){
   await lockAutomaticReportBoundary(tx,{companyId:captured.companyId,storeId:captured.storeId,expectedGeneration:generation});
   // A Store UPDATE needs ROW EXCLUSIVE. Refuse its table-lock upgrade NOWAIT
   // before taking separate Store rows; two writers must not deadlock upgrading.
   const [meta]=await tx.$queryRawUnsafe('SELECT current_schema() AS schema');
   if(typeof meta?.schema!=='string'||!meta.schema)fail(409,'STORE_METADATA_BUSY','Δεν είναι διαθέσιμο το κατάστημα.');
   const schema='"'+meta.schema.replaceAll('"','""')+'"';
   try{await tx.$executeRawUnsafe(`LOCK TABLE ${schema}."Store" IN ROW EXCLUSIVE MODE NOWAIT`)}
   catch(error){if(error?.code==='55P03'||error?.meta?.code==='55P03'||error?.code==='42P01'||error?.meta?.code==='42P01')fail(409,'STORE_METADATA_BUSY','Το κατάστημα χρησιμοποιείται από άλλη εργασία.');throw error}
  }
  else await assertLifecycleMutation(tx,{companyId:captured.companyId,storeId:captured.storeId},generation,{lock:true});
  let store;
  try{[store]=await tx.$queryRaw`SELECT "id","companyId","name","responsibleEmail" FROM "Store" WHERE "id"=${captured.storeId} AND "companyId"=${captured.companyId} FOR NO KEY UPDATE NOWAIT`}
  catch(error){if(error?.code==='55P03'||error?.meta?.code==='55P03')fail(409,'STORE_METADATA_BUSY','Το κατάστημα χρησιμοποιείται από άλλη εργασία.');throw error}
  if(!store)fail(404,'STORE_METADATA_STORE_NOT_FOUND','Δεν βρέθηκε το κατάστημα στον συγκεκριμένο πελάτη.');
  const beforeEmails=emails(store.responsibleEmail),afterEmails=body.responsibleEmail===undefined?beforeEmails:emails(body.responsibleEmail);
  if(count===tables.length&&JSON.stringify(beforeEmails)!==JSON.stringify(afterEmails))await invalidateStoreDispatchRecipients(tx,captured,{beforeEmails,afterEmails,now:new Date()});
  return tx.store.update({where:{id:store.id},select:{id:true,name:true,city:true,address:true,responsibleEmail:true,cashCloseEmailEnabled:true,companyId:true},data:{name:body.name,city:body.city||null,...(body.address!==undefined?{address:body.address||null}:{}),...(body.responsibleEmail!==undefined?{responsibleEmail:body.responsibleEmail||null}:{}),cashCloseEmailEnabled:body.cashCloseEmailEnabled}});
 });
}
