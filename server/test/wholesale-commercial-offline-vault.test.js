import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createWholesaleOfflineVault} from '../../client/src/components/wholesale/wholesale-offline-vault.mjs';
import {createWholesaleOfflineStorage} from '../../client/src/components/wholesale/wholesale-offline-idb.mjs';

// Deterministic shared CAS contract, not a claim of a real browser IndexedDB test.
// The separate Chromium acceptance suite exercises the actual adapter and restart.
function fixture() {
  const rows = new Map(), markers = new Map(), held = new Set(); let time = 1_800_000_000_000, denyWrite = false, beforeWrite;
  const copy = value => value == null ? value : structuredClone(value);
  const storage = {async get(key) {return copy(rows.get(key) || null);},async list() {return [...rows.values()].map(copy);},
    async getRecord(key) {return {envelope:copy(rows.get(key) || null),denied:markers.get(key)?.denied === true,denialVersion:markers.get(key)?.version || 0};},
    async isDenied(key) {return markers.get(key)?.denied === true;},
    async deny(key) {if(denyWrite)throw Error('QuotaExceededError');const version=(markers.get(key)?.version || 0)+1;markers.set(key,{denied:true,version});return {denied:true,denialVersion:version};},
    async compareAndSwap(key,expected,value,options={}) {
      if (beforeWrite) { const hook = beforeWrite; beforeWrite = null; await hook(); }
      if (options.signal?.aborted || options.isCurrent?.() === false) throw Object.assign(Error('locked'),{code:'LOCKED'});
      if (denyWrite) throw Error('QuotaExceededError');
      if(markers.get(key)?.denied && !options.renew)throw Object.assign(Error('denied'),{code:'REVOKED'});
      if(options.renew && (markers.get(key)?.version || 0)!==options.expectedDenialVersion)throw Object.assign(Error('denied during renew'),{code:'REVOKED'});
      if ((rows.get(key)?.version ?? null) !== expected) return false;
      rows.set(key,copy(value));if(options.renew)markers.set(key,{denied:false,version:markers.get(key)?.version || 0});return true;
    }};
  const lockManager = {async request(name,options,callback) {if (held.has(name)) return callback(null); held.add(name); try {return await callback({name});} finally {held.delete(name);}}};
  const scope = {userId:'person-a',companyId:'company-a',storeId:'store-a',role:'EMPLOYEE'};
  const snapshot = () => ({identity:scope,store:{id:'store-a',name:'Local store'},customers:[{id:'customer-a',name:'Customer secret',token:'NEVER_STORE_TOKEN'}],products:[{id:'product-a',name:'Product secret',sku:'SKU1',unit:'PIECE',password:'NEVER_STORE_PASSWORD'}],paidExpiresAt:time+86400000});
  const vault = options => createWholesaleOfflineVault({storage,crypto:webcrypto,now:()=>time,lockManager,...options});
  const capture = {customerId:'customer-a',items:[{productId:'product-a',quantity:'2'}],notes:'Local confidential note'};
  const body = draft => ({clientOrderId:draft.clientOrderId,customerId:draft.customerId,storeId:scope.storeId,items:draft.items,quoteId:'server-quote-a',notes:draft.notes});
  return {rows,markers,storage,scope,snapshot,vault,capture,body,lockManager,setTime:value=>{time=value;},now:()=>time,deny:value=>{denyWrite=value;},hook:fn=>{beforeWrite=fn;}};
}
const passphrase = 'Separate local phrase 123';
const rejectsCode = (promise,code) => assert.rejects(promise,error=>error.code===code);

