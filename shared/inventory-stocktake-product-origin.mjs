// A product created from inventory must be attached only to its original draft.
// Keep this decision independent of whichever stocktake the UI selects later.
export function targetStocktakeForSavedProduct(origin,{storeId,scope,savedStoreId}={}){
  if(!origin?.stocktakeId||!origin?.storeId||!origin?.scope)return null;
  if(origin.storeId!==storeId||origin.scope!==scope||origin.storeId!==savedStoreId)return null;
  return origin.stocktakeId;
}

export function shouldRefreshStocktakeAfterAttach(targetStocktakeId,selectedStocktakeId){
  return Boolean(targetStocktakeId&&targetStocktakeId===selectedStocktakeId);
}
