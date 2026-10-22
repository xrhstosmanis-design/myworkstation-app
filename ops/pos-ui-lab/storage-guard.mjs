const prefixes=['myworkstation:offline-pos-sales:','myworkstation:offline-pos-history:'];

// Read-only visual LAB must not queue even a local synthetic financial action.
// This module has no product/server imports and never clears another store.
export function installOfflineStorageGuard({storeId,StorageType=globalThis.Storage,storage=globalThis.localStorage,onBlocked=()=>{}}={}){
  if(typeof storeId!=='string'||!storeId.trim())throw new Error('Απαιτείται αναγνωριστικό συνθετικού καταστήματος LAB.');
  const prototype=StorageType?.prototype,original=prototype?.setItem;
  if(typeof original!=='function'||!storage?.removeItem)throw new Error('Δεν εγκαταστάθηκε ο αποκλεισμός τοπικών συναλλαγών του LAB.');
  const guarded=function(key,value){
    const normalized=String(key);
    if(prefixes.some(prefix=>normalized.startsWith(prefix))){
      const error=new Error('ΟΠΤΙΚΟ LAB: απαγορεύεται η τοπική αποθήκευση ή ουρά πώλησης. Δεν έγινε συναλλαγή.');
      error.code='VISUAL_LAB_OFFLINE_QUEUE_DENIED';
      try{onBlocked({key:normalized,method:'LOCAL_STORAGE'});}finally{throw error;}
    }
    return original.call(this,key,value);
  };
  prototype.setItem=guarded;
  // Remove only stale synthetic records from this LAB fixture, never a prefix
  // scan or another store's queue/history or display/catalog preferences.
  for(const prefix of prefixes)storage.removeItem(prefix+storeId);
  return ()=>{if(prototype.setItem===guarded)prototype.setItem=original;};
}
