import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createWholesaleApi} from '../../client/src/components/wholesale/wholesale-api.js';
import {fetchOfflineSnapshot,reviewOfflineDraft,sendOfflineFrozen} from '../../client/src/components/wholesale/wholesale-offline-api.mjs';
import {createWholesaleOfflineVault} from '../../client/src/components/wholesale/wholesale-offline-vault.mjs';

// These are isolated wire-contract regressions using the actual transport,
// outbox and cryptography. The injected HTTP replies are not database LAB proof.
const copy=value=>value==null?value:JSON.parse(JSON.stringify(value));
const passphrase='isolated-offline-device-phrase';
function storage(){
 const rows=new Map(),markers=new Map();return {
  get:async key=>copy(rows.get(key)||null),list:async()=>[...rows.values()].map(copy),
  getRecord:async key=>({envelope:copy(rows.get(key)||null),denied:markers.get(key)?.denied===true,denialVersion:markers.get(key)?.version||0}),
  isDenied:async key=>markers.get(key)?.denied===true,deny:async key=>{markers.set(key,{denied:true,version:(markers.get(key)?.version||0)+1});return {denied:true}},
  compareAndSwap:async(key,version,envelope,{isCurrent=()=>true,renew=false,expectedDenialVersion}={})=>{
   if(!isCurrent())throw Object.assign(Error('locked'),{code:'LOCKED'});
   const marker=markers.get(key);if(marker?.denied&&!renew||renew&&(marker?.version||0)!==expectedDenialVersion)throw Object.assign(Error('revoked'),{code:'REVOKED'});
   if((rows.get(key)?.version??null)!==version)return false;rows.set(key,copy(envelope));if(renew)markers.set(key,{denied:false,version:marker?.version||0});return true;
  },close:async()=>{}
 };
}
const locks={request:async(name,_options,run)=>run({name})};
const vaultFor=memory=>createWholesaleOfflineVault({storage:memory,crypto:webcrypto,lockManager:locks,broadcastFactory:null});
function fixture({epoch='0',seller=false,loseFirst=false,rejectStale=false}={}){
 const storeId='offline-lifecycle-'+webcrypto.randomUUID(),identity={userId:seller?'synthetic-seller':'synthetic-owner',companyId:'synthetic-company',role:seller?'EMPLOYEE':'OWNER'},scope={...identity,storeId},session={identity,expiresAt:Date.now()+3600000},paid={companyId:identity.companyId,moduleKey:'WHOLESALE_B2B',enabled:true,expiresAt:null};
 const quote={quoteId:'a'.repeat(64),currency:'EUR',customerId:'synthetic-customer',storeId,items:[{productId:'synthetic-product',quantity:'3.0000',name:'Synthetic product',netTotal:'15.00',vatTotal:'1.95',grossTotal:'16.95'}],totals:{net:'15.00',vat:'1.95',gross:'16.95'}};
 const snapshot={identity,store:{id:storeId,name:'Synthetic store'},customers:[{id:'synthetic-customer',name:'Synthetic customer',code:'A'}],products:[{id:'synthetic-product',name:'Synthetic product',sku:'SYNTHETIC',unit:'PIECE'}],paidExpiresAt:session.expiresAt,originGeneration:epoch};
 let current=epoch;const posts=[],quotes=[],pins=[];
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 const fetchImpl=async(input,options={})=>{
  const url=new URL(input,'https://isolated.invalid'),headers=new Headers(options.headers),header=JSON.parse(headers.get('x-mws-store-generations')||'{}');
  if(url.pathname.startsWith('/api/lifecycle/stores/')){pins.push(current);return reply({storeId,generation:current})}
  if(url.pathname==='/api/wholesale/capabilities')return reply(paid);
  if(url.pathname==='/api/wholesale/workspace')return reply({user:{id:identity.userId,role:identity.role},company:{id:identity.companyId},storeId,stores:[snapshot.store],access:paid});
  if(url.pathname==='/api/wholesale/sellers/context')return reply({user:{id:identity.userId},companyId:identity.companyId,stores:[snapshot.store]});
  if(url.pathname==='/api/wholesale/customers'||url.pathname==='/api/wholesale/sellers/customers')return reply({items:snapshot.customers,total:1});
  if(url.pathname==='/api/wholesale/products'||url.pathname==='/api/wholesale/sellers/catalog')return reply({items:snapshot.products,total:1});
  if(url.pathname.endsWith('/quotes')){quotes.push({epoch:header[storeId],headers});return reply(quote)}
  if(url.pathname.endsWith('/orders')){
   const expected=JSON.parse(options.body);posts.push({epoch:header[storeId],body:options.body,headers});
   if(rejectStale&&header[storeId]!==current)return reply({error:'Synthetic stale lifecycle generation',code:'STORE_LIFECYCLE_STALE_GENERATION'},409);
   if(loseFirst&&posts.length===1)throw new TypeError('Synthetic accepted response connection loss');
   const order={id:'synthetic-order',status:'SUBMITTED',clientOrderId:expected.clientOrderId,...(seller?{snapshot:quote}:{storeId,customerId:expected.customerId})};
   return reply({orderId:order.id,status:'SUBMITTED',replayed:posts.length>1,order});
  }
  throw Error('Unexpected isolated endpoint '+url.pathname);
 };
 return {scope,session,snapshot,quote,posts,quotes,pins,setEpoch:value=>{current=value},page:()=>createWholesaleApi({origin:'https://isolated.invalid',fetchImpl})};
}
async function withSyntheticCredential(run){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>key==='token'?'synthetic-test-token-not-real':null}});
 try{await run()}finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage}
}
const capture={customerId:'synthetic-customer',items:[{productId:'synthetic-product',quantity:'3'}],notes:'Isolated original request'};
const sendBody=(draft,scope,quote)=>({clientOrderId:draft.clientOrderId,customerId:draft.customerId,storeId:scope.storeId,items:draft.items,notes:draft.notes,quoteId:quote.quoteId});

