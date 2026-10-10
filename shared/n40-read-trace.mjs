// LAB request observation only. Never authorizes a request or reads its payload.
export const N40_LAB_STORE="cmtpopbgo000trhb5ng9ytiru";
export const N40_TRACE_PREFIX="N40_READ_TRACE";
const safeId=value=>typeof value==="string"&&/^[a-zA-Z0-9_-]{3,80}$/.test(value)?value:null;
const safeTrace=value=>typeof value==="string"&&/^n40-[a-f0-9]{32}$/.test(value)?value:null;
const staticParts=new Set("api platform commerce companies stores cash-control cash-report shortages daily report reports cash analytics checks store-modules check-packages workforce-v2 employees attendance roles leaves rules schedules shift-templates payroll video-connection device-routing installation-terminals bank-ledger supplier-settlements other-expenses inventory-v2 products ledger stock access preview audit security auth support-access exit overview store-pos owner-payments payments bank transactions supplier-payment-review supplier-settlement-review bank-ledger-review super-admin-analytics".split(" "));
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","EMPLOYEE","MANAGER"]);
export function n40ReadRecord(path,scope,traceId,status=null,actor=null){
  if(scope?.storeId!==N40_LAB_STORE||!safeId(scope?.companyId)||!safeTrace(traceId)||typeof path!=="string"||!path.startsWith("/api/")||path.startsWith("//"))return null;
  let url;try{url=new URL(path,"https://n40.invalid")}catch{return null}
  const parts=url.pathname.split("/").filter(Boolean);
  const scopeValues=kind=>{
    const values=[...url.searchParams.getAll(kind==="stores"?"storeId":"companyId")];
    for(let i=0;i<parts.length-1;i++)if(parts[i]===kind)values.push(parts[i+1]);
    return {ids:[...new Set(values.map(safeId).filter(Boolean))].slice(0,8),invalid:values.some(value=>!safeId(value)),truncated:values.length>8};
  };
  const stores=scopeValues("stores"),companies=scopeValues("companies"),storeIds=stores.ids,companyIds=companies.ids;
  return {version:1,traceId,route:"/"+parts.map(p=>staticParts.has(p)?p:":value").join("/"),method:"GET",expectedCompanyId:scope.companyId,expectedStoreId:N40_LAB_STORE,companyIds,storeIds,storeScopeInvalid:stores.invalid,companyScopeInvalid:companies.invalid,scopeTruncated:stores.truncated||companies.truncated,storeMatches:stores.invalid||stores.truncated?false:storeIds.length?storeIds.every(id=>id===N40_LAB_STORE):null,companyMatches:companies.invalid||companies.truncated?false:companyIds.length?companyIds.every(id=>id===scope.companyId):null,status:Number.isInteger(status)&&status>=100&&status<=599?status:null,role:roles.has(actor?.platformRole)?actor.platformRole:roles.has(actor?.role)?actor.role:null,supportStoreId:safeId(actor?.supportContext?.storeId)};
}
export function n40ReadHeaders(path,scope,method="GET",uuid=()=>globalThis.crypto.randomUUID()){
  if(String(method).toUpperCase()!=="GET"||scope?.storeId!==N40_LAB_STORE)return null;
  let traceId;try{traceId="n40-"+uuid().replaceAll("-","")}catch{return null}
  if(!n40ReadRecord(path,scope,traceId))return null;
  return {traceId,headers:{"X-MWS-N40-Trace":traceId,"X-MWS-N40-Store":scope.storeId,"X-MWS-N40-Company":scope.companyId}};
}

export const N40_VISIBLE_TRACE_EVENT="mws:n40-read-trace";
export function n40PublishRead(path,scope,traceId,status,actor=null,target=globalThis){
  const record=n40ReadRecord(path,scope,traceId,status,actor);
  if(!record)return null;
  const detail={...record,side:"client",observedAt:new Date().toISOString()};
  try{target.console?.info(N40_TRACE_PREFIX,JSON.stringify(detail))}catch{}
  // Only regenerated allowlisted metadata crosses this event, never caller objects.
  try{if(typeof target.dispatchEvent==="function"&&typeof target.CustomEvent==="function")target.dispatchEvent(new target.CustomEvent(N40_VISIBLE_TRACE_EVENT,{detail}))}catch{}
  return detail;
}