test('encrypted durable snapshot and local drafts survive a fresh vault; no auth or content leaks into envelope', async()=>{
  const f=fixture(),v=f.vault(); await v.prepare({...f.scope,token:'NEVER_SCOPE_TOKEN'},passphrase,f.snapshot());
  const draft=await v.addDraft(f.capture); assert.equal(draft.status,'LOCAL_DRAFT');assert.equal(draft.clientOrderId,draft.id);
  const raw=JSON.stringify([...f.rows.values()]);
  for(const value of ['Customer secret','Product secret','Local confidential note','NEVER_STORE_TOKEN','NEVER_STORE_PASSWORD','NEVER_SCOPE_TOKEN'])assert.equal(raw.includes(value),false);
  v.lock();await rejectsCode(v.read(),'LOCKED');
  const restarted=f.vault();const restored=await restarted.unlock(f.scope,passphrase);
  assert.deepEqual(restored.drafts,[draft]);assert.equal(restored.snapshot.products[0].password,undefined);
  const profiles=await restarted.listProfiles();assert.equal(profiles.length,1);assert.equal(profiles[0].customers,undefined);
});

test('wrong phrase, other principal, corruption, and authenticated public header tampering fail closed',async()=>{
  const f=fixture(),v=f.vault();await v.prepare(f.scope,passphrase,f.snapshot());v.lock();
  await rejectsCode(v.unlock(f.scope,'Incorrect other phrase'),'UNLOCK_FAILED');
  await rejectsCode(v.unlock({...f.scope,userId:'person-b'},passphrase),'NOT_PREPARED');
  const [key,envelope]=[...f.rows.entries()][0];f.rows.set(key,{...envelope,storeName:'tampered'});
  await rejectsCode(v.unlock(f.scope,passphrase),'UNLOCK_FAILED');
  f.rows.set(key,{...envelope,ciphertext:envelope.ciphertext.slice(0,-4)+'AAAA'});
  await rejectsCode(v.unlock(f.scope,passphrase),'UNLOCK_FAILED');
});

test('lease expires within 24h/paid expiry and renewal retains frozen original request without deleting ciphertext',async()=>{
  const f=fixture(),v=f.vault(),snapshot=f.snapshot();snapshot.paidExpiresAt=f.now()+1000;
  await v.prepare(f.scope,passphrase,snapshot);const draft=await v.addDraft(f.capture),frozen=await v.freezeSend(draft.id,f.body(draft));
  const size=f.rows.size;f.setTime(f.now()+1001);await rejectsCode(v.read(),'EXPIRED');v.lock();await rejectsCode(v.unlock(f.scope,passphrase),'EXPIRED');assert.equal(f.rows.size,size);
  await v.prepare(f.scope,passphrase,f.snapshot());const current=(await v.read()).drafts[0];assert.equal(current.sendBody,frozen.sendBody);assert.equal(current.clientOrderId,draft.clientOrderId);
  await rejectsCode(v.editDraft(draft.id,{notes:'replacement'}),'FROZEN');
});

test('quota failure never reports saved; lock during a pending commit aborts the write',async()=>{
  const f=fixture(),v=f.vault();await v.prepare(f.scope,passphrase,f.snapshot());f.deny(true);
  await rejectsCode(v.addDraft(f.capture),'WRITE_FAILED');f.deny(false);assert.equal((await v.read()).drafts.length,0);
  f.hook(()=>v.lock());await rejectsCode(v.addDraft(f.capture),'LOCKED');await v.unlock(f.scope,passphrase);assert.equal((await v.read()).drafts.length,0);
});

test('CAS conflict between independent tabs preserves one committed edit without silent overwrite',async()=>{
  const f=fixture(),a=f.vault(),b=f.vault();await a.prepare(f.scope,passphrase,f.snapshot());await b.unlock(f.scope,passphrase);
  const outcomes=await Promise.allSettled([a.addDraft(f.capture),b.addDraft({...f.capture,notes:'tab b'})]);
  assert.equal(outcomes.filter(row=>row.status==='fulfilled').length,1);assert.equal(outcomes.find(row=>row.status==='rejected').reason.code,'CONFLICT');assert.equal((await a.read()).drafts.length,1);
});