for(const [initial,next]of [['0','1'],['7','8']])test(`actual encrypted UNKNOWN retry after page restart preserves epoch ${initial} when current handshake advances to ${next}`,async()=>withSyntheticCredential(async()=>{
 const f=fixture({epoch:initial,loseFirst:true}),memory=storage();let vault=vaultFor(memory);await vault.prepare(f.scope,passphrase,f.snapshot);const draft=await vault.addDraft(capture);await vault.freezeSend(draft.id,sendBody(draft,f.scope,f.quote));
 const firstPage=f.page();await vault.sendFrozen(draft.id,(body,frozen)=>sendOfflineFrozen(firstPage,f.session,f.scope,body,{originGeneration:frozen.originGeneration}));
 assert.equal((await vault.read()).drafts[0].status,'UNKNOWN');vault.dispose();f.setEpoch(next);
 vault=vaultFor(memory);try{await vault.unlock(f.scope,passphrase);const restartedPage=f.page();const result=await vault.sendFrozen(draft.id,(body,frozen)=>sendOfflineFrozen(restartedPage,f.session,f.scope,body,{originGeneration:frozen.originGeneration}));assert.equal(result.status,'CONFIRMED');assert.equal(f.posts.length,2);assert.equal(f.posts[0].body,f.posts[1].body);assert.equal(f.posts[0].epoch,initial);assert.equal(f.posts[1].epoch,initial);assert.ok(f.pins.includes(next));}finally{vault.dispose()}
}));

test('explicit old epoch reaches actual transport unchanged and server stale409 cannot be accepted',async()=>withSyntheticCredential(async()=>{
 const f=fixture({epoch:'9',rejectStale:true}),body=JSON.stringify({...capture,storeId:f.scope.storeId,clientOrderId:webcrypto.randomUUID(),quoteId:f.quote.quoteId});
 await assert.rejects(sendOfflineFrozen(f.page(),f.session,f.scope,body,{originGeneration:'8'}),error=>error.status===409&&error.code==='STORE_LIFECYCLE_STALE_GENERATION');assert.equal(f.posts.length,1);assert.equal(f.posts[0].epoch,'8');assert.equal(f.posts[0].body,body);
}));

test('snapshot captures the actual selected-store read epoch',async()=>withSyntheticCredential(async()=>{
 const f=fixture({epoch:'4'}),snapshot=await fetchOfflineSnapshot(f.page(),f.session,f.scope.storeId);assert.equal(snapshot.originGeneration,'4');assert.deepEqual(f.pins,['4']);assert.equal(snapshot.store.id,f.scope.storeId);
}));

for(const seller of [false,true])test(`${seller?'seller':'manager'} canonical quote keeps original draft epoch and seller principal headers`,async()=>withSyntheticCredential(async()=>{
 const f=fixture({epoch:'9',seller});await reviewOfflineDraft(f.page(),f.session,f.scope,{...capture,originGeneration:'8'});assert.equal(f.quotes.length,1);assert.equal(f.quotes[0].epoch,'8');if(seller){assert.equal(f.quotes[0].headers.get('X-Wholesale-Seller'),f.session.identity.userId);assert.equal(f.quotes[0].headers.get('X-Wholesale-Company'),f.session.identity.companyId)}
}));

