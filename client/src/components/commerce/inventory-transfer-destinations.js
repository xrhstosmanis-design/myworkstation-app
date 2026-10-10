// Fetch the authorized company list separately from the launcher's fixed source scope.
export async function loadInventoryTransferDestinations(api,sourceStoreId){
  const stores=await api("/api/stores");
  if(!Array.isArray(stores)||!stores.some(store=>store.id===sourceStoreId&&store.active!==false)){
    throw new Error("Το κατάστημα προέλευσης δεν είναι διαθέσιμο για μεταφορά.");
  }
  return stores.filter(store=>store.active!==false&&store.id!==sourceStoreId);
}
