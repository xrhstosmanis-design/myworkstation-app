import {readLifecycleGeneration,assertLifecycleMutation} from './store-lifecycle-generation.js';
const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
const fail=()=>{throw Object.assign(new Error('Automatic report lock boundary is unavailable.'),{status:409,code:'REPORT_DISPATCH_BUSY'})};
// Catalog queries deliberately precede target-relation reads. Store's table
// SHARE excludes the current atomic trigger installer even when Fence does not
// exist yet. ROW EXCLUSIVE on all six report tables excludes a partial installer
// holding their DDL locks before it reaches Store; NOWAIT releases the cycle.
export async function lockAutomaticReportBoundary(tx,scope){
 const d=scope&&typeof scope==='object'?Object.getOwnPropertyDescriptors(scope):{};
 for(const key of ['companyId','storeId'])if(!d[key]?.enumerable||!Object.hasOwn(d[key],'value')||typeof d[key].value!=='string'||!d[key].value.trim()||/[\u0000-\u001f\u007f]/.test(d[key].value))fail();
 if(Object.hasOwn(d,'expectedGeneration')&&(!d.expectedGeneration.enumerable||!Object.hasOwn(d.expectedGeneration,'value')))fail();
 const selected={companyId:d.companyId.value,storeId:d.storeId.value};
 const [meta]=await tx.$queryRawUnsafe('SELECT current_schema() AS schema');if(!meta?.schema)fail();
 const schema=quote(meta.schema);
 try{
  await tx.$executeRawUnsafe(`LOCK TABLE ${schema}."Store" IN SHARE MODE NOWAIT`);
  const [fence]=await tx.$queryRawUnsafe(`SELECT to_regclass(format('%I.%I',current_schema(),'StoreLifecycleFence'))::text AS fence`);
  if(fence?.fence)await tx.$executeRawUnsafe(`LOCK TABLE ${schema}."StoreLifecycleFence" IN SHARE MODE NOWAIT`);
  await tx.$executeRawUnsafe(`LOCK TABLE ${schema}."AutomaticReportDispatchPolicy", ${schema}."AutomaticReportAutomationGrant", ${schema}."AutomaticReportRecipient", ${schema}."AutomaticReportRecipientConsent", ${schema}."AutomaticReportPayload", ${schema}."AutomaticReportDeliverySlot" IN ROW EXCLUSIVE MODE NOWAIT`);
  // A missing/replaced table errors above; it must never become a legacy bypass.
  const state=await readLifecycleGeneration(tx,selected);
  const generation=Object.hasOwn(d,'expectedGeneration')?(d.expectedGeneration.value??'0'):state.generation;
  return await assertLifecycleMutation(tx,selected,generation,{lock:true});
 }catch(error){if(error?.code==='55P03'||error?.meta?.code==='55P03'||error?.code==='42P01'||error?.meta?.code==='42P01')fail();throw error}
}