test('original send body commits BEFORE callback; unknown restart retries identical key and body only',async()=>{
  const f=fixture(),a=f.vault();await a.prepare(f.scope,passphrase,f.snapshot());const draft=await a.addDraft(f.capture);await a.freezeSend(draft.id,f.body(draft));let original;
  const first=await a.sendFrozen(draft.id,async body=>{original=body;const b=f.vault();const state=await b.unlock(f.scope,passphrase);assert.equal(state.drafts[0].status,'SENDING');assert.equal(state.drafts[0].sendBody,body);throw Error('response lost');});assert.equal(first.status,'UNKNOWN');
  a.lock();const b=f.vault();await b.unlock(f.scope,passphrase);await rejectsCode(b.freezeSend(draft.id,{...f.body(draft),quoteId:'new-quote'}),'FROZEN');
  const accepted=await b.sendFrozen(draft.id,async body=>{assert.equal(body,original);return{status:'CONFIRMED',serverOrderId:'order-a'};});assert.equal(accepted.status,'CONFIRMED');await rejectsCode(b.sendFrozen(draft.id,()=>assert.fail('duplicate')),'NOT_SENDABLE');
});

test('Web Lock excludes concurrent tab network calls and absent locks blocks sending only',async()=>{
  const f=fixture(),a=f.vault(),b=f.vault();await a.prepare(f.scope,passphrase,f.snapshot());const draft=await a.addDraft(f.capture);await a.freezeSend(draft.id,f.body(draft));await b.unlock(f.scope,passphrase);
  let release,entered;const started=new Promise(resolve=>{entered=resolve;});const pending=a.sendFrozen(draft.id,async()=>{entered();await new Promise(resolve=>{release=resolve;});return{status:'UNKNOWN'};});await started;
  await rejectsCode(b.sendFrozen(draft.id,()=>assert.fail('concurrent network')),'SEND_BUSY');release();await pending;
  const noLocks=createWholesaleOfflineVault({storage:f.storage,crypto:webcrypto,now:f.now,lockManager:null});await noLocks.unlock(f.scope,passphrase);await rejectsCode(noLocks.sendFrozen(draft.id,()=>assert.fail('no locks')),'LOCKS_UNAVAILABLE');await noLocks.addDraft(f.capture);
});

test('context lock while a request is in flight cannot settle into another identity; crash recovery remains exact',async()=>{
  const f=fixture(),a=f.vault();await a.prepare(f.scope,passphrase,f.snapshot());const draft=await a.addDraft(f.capture);const frozen=await a.freezeSend(draft.id,f.body(draft));
  await rejectsCode(a.sendFrozen(draft.id,async()=>{a.lock();return{status:'CONFIRMED',serverOrderId:'order-a'};}),'LOCKED');
  const b=f.vault();await b.unlock(f.scope,passphrase);assert.equal((await b.read()).drafts[0].status,'SENDING');
  const recovered=await b.sendFrozen(draft.id,async body=>{assert.equal(body,frozen.sendBody);return{status:'CONFIRMED',serverOrderId:'order-a'};});assert.equal(recovered.status,'CONFIRMED');
});

test('outcome write failure retains SENDING and immutable request for explicit idempotent recovery',async()=>{
  const f=fixture(),v=f.vault();await v.prepare(f.scope,passphrase,f.snapshot());const draft=await v.addDraft(f.capture);const frozen=await v.freezeSend(draft.id,f.body(draft));
  await rejectsCode(v.sendFrozen(draft.id,async()=>{f.deny(true);return{status:'CONFIRMED',serverOrderId:'order-a'};}),'WRITE_FAILED');
  f.deny(false);assert.equal((await v.read()).drafts[0].status,'SENDING');
  const recovered=await v.sendFrozen(draft.id,async body=>{assert.equal(body,frozen.sendBody);return{status:'CONFIRMED',serverOrderId:'order-a'};});assert.equal(recovered.serverOrderId,'order-a');
});

test('expiry during local commit fails closed and retains prior committed data',async()=>{
  const f=fixture(),v=f.vault(),snapshot=f.snapshot();snapshot.paidExpiresAt=f.now()+1000;await v.prepare(f.scope,passphrase,snapshot);
  f.hook(()=>f.setTime(f.now()+1001));await rejectsCode(v.addDraft(f.capture),'LOCKED');
  await v.prepare(f.scope,passphrase,f.snapshot());assert.equal((await v.read()).drafts.length,0);
});

