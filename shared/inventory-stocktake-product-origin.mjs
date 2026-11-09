// A newly created product may attach only to its original currently selected draft.
// Never retarget the callback when a user navigates to another stocktake or store.
export function targetStocktakeForSavedProduct(origin,{storeId,scope,savedStoreId,selectedStocktakeId}={}){
  if(!origin?.stocktakeId||!origin?.storeId||!origin?.scope)return null;
  if(origin.storeId!==storeId||origin.scope!==scope||origin.storeId!==savedStoreId)return null;
  if(origin.stocktakeId!==selectedStocktakeId)return null;
  return origin.stocktakeId;
}
export function shouldRefreshStocktakeAfterAttach(targetStocktakeId,selectedStocktakeId){
  return Boolean(targetStocktakeId&&targetStocktakeId===selectedStocktakeId);
}
