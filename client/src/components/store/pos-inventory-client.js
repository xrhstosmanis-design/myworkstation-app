export function createPosInventoryClient({api,storeId,actorId,sessionToken,currentToken,onAccessLost}){
 let active=true,generation=null;
 const controller=new AbortController();
 const stale=()=>Object.assign(new Error('Η Αποθήκη έκλεισε ή άλλαξε η σύνδεση. Άνοιξέ την ξανά.'),{code:'POS_INVENTORY_STALE'});
 const check=()=>{if(!active)throw stale();if(!sessionToken||currentToken()!==sessionToken){const failure=stale();active=false;controller.abort();onAccessLost?.(failure);throw failure}};
 const prefix=`/api/store-pos/stores/${encodeURIComponent(storeId)}/inventory`;
 const request=async(path,options={})=>{
  check();
  let mapped;
  if(path==='/access')mapped='/access';
  else if(/^\/api\/inventory-archive(?:[/?]|$)/.test(path))mapped=path.replace('/api/inventory-archive','/archive');
  else if(path.startsWith('/api/owner-products/'))mapped=path.replace('/api/owner-products','/products');
  else if(path==='/api/commerce/suppliers')mapped='/suppliers';
  else throw new Error('Η ενέργεια δεν ανήκει στην Αποθήκη POS.');
  const method=options.method||'GET';
  if(!['GET','HEAD'].includes(method.toUpperCase())&&generation===null)throw stale();
  try{
   const response=await api(prefix+mapped,{...options,signal:controller.signal,headers:{...(options.headers||{}),...(generation===null?{}:{'X-Inventory-Generation':generation})}});
   check();
   if(response?.scope?.storeId!==storeId||response?.scope?.actorId!==actorId||response?.capabilities?.read!==true||typeof response?.lifecycle?.generation!=='string')throw stale();
   if(generation!==null&&generation!==response.lifecycle.generation)throw Object.assign(stale(),{code:'STORE_LIFECYCLE_STALE_GENERATION'});
   generation=response.lifecycle.generation;
   return response;
  }catch(error){
   if(active&&(error.status===401||['POS_INVENTORY_STALE','POS_INVENTORY_ACCESS_DENIED','LICENSE_INACTIVE','MODULE_DISABLED','STORE_LIFECYCLE_STALE_GENERATION','STORE_LIFECYCLE_MAINTENANCE'].includes(error.code))){active=false;controller.abort();onAccessLost?.(error)}
   throw error;
  }
 };
 return {request,api:async(path,options)=>(await request(path,options)).data,dispose(){active=false;controller.abort()}};
}
