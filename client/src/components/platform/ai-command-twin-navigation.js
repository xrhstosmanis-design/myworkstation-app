// Navigation context only. These guards do not replace server authorization.
const id=value=>typeof value==="string"&&value.trim().length>0;
export const validTwinScope=scope=>Boolean(scope&&id(scope.companyId)&&id(scope.storeId));
export const twinScopeKey=scope=>JSON.stringify([scope?.companyId,scope?.storeId]);
export const TWIN_DESTINATIONS=new Set(["checks","cash","payments","bank","stock","workforce","video"]);
export function resolveTwinContext(companies,scope){
  if(!validTwinScope(scope))return null;
  const company=(companies||[]).find(item=>item.id===scope.companyId);
  const store=company?.stores?.find(item=>item.id===scope.storeId);
  return company&&store?{company,store}:null;
}
export function withTwinScope(filters,scope=null){
  if(scope===null)return {...filters};
  if(!validTwinScope(scope))throw new Error("Το επιλεγμένο κατάστημα δεν είναι διαθέσιμο. Επίλεξέ το ξανά στο Full Digital Twin.");
  return {...filters,companyId:scope.companyId,storeId:scope.storeId};
}
export function guardTwinRequest(request,isCurrent){
  return async(...args)=>{
    if(!isCurrent())throw new Error("Η επιλογή καταστήματος άλλαξε. Άνοιξε ξανά την οθόνη από το Full Digital Twin.");
    const result=await request(...args);
    if(!isCurrent())throw new Error("Η επιλογή καταστήματος άλλαξε. Το προηγούμενο αποτέλεσμα απορρίφθηκε.");
    return result;
  };
}
// One-use, actor-bound, non-secret return hint. Never stores a URL or a token.
export const TWIN_RETURN_KEY="mws:ai-command:twin-return:v1";
export const TWIN_RETURN_MAX_AGE_MS=60*60*1000;
export function rememberTwinReturn(storage,scope,userId,now=Date.now()){
  if(!validTwinScope(scope)||!id(userId))return false;
  try{storage.setItem(TWIN_RETURN_KEY,JSON.stringify({version:1,userId,companyId:scope.companyId,storeId:scope.storeId,createdAt:now}));return true}catch{return false}
}
export function clearTwinReturn(storage){try{storage.removeItem(TWIN_RETURN_KEY)}catch{}}
export function readTwinReturn(storage,userId,now=Date.now()){
  try{
    const raw=storage.getItem(TWIN_RETURN_KEY);
    const value=JSON.parse(raw||"null");
    if(value?.version!==1||value.userId!==userId||!id(userId)||!validTwinScope(value)||!Number.isFinite(value.createdAt))return null;
    const age=now-value.createdAt;
    if(age<0||age>TWIN_RETURN_MAX_AGE_MS)return null;
    return {companyId:value.companyId,storeId:value.storeId};
  }catch{return null}
}

export function consumeTwinReturn(storage,userId,now=Date.now()){const selection=readTwinReturn(storage,userId,now);clearTwinReturn(storage);return selection}
