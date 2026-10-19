// Native selected-store access only; loading this adapter creates no schema/routes.
import {authorizeOwnerAssistant} from './owner-assistant-access.js';
import {authorizePlatformAssistant} from './platform-assistant-products.js';
import {resolvePersonnelPackageStates,PERSONNEL_BASIC} from '../personnel-packages.js';
import {readLifecycleGeneration} from './store-lifecycle-generation.js';
import {historyAccessSchema} from './assistant-history-contract.js';
import {businessDomains} from '../../../shared/assistant-business.mjs';
import {businessModule} from './assistant-business-reports.js';
const fail=()=>{throw Object.assign(new Error('Απαιτείται προσωπική πρόσβαση στο επιλεγμένο κατάστημα.'),{status:403,code:'ASSISTANT_HISTORY_ACCESS_DENIED'})};
const same=(a,b)=>a&&b&&a.companyId===b.companyId&&a.storeId===b.storeId&&!a.supportPreview&&!b.supportPreview;
export function createAssistantHistoryAccess({db,mode,selection,owner=authorizeOwnerAssistant,platform=authorizePlatformAssistant,now=()=>new Date()}){
 if(!db||!['owner','platform'].includes(mode))throw new TypeError('Explicit native history access dependencies required');
 return async req=>{
  if(req.user?.supportContext||req.body?.readScope&&req.body.readScope!=='selected_store'||req.query?.readScope&&req.query.readScope!=='selected_store')fail();
  const clock=()=>{const t=new Date(now());if(!Number.isFinite(t.getTime()))throw new TypeError('Invalid access clock');return t};
  const pair=mode==='platform'?selection?.(req):null;
  if(mode==='platform'&&(!pair?.companyId||!pair?.storeId))fail();
  if(mode==='owner'&&(req.user?.role!=='OWNER'||req.user?.isSuperAdmin||req.user?.platformRole==='SUPER_ADMIN'))fail();
  const authorize=()=>mode==='platform'?platform(req,pair,{db,now:clock()}):owner(req,{db,now:clock(),requiredModules:[]});
  const scope=await authorize();if(!scope||scope.supportPreview)fail();
  const allowed=new Set();
  if(mode==='platform'){
   for(const c of ['cash_details','sales_by_product','sales_by_store','stock_by_product','consumption_details',...Object.keys(businessDomains).map(d=>'business_records:'+d)])allowed.add(c);
  }else{
   const enabled=new Set();
   for(const module of ['CASH_CONTROL','INVENTORY'])try{if(!same(scope,await owner(req,{db,now:clock(),requiredModules:[module]})))fail();enabled.add(module)}catch(e){if(e.code!=='MODULE_DISABLED')throw e}
   if(enabled.has('CASH_CONTROL'))allowed.add('cash_details');
   if(enabled.has('INVENTORY'))for(const c of ['sales_by_product','sales_by_store','stock_by_product','consumption_details'])allowed.add(c);
   for(const domain of Object.keys(businessDomains))if(enabled.has(businessModule(domain)))allowed.add('business_records:'+domain);
   // Reuse the native package resolver, with a read-only exact-scope query.
   // The UI helper's schema-creation side effect is deliberately not invoked.
   const rows=await db.$queryRaw`SELECT "moduleKey","active","startsAt","endsAt" FROM "StorePaidModule" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`;
   if(resolvePersonnelPackageStates(rows,clock()).states[PERSONNEL_BASIC]?.effectiveActive)allowed.add('business_records:STAFF');
  }
  const state=await readLifecycleGeneration(db,scope);
  if(state.maintenance||state.retired)throw Object.assign(new Error('Το κατάστημα βρίσκεται σε συντήρηση.'),{status:409,code:'STORE_LIFECYCLE_MAINTENANCE'});
  if(!same(scope,await authorize()))fail();
  return historyAccessSchema.parse({userId:req.user.id,mode,companyId:scope.companyId,storeId:scope.storeId,generation:state.generation,sessionId:req.user.sessionId,sessionVersion:req.user.sessionVersion,capabilities:[...allowed]});
 };
}
