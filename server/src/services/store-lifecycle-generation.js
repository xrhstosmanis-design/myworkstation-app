// No enrollment or schema creation. Call only after authenticating the selected store.
const fail=(code,message)=>{throw Object.assign(new Error(message),{status:409,code})};
export function normalizeLifecycleGeneration(value){
 if(value===undefined||value===null)return null;
 if(typeof value!=='string'||! /^(0|[1-9][0-9]{0,18})$/.test(value)||BigInt(value)>9223372036854775807n)fail('STORE_LIFECYCLE_GENERATION_INVALID','Μη έγκυρη έκδοση καταστήματος.');
 return value;
}
const q=value=>'"'+String(value).replaceAll('"','""')+'"';
// Preserve the existing receiving service's key across rolling releases.
export const lifecycleMyDataLockKey=({companyId,storeId})=>'mydata:'+companyId+':'+storeId;
export async function readLifecycleGeneration(tx,{companyId,storeId},{lock=false}={}){
 if(typeof companyId!=='string'||!companyId||typeof storeId!=='string'||!storeId)fail('STORE_LIFECYCLE_SCOPE_INVALID','Απαιτείται συγκεκριμένο κατάστημα και εταιρεία.');
 const meta=(await tx.$queryRawUnsafe(`SELECT current_schema() AS schema, to_regclass(format('%I.%I',current_schema(),'StoreLifecycleFence'))::text AS fence`))[0];
 if(!meta?.schema)fail('STORE_LIFECYCLE_UNAVAILABLE','Δεν είναι διαθέσιμος ο έλεγχος καταστήματος.');
 if(!meta.fence)return {generation:'0',maintenance:false,retired:false,enrolled:false};
 // Never cache absence: enrollment may happen between two checkouts.
 const row=(await tx.$queryRawUnsafe(`SELECT "companyId","generation"::text AS generation,"maintenance","retired" FROM ${q(meta.schema)}."StoreLifecycleFence" WHERE "storeId"=$1${lock?' FOR SHARE NOWAIT':''}`,storeId))[0];
 if(!row)return {generation:'0',maintenance:false,retired:false,enrolled:false};
 if(row.companyId!==companyId||normalizeLifecycleGeneration(row.generation)===null||typeof row.maintenance!=='boolean'||typeof row.retired!=='boolean')fail('STORE_LIFECYCLE_SCOPE_INVALID','Η κατάσταση δεν αντιστοιχεί στο επιλεγμένο κατάστημα.');
 return {generation:row.generation,maintenance:row.maintenance,retired:row.retired,enrolled:true};
}
export async function assertLifecycleMutation(tx,scope,generation,{lock=true}={}){
 const supplied=normalizeLifecycleGeneration(generation);
 let state;
 try{state=await readLifecycleGeneration(tx,scope,{lock})}catch(error){if(error?.code==='55P03'||error?.meta?.code==='55P03')fail('STORE_LIFECYCLE_MAINTENANCE','Το κατάστημα προετοιμάζεται για εκκαθάριση.');throw error}
 if(state.maintenance||state.retired)fail('STORE_LIFECYCLE_MAINTENANCE','Το κατάστημα βρίσκεται σε συντήρηση. Δεν καταχωρίστηκε συναλλαγή.');
 // Untagged legacy requests are generation zero forever, never upgraded to the current value.
 if((supplied??'0')!==state.generation)fail('STORE_LIFECYCLE_STALE_GENERATION','Η κίνηση ανήκει σε προηγούμενη κατάσταση του καταστήματος. Διατηρήθηκε για έλεγχο και δεν καταχωρίστηκε.');
 if(lock&&state.enrolled)await tx.$queryRawUnsafe(`SELECT set_config('mws.lifecycle_generations',$1,true)`,JSON.stringify({[scope.storeId]:supplied??'0'}));
 return state;
}

// Trusted fresh server work only: derive all subsequent business inputs from
// current locked rows. Never use this to relabel a browser/device event payload.
export async function bindFreshLifecycleRead(tx,scope){
 const observed=await readLifecycleGeneration(tx,scope);
 return assertLifecycleMutation(tx,scope,observed.generation);
}
