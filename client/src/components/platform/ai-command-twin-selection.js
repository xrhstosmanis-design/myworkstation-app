// A selection is an exact company/store pair. Only null means first entry.
// A missing or malformed remembered selection must never select another store.
const validId=value=>typeof value==="string"&&value.trim().length>0;
export const twinSelectionFor=twin=>({companyId:twin?.companyId,storeId:twin?.id});
export function resolveTwinSelection(twins,selection){
  const available=Array.isArray(twins)?twins:[];
  if(selection===null)return available.find(twin=>validId(twin?.companyId)&&validId(twin?.id))||null;
  if(!selection||!validId(selection.companyId)||!validId(selection.storeId))return null;
  return available.find(twin=>twin?.companyId===selection.companyId&&twin?.id===selection.storeId)||null;
}
