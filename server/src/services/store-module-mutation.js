import {assertLifecycleMutation} from "./store-lifecycle-generation.js";
import {lifecycleContext} from "./store-lifecycle-context.js";

const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code})};

// Capture the originating request epoch before checkout; a later context must
// never upgrade an old commercial mutation. The callback gets only locked data.
export function withStoreModuleMutation(db,scope,work){
  const fields=scope&&typeof scope==="object"&&!Array.isArray(scope)?Object.getOwnPropertyDescriptors(scope):{};
  const companyId=fields.companyId,storeId=fields.storeId;
  if(!companyId||!storeId||!("value" in companyId)||!("value" in storeId)||
    typeof companyId.value!=="string"||!companyId.value.trim()||companyId.value.includes("\0")||
    typeof storeId.value!=="string"||!storeId.value.trim()||storeId.value.includes("\0"))
    fail(409,"STORE_LIFECYCLE_SCOPE_INVALID","Απαιτείται συγκεκριμένο κατάστημα και εταιρεία.");
  if(typeof work!=="function"||!db||typeof db.$transaction!=="function")throw new TypeError("Invalid Store module mutation callback or database");
  const captured={companyId:companyId.value,storeId:storeId.value};
  const generation=lifecycleContext()[captured.storeId];
  return db.$transaction(async tx=>{
    await assertLifecycleMutation(tx,captured,generation,{lock:true});
    let store;
    try{
      [store]=await tx.$queryRaw`SELECT "id","companyId","name" FROM "Store"
        WHERE "id"=${captured.storeId} AND "companyId"=${captured.companyId} FOR NO KEY UPDATE NOWAIT`;
    }catch(error){
      if(error?.code==="55P03"||error?.meta?.code==="55P03")fail(409,"STORE_MODULE_BUSY","Το κατάστημα χρησιμοποιείται από άλλη εργασία. Δοκίμασε ξανά αφού ολοκληρωθεί.");
      throw error;
    }
    // Inactive stores intentionally remain configurable by Platform Admin.
    if(!store)fail(404,"STORE_MODULE_STORE_NOT_FOUND","Δεν βρέθηκε κατάστημα στην επιλεγμένη εταιρεία.");
    return work({tx,store});
  });
}