test('an already sent response may be recorded after lease expiry but cannot unlock a further send',async()=>{
  const f=fixture(),v=f.vault(),snapshot=f.snapshot();snapshot.paidExpiresAt=f.now()+1000;await v.prepare(f.scope,passphrase,snapshot);
  const draft=await v.addDraft(f.capture);await v.freezeSend(draft.id,f.body(draft));
  const outcome=await v.sendFrozen(draft.id,async()=>{f.setTime(f.now()+1001);return{status:'CONFIRMED',serverOrderId:'order-a'};});assert.equal(outcome.status,'CONFIRMED');
  await rejectsCode(v.read(),'EXPIRED');await v.prepare(f.scope,passphrase,f.snapshot());assert.equal((await v.read()).drafts[0].serverOrderId,'order-a');
});

test('observed revocation persists across restart; only explicit fresh prepare renews and preserves pending rows',async()=>{
  const f=fixture(),v=f.vault();await v.prepare(f.scope,passphrase,f.snapshot());const draft=await v.addDraft(f.capture);await v.freezeSend(draft.id,f.body(draft));await v.revoke();
  const b=f.vault();await rejectsCode(b.unlock(f.scope,passphrase),'REVOKED');await b.prepare(f.scope,passphrase,f.snapshot());assert.equal((await b.read()).drafts[0].id,draft.id);
});

test('online denial can durably revoke an expired locked profile without renewing its access',async()=>{
  const f=fixture(),v=f.vault(),snapshot=f.snapshot();snapshot.paidExpiresAt=f.now()+1000;
  await v.prepare(f.scope,passphrase,snapshot);const draft=await v.addDraft(f.capture);v.lock();f.setTime(f.now()+2000);
  await v.revokePrepared(f.scope,passphrase);await rejectsCode(v.unlock(f.scope,passphrase),'REVOKED');
  await v.prepare(f.scope,passphrase,f.snapshot());assert.equal((await v.read()).drafts[0].id,draft.id);
});

test('invalid scope, unassigned customer/product, secret-bearing send body and failed prepare cannot produce durable request',async()=>{
  const f=fixture(),v=f.vault();await rejectsCode(v.prepare({...f.scope,storeId:''},passphrase,f.snapshot()),'INVALID_SCOPE');assert.equal(f.rows.size,0);
  await v.prepare(f.scope,passphrase,f.snapshot());await rejectsCode(v.addDraft({...f.capture,customerId:'other-customer'}),'INVALID_DRAFT');await rejectsCode(v.addDraft({...f.capture,items:[{productId:'other-product',quantity:'1'}]}),'INVALID_DRAFT');
  const draft=await v.addDraft(f.capture);await rejectsCode(v.freezeSend(draft.id,{...f.body(draft),token:'forbidden'}),'INVALID_DRAFT');assert.equal((await v.read()).drafts[0].status,'LOCAL_DRAFT');
  f.deny(true);await rejectsCode(v.prepare(f.scope,passphrase,f.snapshot()),'WRITE_FAILED');await rejectsCode(v.read(),'LOCKED');
});

test('actual IndexedDB adapter fails explicitly when browser persistence is unavailable',async()=>{
  const store=createWholesaleOfflineStorage({indexedDB:null});await rejectsCode(store.get('profile'),'STORAGE_UNAVAILABLE');
});

test('known online denial locks a prepared profile without its passphrase and preserves ciphertext until explicit renewal',async()=>{
  const f=fixture(),v=f.vault();await v.prepare(f.scope,passphrase,f.snapshot());const draft=await v.addDraft(f.capture);await v.freezeSend(draft.id,f.body(draft));v.lock();
  const before=JSON.stringify([...f.rows.values()]);await v.denyPrepared(f.scope);assert.equal(JSON.stringify([...f.rows.values()]),before);
  const restarted=f.vault();await rejectsCode(restarted.unlock(f.scope,passphrase),'REVOKED');
  await rejectsCode(restarted.prepare(f.scope,'Wrong local phrase',f.snapshot()),'UNLOCK_FAILED');await rejectsCode(restarted.unlock(f.scope,passphrase),'REVOKED');
  await restarted.prepare(f.scope,passphrase,f.snapshot());const restored=await restarted.read();assert.equal(restored.drafts[0].id,draft.id);assert.equal(JSON.parse(restored.drafts[0].sendBody).clientOrderId,draft.clientOrderId);
});