test('encrypted per-draft capture epoch survives edit and authorized snapshot renewal while new drafts capture the new epoch',async()=>{
 const f=fixture({epoch:'7'}),vault=vaultFor(storage());try{await vault.prepare(f.scope,passphrase,f.snapshot);const old=await vault.addDraft(capture);assert.equal(old.originGeneration,'7');await vault.editDraft(old.id,{notes:'Edited same original'});await vault.prepare(f.scope,passphrase,{...f.snapshot,originGeneration:'8'});const current=await vault.addDraft(capture),rows=(await vault.read()).drafts;assert.equal(rows.find(row=>row.id===old.id).originGeneration,'7');assert.equal(rows.find(row=>row.id===old.id).clientOrderId,old.clientOrderId);assert.equal(current.originGeneration,'8');}finally{vault.dispose()}
});

test('legacy missing snapshot or draft origin uses zero rather than repinning the current page epoch',async()=>withSyntheticCredential(async()=>{
 const f=fixture({epoch:'9'}),vault=vaultFor(storage()),legacy={...f.snapshot};delete legacy.originGeneration;
 try{await vault.prepare(f.scope,passphrase,legacy);const draft=await vault.addDraft(capture);assert.equal(draft.originGeneration,'0');const body=JSON.stringify(sendBody(draft,f.scope,f.quote));await sendOfflineFrozen(f.page(),f.session,f.scope,body);assert.equal(f.posts[0].epoch,'0');assert.ok(f.pins.includes('9'));}finally{vault.dispose()}
}));

test('malformed original epoch metadata never reaches quote or order POST',async()=>withSyntheticCredential(async()=>{
 for(const originGeneration of [8,true,{},'-1','01',' 7','7 ','7.0','1e2','9'.repeat(20)]){
  const f=fixture({epoch:'9'}),body=JSON.stringify({...capture,storeId:f.scope.storeId,clientOrderId:webcrypto.randomUUID(),quoteId:f.quote.quoteId});
  await assert.rejects(sendOfflineFrozen(f.page(),f.session,f.scope,body,{originGeneration}),/αρχική έκδοση/);
  await assert.rejects(reviewOfflineDraft(f.page(),f.session,f.scope,{...capture,originGeneration}),/αρχική έκδοση/);
  assert.equal(f.posts.length,0);assert.equal(f.quotes.length,0);
 }
}));

test('UNKNOWN request keeps its immutable epoch and body through snapshot renewal and another complete vault/page restart',async()=>withSyntheticCredential(async()=>{
 const f=fixture({epoch:'7',loseFirst:true}),memory=storage();let vault=vaultFor(memory);
 await vault.prepare(f.scope,passphrase,f.snapshot);const draft=await vault.addDraft(capture);await vault.freezeSend(draft.id,sendBody(draft,f.scope,f.quote));const firstPage=f.page();await vault.sendFrozen(draft.id,(body,frozen)=>sendOfflineFrozen(firstPage,f.session,f.scope,body,{originGeneration:frozen.originGeneration}));
 const before=(await vault.read()).drafts[0];assert.equal(before.status,'UNKNOWN');assert.equal(before.originGeneration,'7');
 await vault.prepare(f.scope,passphrase,{...f.snapshot,originGeneration:'8'});const newDraft=await vault.addDraft({...capture,notes:'New generation capture'}),renewed=(await vault.read()).drafts.find(row=>row.id===draft.id);assert.equal(newDraft.originGeneration,'8');assert.equal(renewed.originGeneration,'7');assert.equal(renewed.status,'UNKNOWN');assert.equal(renewed.sendBody,before.sendBody);vault.dispose();
 f.setEpoch('9');vault=vaultFor(memory);try{await vault.unlock(f.scope,passphrase);const secondPage=f.page();const accepted=await vault.sendFrozen(draft.id,(body,frozen)=>sendOfflineFrozen(secondPage,f.session,f.scope,body,{originGeneration:frozen.originGeneration}));assert.equal(accepted.status,'CONFIRMED');assert.equal(f.posts.length,2);assert.equal(f.posts[1].epoch,'7');assert.equal(f.posts[1].body,before.sendBody);assert.equal(f.posts[1].body,f.posts[0].body);assert.ok(f.pins.includes('9'));assert.equal((await vault.read()).drafts.find(row=>row.id===newDraft.id).status,'LOCAL_DRAFT')}finally{vault.dispose()}
}));
