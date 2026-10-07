// A notification URL identifies a store; it never grants access.
export async function loadNotificationChatStore(api,storeId){
  if(typeof storeId!=="string"||!storeId)throw new Error("Δεν προσδιορίστηκε κατάστημα.");
  const result=await api(`/api/store-chat/stores/${encodeURIComponent(storeId)}/messages`);
  if(result?.store?.id!==storeId)throw new Error("Δεν επιβεβαιώθηκε το κατάστημα της ειδοποίησης.");
  return result.store;
}