test('denial racing authenticated renewal or a normal pending write wins without deleting pending requests',async()=>{
  const f=fixture(),a=f.vault(),b=f.vault();await a.prepare(f.scope,passphrase,f.snapshot());const draft=await a.addDraft(f.capture);
  f.hook(()=>b.denyPrepared(f.scope));await rejectsCode(a.prepare(f.scope,passphrase,f.snapshot()),'REVOKED');await rejectsCode(a.unlock(f.scope,passphrase),'REVOKED');
  await a.prepare(f.scope,passphrase,f.snapshot());f.hook(()=>b.denyPrepared(f.scope));await rejectsCode(a.addDraft(f.capture),'REVOKED');
  await a.prepare(f.scope,passphrase,f.snapshot());assert.equal((await a.read()).drafts.length,1);assert.equal((await a.read()).drafts[0].id,draft.id);
});

test('scoped cross-instance denial notification immediately locks only the matching active vault and carries metadata only',async()=>{
  const channels=new Set(),messages=[];
  const broadcastFactory=()=>{const channel={onmessage:null,postMessage(message){messages.push(structuredClone(message));for(const other of channels)if(other!==channel)other.onmessage?.({data:structuredClone(message)});},close(){channels.delete(channel);}};channels.add(channel);return channel;};
  const f=fixture();let invalidated=0,otherInvalidated=0;
  const a=f.vault({broadcastFactory}),b=f.vault({broadcastFactory,onInvalidated:()=>invalidated++}),c=f.vault({broadcastFactory,onInvalidated:()=>otherInvalidated++});
  await a.prepare(f.scope,passphrase,f.snapshot());await b.unlock(f.scope,passphrase);
  const other={...f.scope,storeId:'store-b'};await c.prepare(other,passphrase,{...f.snapshot(),store:{id:'store-b',name:'Other store'}});
  await a.denyPrepared(f.scope);assert.equal(invalidated,1);assert.equal(otherInvalidated,0);await rejectsCode(b.read(),'LOCKED');assert.equal((await c.read()).snapshot.store.id,'store-b');
  assert.deepEqual(messages,[{version:1,kind:'DENIED',scope:f.scope}]);for(const vault of [a,b,c])vault.dispose();assert.equal(channels.size,0);
});

test('failed public denial persistence still locks this instance and blocks re-unlock without claiming durable success',async()=>{
  const f=fixture(),v=f.vault();await v.prepare(f.scope,passphrase,f.snapshot());f.deny(true);
  await rejectsCode(v.denyPrepared(f.scope),'WRITE_FAILED');await rejectsCode(v.read(),'LOCKED');await rejectsCode(v.unlock(f.scope,passphrase),'REVOKED');
  f.deny(false);await v.denyPrepared(f.scope);const restarted=f.vault();await rejectsCode(restarted.unlock(f.scope,passphrase),'REVOKED');
});

test('real WebCrypto full 5000-product catalogue exceeds 200kB and survives encrypted save, lock and reopen without argument-stack overflow',async()=>{
  const f=fixture(),v=f.vault(),snapshot=f.snapshot();
  snapshot.products=Array.from({length:5000},(_,index)=>({id:'catalog-'+index,name:'ΚΡΥΦΟ-ΠΡΟΪΟΝ-'+String(index).padStart(4,'0')+'-'.repeat(160),sku:'PRIVATE-SKU-'+index,unit:'PIECE'}));
  const prepared=await v.prepare(f.scope,passphrase,snapshot);
  assert.equal(prepared.snapshot.products.length,5000);
  await v.addDraft({customerId:'customer-a',items:[{productId:'catalog-4999',quantity:'2'}],notes:'PRIVATE LARGE CATALOG DRAFT'});
  const [envelope]=[...f.rows.values()];
  assert.ok(Buffer.from(envelope.ciphertext,'base64').byteLength>200000);
  const persisted=JSON.stringify(envelope);
  for(const secret of ['ΚΡΥΦΟ-ΠΡΟΪΟΝ','PRIVATE-SKU','PRIVATE LARGE CATALOG DRAFT',passphrase])assert.equal(persisted.includes(secret),false);
  v.lock();await rejectsCode(v.read(),'LOCKED');
  const restarted=f.vault();const restored=await restarted.unlock(f.scope,passphrase);
  assert.equal(restored.snapshot.products.length,5000);assert.deepEqual(restored.snapshot.products[4999],snapshot.products[4999]);assert.equal(restored.drafts[0].items[0].productId,'catalog-4999');
  await rejectsCode(restarted.prepare(f.scope,passphrase,{...snapshot,products:[...snapshot.products,{id:'excess-product',name:'Excess',unit:'PIECE'}]}),'INVALID_SNAPSHOT');
  assert.equal((await f.vault().unlock(f.scope,passphrase)).snapshot.products.length,5000);
});

