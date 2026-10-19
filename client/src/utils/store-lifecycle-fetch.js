// One page lifetime keeps one immutable origin epoch per store. Reload starts a
// new lifetime; retries must supply their persisted original header explicitly.
export const lifecycleHeader='x-mws-store-generations';
export function createLifecycleFetch({fetch:send,origin,onStale=()=>{},onPinned=()=>{}}){
 const epochs=new Map(),loading=new Map();
 const snapshot=()=>Object.fromEntries(epochs);
 async function pin(storeId,authorization){
  if(epochs.has(storeId)||!authorization)return;
  if(!loading.has(storeId))loading.set(storeId,(async()=>{
   const response=await send(`${origin}/api/lifecycle/stores/${encodeURIComponent(storeId)}`,{headers:{Authorization:authorization},cache:'no-store'});
   if(!response.ok)return;
   const data=await response.json();
   if(data?.storeId===storeId&&typeof data?.generation==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(data.generation)&&!epochs.has(storeId)){epochs.set(storeId,data.generation);onPinned(storeId,data.generation)}
  })().catch(()=>{}).finally(()=>loading.delete(storeId)));
  await loading.get(storeId);
 }
 async function request(input,options){
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,origin);
  if(url.origin!==origin||!url.pathname.startsWith('/api/')||url.pathname.startsWith('/api/lifecycle/'))return send(input,options);
  const headers=new Headers(options?.headers??input?.headers),scopes=new Set();
  const match=url.pathname.match(/\/(?:stores|store)\/([^/]+)(?:\/|$)/);if(match)try{scopes.add(decodeURIComponent(match[1]))}catch{}
  if(url.searchParams.get('storeId'))scopes.add(url.searchParams.get('storeId'));
  // Empty storeId means an unscoped caller, not a store epoch. Remembering it
  // would make every later header invalid, including unrelated shift reads.
  if(typeof options?.body==='string')try{const body=JSON.parse(options.body);if(typeof body?.storeId==='string'&&body.storeId!=='')scopes.add(body.storeId)}catch{}
  const method=String(options?.method??input?.method??'GET').toUpperCase();
  // Only a fresh read may establish a page epoch. A mutation with no prior
  // read is legacy zero; looking up today's epoch here would relabel old data.
  if(['GET','HEAD'].includes(method))await Promise.all([...scopes].slice(0,3).map(id=>pin(id,headers.get('authorization'))));
  // Unknown/legacy scope is zero, never the current epoch looked up at retry.
  // A scope first used without a successful handshake remains zero for this page.
  for(const id of scopes)if(!epochs.has(id)){epochs.set(id,'0');onPinned(id,'0')}
  if(!headers.has(lifecycleHeader))headers.set(lifecycleHeader,JSON.stringify(snapshot()));
  const response=await send(input,{...options,headers});
  if(response.status===409)try{const data=await response.clone().json();if(['STORE_LIFECYCLE_STALE_GENERATION','STORE_LIFECYCLE_MAINTENANCE'].includes(data?.code))onStale(data)}catch{}
  return response;
 }
 return {request,snapshot};
}