test('oversized encoded catalogue is rejected before storage and preserves the previously readable encrypted profile',async()=>{
  const f=fixture(),v=f.vault();await v.prepare(f.scope,passphrase,f.snapshot());const draft=await v.addDraft(f.capture);
  const before=JSON.stringify([...f.rows.values()]),name='密'.repeat(200),snapshot=f.snapshot();
  snapshot.customers=Array.from({length:5000},(_,index)=>({id:'customer-'+index,name,code:name}));
  snapshot.products=Array.from({length:5000},(_,index)=>({id:'product-'+index,name,sku:name,unit:name}));
  await rejectsCode(v.prepare(f.scope,passphrase,snapshot),'CAPACITY_EXCEEDED');
  assert.equal(JSON.stringify([...f.rows.values()]),before);await rejectsCode(v.read(),'LOCKED');
  const restored=await f.vault().unlock(f.scope,passphrase);assert.equal(restored.drafts[0].id,draft.id);assert.equal(restored.snapshot.products.length,1);
});

test('a local draft that exceeds the entire encrypted-state budget cannot overwrite a near-capacity prepared catalogue',async()=>{
  const f=fixture(),v=f.vault(),snapshot=f.snapshot(),wide='密'.repeat(200);
  snapshot.customers=Array.from({length:5000},(_,index)=>({id:index?'customer-'+index:'customer-a',name:wide,code:'密'.repeat(100)}));
  snapshot.products=Array.from({length:5000},(_,index)=>({id:index?'product-'+index:'product-a',name:wide,sku:wide,unit:'PIECE'}));
  const sanitized={identity:{userId:f.scope.userId,companyId:f.scope.companyId,role:f.scope.role},store:snapshot.store,customers:snapshot.customers,products:snapshot.products,preparedAt:f.now(),expiresAt:snapshot.paidExpiresAt,paidExpiresAt:snapshot.paidExpiresAt};
  // Leave fewer bytes than the next real local draft needs, accounting for the
  // GCM tag and base64 expansion. This exercises normal mutate/persist too.
  const startingBytes=Buffer.byteLength(JSON.stringify({snapshot:sanitized,drafts:[],revoked:false,lastWriteAt:f.now()}));
  let remaining=12_000_000-16-400-startingBytes;
  assert.ok(remaining>0);
  for(const customer of snapshot.customers){const extra=Math.min(100,Math.floor(remaining/3));customer.code+='密'.repeat(extra);remaining-=extra*3;if(remaining<3&&customer.code.length+remaining<=200){customer.code+='X'.repeat(remaining);remaining=0;}if(!remaining)break;}
  assert.equal(remaining,0);await v.prepare(f.scope,passphrase,snapshot);
  const before=[...f.rows.values()][0].ciphertext;
  assert.ok(before.length>15_000_000&&before.length<=16_000_000);
  await rejectsCode(v.addDraft({...f.capture,notes:'X'.repeat(2000)}),'CAPACITY_EXCEEDED');
  assert.equal([...f.rows.values()][0].ciphertext,before);assert.equal((await v.read()).drafts.length,0);
  v.lock();assert.equal((await f.vault().unlock(f.scope,passphrase)).snapshot.products.length,5000);
});
