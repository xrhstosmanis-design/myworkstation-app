import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createWholesaleOfflineVault} from '../../client/src/components/wholesale/wholesale-offline-vault.mjs';
import {fetchOfflineSnapshot,reviewOfflineDraft,sendOfflineFrozen} from '../../client/src/components/wholesale/wholesale-offline-api.mjs';
import {sellerQuoteView} from '../src/routes/wholesale-sellers.js';

const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/wholesale/WholesaleOfflinePanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
const component={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),component,component.exports);
const session={identity:{userId:'owner-a',companyId:'company-a',role:'OWNER'},expiresAt:Date.now()+3600000};
const scope={...session.identity,storeId:'store-a'},paid={companyId:'company-a',moduleKey:'WHOLESALE_B2B',enabled:true,expiresAt:null},secret='local-device-secret';
const snapshot={identity:session.identity,store:{id:'store-a',name:'Prepared A'},paidExpiresAt:Date.now()+3600000,customers:[{id:'customer-a',name:'Customer A',code:'A'}],products:[{id:'product-a',name:'Juice',sku:'JUICE',unit:'PIECE'}]};
const quote={quoteId:'a'.repeat(64),currency:'EUR',customerId:'customer-a',storeId:'store-a',customerName:'Customer A',items:[{productId:'product-a',name:'Juice',quantity:'2',netTotal:'10.00',vatTotal:'1.30',grossTotal:'11.30'}],totals:{net:'10.00',vat:'1.30',gross:'11.30'}};
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
function memoryStorage(){const rows=new Map(),markers=new Map();return {rows,markers,get:async key=>clone(rows.get(key)||null),getRecord:async key=>({envelope:clone(rows.get(key)||null),denied:markers.get(key)?.denied===true,denialVersion:markers.get(key)?.denialVersion||0}),isDenied:async key=>markers.get(key)?.denied===true,deny:async key=>{const marker={denied:true,denialVersion:(markers.get(key)?.denialVersion||0)+1};markers.set(key,marker);return marker},list:async()=>[...rows.values()].map(clone),compareAndSwap:async(key,version,value,{isCurrent=()=>true,renew=false,expectedDenialVersion}={})=>{if(!isCurrent())throw Object.assign(Error('locked'),{code:'LOCKED'});const marker=markers.get(key);if(marker?.denied&&!renew||renew&&(marker?.denialVersion||0)!==expectedDenialVersion)throw Object.assign(Error('revoked'),{code:'REVOKED'});if((rows.get(key)?.version??null)!==version)return false;rows.set(key,clone(value));if(renew)markers.set(key,{denied:false,denialVersion:marker?.denialVersion||0});return true},close:async()=>{}}}
const locks={request:async(name,options,callback)=>callback({name})};
const factory=storage=>options=>createWholesaleOfflineVault({storage,crypto:webcrypto,lockManager:locks,...options});
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes});return {promise,resolve}};
function backend(extra){const calls=[];return {calls,api:async(path,options={})=>{
 calls.push({path,options});const custom=extra?.(path,options);if(custom!==undefined)return await custom;
 if(path==='/api/wholesale/capabilities')return paid;
 if(path==='/api/wholesale/workspace?storeId=store-a')return {user:{id:'owner-a',role:'OWNER'},company:{id:'company-a'},storeId:'store-a',stores:[snapshot.store],access:paid};
 if(path==='/api/wholesale/customers?storeId=store-a')return {items:[{...snapshot.customers[0],taxId:'PRIVATE TAX',address:'PRIVATE ADDRESS'}]};
 if(path.startsWith('/api/wholesale/products?'))return {items:[{...snapshot.products[0],salePrice:999,costPrice:88}],total:1};
 if(path==='/api/wholesale/quotes')return quote;
 throw Error('Unexpected endpoint '+path);
 }}}
async function mounted(run,{storage=memoryStorage(),api=backend().api,ensureOfflineShell=async()=>{},initial={}}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/wholesale'}),keys=['window','document','navigator','HTMLElement','Node','Event','localStorage','sessionStorage','IS_REACT_ACT_ENVIRONMENT'];const before=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));
 let props={session,storeId:'store-a',access:paid,api,vaultFactory:factory(storage),ensureOfflineShell,...initial};
 const render=()=>act(async()=>root.render(React.createElement(component.exports.default,props)));
 const click=text=>act(async()=>{const button=[...document.querySelectorAll('button')].find(row=>row.textContent===text);assert.ok(button,text);assert.equal(button.disabled,false,text);button.click()});
 const change=(label,value)=>act(async()=>{const element=document.querySelector('[aria-label="'+label+'"]');assert.ok(element,label);const type=element.tagName==='SELECT'?'HTMLSelectElement':'HTMLInputElement';Object.getOwnPropertyDescriptor(dom.window[type].prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));if(element.tagName!=='SELECT')element.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
 const settle=async()=>{for(let tick=0;tick<300;tick++){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10))});if(!document.body.textContent.includes('Επεξεργασία…'))return}assert.fail('Mounted operation did not settle')};
 try{await render();await run({dom,storage,act,render,click,change,settle,rerender:async patch=>{props={...props,...patch};await render()},text:()=>document.body.textContent})}finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value]of before)value?Object.defineProperty(globalThis,key,value):delete globalThis[key]}
}
async function unlock(ctx){await ctx.click('Χωρίς internet · τοπικά πρόχειρα');const select=document.querySelector('[aria-label="Προετοιμασμένο κατάστημα"]');await ctx.change('Προετοιμασμένο κατάστημα',select.options[1].value);await ctx.change('Τοπικός κωδικός συσκευής',secret);await ctx.click('Ξεκλείδωμα τοπικών προχείρων');await ctx.settle()}

test('online snapshot uses explicit selected store, strips prices/private fields and refuses incomplete pagination',async()=>{
 const server=backend(),result=await fetchOfflineSnapshot(server.api,session,'store-a');
 assert.deepEqual(result.customers,snapshot.customers);assert.deepEqual(result.products,snapshot.products);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);assert.equal(JSON.stringify(result).includes('999'),false);
 assert.ok(server.calls.every(call=>!call.path.includes('scope=company')));assert.ok(server.calls.filter(call=>call.path.includes('/products?')).every(call=>call.path.includes('storeId=store-a')));
 await assert.rejects(fetchOfflineSnapshot(backend(path=>path.startsWith('/api/wholesale/products?')?{items:[],total:2}:undefined).api,session,'store-a'),/ολόκληρος/);
 await assert.rejects(fetchOfflineSnapshot(server.api,session,''),/συγκεκριμένο/);
});
test('seller preparation and current quote bind original personal user/company and exact assigned store',async()=>{
 const seller={...session,identity:{userId:'seller-a',companyId:'company-a',role:'EMPLOYEE'}},calls=[];
 const api=async(path,options={})=>{calls.push({path,options});if(path==='/api/wholesale/capabilities')return paid;if(path==='/api/wholesale/sellers/context')return {user:{id:'seller-a'},companyId:'company-a',stores:[snapshot.store]};if(path.includes('/customers?'))return {items:snapshot.customers,total:1};if(path.includes('/catalog?'))return {items:snapshot.products,total:1};if(path.endsWith('/quotes'))return quote;throw Error(path)};
 await fetchOfflineSnapshot(api,seller,'store-a');await reviewOfflineDraft(api,seller,{...seller.identity,storeId:'store-a'},{customerId:'customer-a',items:[{productId:'product-a',quantity:'2'}]});
 for(const call of calls.filter(row=>/customers|catalog|quotes/.test(row.path)))assert.deepEqual(call.options.headers,{'X-Wholesale-Seller':'seller-a','X-Wholesale-Company':'company-a',...(call.path.endsWith('/quotes')?{'x-mws-store-generations':JSON.stringify({'store-a':'0'})}:{})});
 await assert.rejects(reviewOfflineDraft(api,session,{...seller.identity,storeId:'store-a'},{customerId:'customer-a',items:[]}),/αρχικό/);
});
test('seller first acceptance and idempotent replay consume the actual nested sellerQuoteView projection',async()=>{
 const seller={...session,identity:{userId:'seller-a',companyId:'company-a',role:'EMPLOYEE'}},sellerScope={...seller.identity,storeId:'store-a'},clientOrderId=webcrypto.randomUUID(),bodyString=JSON.stringify({clientOrderId,storeId:'store-a',customerId:'customer-a',items:[{productId:'product-a',quantity:'2'}],notes:'Frozen seller request',quoteId:quote.quoteId});
 for(const replayed of [false,true]){
  const calls=[],projected=sellerQuoteView(quote),accepted={orderId:'seller-order-a',status:'SUBMITTED',replayed,order:{id:'seller-order-a',status:'SUBMITTED',clientOrderId,createdAt:'2026-10-20T00:00:00.000Z',notes:'Frozen seller request',snapshot:projected}};
  assert.equal(accepted.order.storeId,undefined);assert.equal(accepted.order.customerId,undefined);
  const api=async(path,options={})=>{calls.push({path,options});if(path==='/api/wholesale/capabilities')return paid;if(path==='/api/wholesale/sellers/context')return {user:{id:'seller-a'},companyId:'company-a',stores:[snapshot.store]};if(path==='/api/wholesale/sellers/orders')return accepted;throw Error(path)};
  assert.equal((await sendOfflineFrozen(api,seller,sellerScope,bodyString)).status,'CONFIRMED');const writes=calls.filter(row=>row.options.method==='POST');assert.equal(writes.length,1);assert.equal(writes[0].options.body,bodyString);assert.deepEqual(writes[0].options.headers,{'X-Wholesale-Seller':'seller-a','X-Wholesale-Company':'company-a','x-mws-store-generations':JSON.stringify({'store-a':'0'})});
 }
});
test('seller acceptance refuses wrong nested store/customer/quote and original request key despite plausible direct spoof fields',async()=>{
 const seller={...session,identity:{userId:'seller-a',companyId:'company-a',role:'EMPLOYEE'}},sellerScope={...seller.identity,storeId:'store-a'},clientOrderId=webcrypto.randomUUID(),bodyString=JSON.stringify({clientOrderId,storeId:'store-a',customerId:'customer-a',items:[{productId:'product-a',quantity:'2'}],notes:'',quoteId:quote.quoteId});
 for(const corrupt of [order=>{order.snapshot.storeId='wrong-store'},order=>{order.snapshot.customerId='wrong-customer'},order=>{order.snapshot.quoteId='b'.repeat(64)},order=>{order.clientOrderId=webcrypto.randomUUID()},order=>{order.status='CANCELLED'},order=>{delete order.snapshot}]){
  const accepted={orderId:'seller-order-a',status:'SUBMITTED',replayed:true,order:{id:'seller-order-a',status:'SUBMITTED',clientOrderId,storeId:'store-a',customerId:'customer-a',quoteId:quote.quoteId,snapshot:sellerQuoteView(quote)}};corrupt(accepted.order);
  const api=async path=>{if(path==='/api/wholesale/capabilities')return paid;if(path==='/api/wholesale/sellers/context')return {user:{id:'seller-a'},companyId:'company-a',stores:[snapshot.store]};if(path==='/api/wholesale/sellers/orders')return accepted;throw Error(path)};
  await assert.rejects(sendOfflineFrozen(api,seller,sellerScope,bodyString),/δεν επιβεβαιώθηκε/);
 }
});
test('snapshot adapter rejects a changed principal or role between first and final online verification',async()=>{
 for(const patch of [{userId:'other-user'},{companyId:'other-company'},{role:'EMPLOYEE'}]){
  const current=clone(session);let downloaded=false;
  const api=async path=>{
   if(path==='/api/wholesale/capabilities')return {...paid,companyId:current.identity.companyId};
   if(path==='/api/wholesale/workspace?storeId=store-a')return {user:{id:current.identity.userId,role:current.identity.role},company:{id:current.identity.companyId},storeId:'store-a',stores:[snapshot.store],access:{...paid,companyId:current.identity.companyId}};
   if(path==='/api/wholesale/sellers/context')return {user:{id:current.identity.userId},companyId:current.identity.companyId,stores:[snapshot.store]};
   if(path==='/api/wholesale/customers?storeId=store-a')return {items:snapshot.customers};
   if(path.startsWith('/api/wholesale/products?')){downloaded=true;current.identity={...current.identity,...patch};return {items:snapshot.products,total:1}}
   throw Error(path);
  };
  await assert.rejects(fetchOfflineSnapshot(api,current,'store-a'),/άλλαξε/);assert.equal(downloaded,true);
 }
 const server=backend(path=>path==='/api/wholesale/workspace?storeId=store-a'?{user:{id:'owner-a',role:'OWNER'},company:{id:'company-a'},storeId:'store-b',stores:[{id:'store-b',name:'Wrong store'}],access:paid}:undefined);
 await assert.rejects(fetchOfflineSnapshot(server.api,session,'store-a'),/επιβεβαιώθηκε/);
});
test('collapsed panel reads nothing and shell failure prevents misleading offline readiness',async()=>{
 const server=backend();let opened=0;
 await mounted(async ctx=>{assert.equal(server.calls.length,0);assert.equal(opened,0);await ctx.click('Χωρίς internet · τοπικά πρόχειρα');await ctx.change('Τοπικός κωδικός συσκευής',secret);await ctx.click('Προετοιμασία / ανανέωση online');assert.match(ctx.text(),/shell unavailable/);assert.equal(server.calls.length,0);assert.equal(ctx.storage.rows.size,0)},{api:server.api,ensureOfflineShell:async()=>{throw Error('shell unavailable')},initial:{vaultFactory:()=>{opened++;return factory(memoryStorage())()}}});
});
test('actual encrypted drafts unlock after reload, show no offline prices, and explicit unknown retry keeps exact persisted body',async()=>{
 const storage=memoryStorage(),vault=factory(storage)();await vault.prepare(scope,secret,{...snapshot,originGeneration:'7'});await vault.addDraft({customerId:'customer-a',items:[{productId:'product-a',quantity:'2'}],notes:'One original'});vault.dispose();
 let writes=0;const bodies=[],server=backend((path,options)=>{if(path==='/api/wholesale/orders'){writes++;bodies.push(options.body);if(writes===1)throw Error('lost acknowledgement');const expected=JSON.parse(options.body);return {orderId:'order-a',status:'SUBMITTED',order:{id:'order-a',clientOrderId:expected.clientOrderId,storeId:'store-a',customerId:'customer-a'}}}});
 await mounted(async ctx=>{await unlock(ctx);assert.match(ctx.text(),/Τοπικό πρόχειρο/);assert.doesNotMatch(ctx.text(),/11,30/);assert.equal(server.calls.length,0);await ctx.click('Online έλεγχος και τρέχουσες τιμές');await ctx.settle();assert.match(ctx.text(),/11,30/);assert.equal(writes,0);await ctx.click('Αποδέχομαι τις τιμές και υποβάλλω μία φορά');await ctx.settle();assert.equal(writes,1);assert.match(ctx.text(),/Άγνωστο αποτέλεσμα/);assert.equal(JSON.stringify([...storage.rows.values()]).includes('One original'),false)},{storage,api:server.api});
 await mounted(async ctx=>{await unlock(ctx);assert.match(ctx.text(),/Άγνωστο αποτέλεσμα/);await ctx.click('Επανάληψη ακριβώς του αρχικού αιτήματος');await ctx.settle();assert.equal(writes,2);assert.equal(bodies[0],bodies[1]);assert.match(ctx.text(),/Επιβεβαιωμένο από server/);assert.equal(document.querySelector('[aria-label="Αποδοχή τρεχουσών τιμών"]'),null)},{storage,api:server.api});
 for(const call of server.calls.filter(call=>call.options.method==='POST'))assert.equal(JSON.parse(call.options.headers['x-mws-store-generations'])['store-a'],'7','Actual panel must pass the persisted draft origin on quote and both send attempts after remount');
});
test('main submission lock and actor/store switch clear plaintext and block stale quote',async()=>{
 const storage=memoryStorage(),vault=factory(storage)();await vault.prepare(scope,secret,snapshot);await vault.addDraft({customerId:'customer-a',items:[{productId:'product-a',quantity:'2'}],notes:'private draft'});vault.dispose();
 const delayed=deferred(),server=backend(path=>path==='/api/wholesale/quotes'?delayed.promise:undefined);
 await mounted(async ctx=>{await unlock(ctx);assert.match(ctx.text(),/private draft/);await ctx.click('Online έλεγχος και τρέχουσες τιμές');await ctx.rerender({session:{...session,identity:{...session.identity,userId:'other'}}});await ctx.act(async()=>delayed.resolve(quote));assert.doesNotMatch(ctx.text(),/private draft|11,30/);assert.equal(document.querySelector('[aria-label="Προετοιμασμένο κατάστημα"]').options.length,1);await ctx.rerender({locked:true});assert.equal([...document.querySelectorAll('button')].find(row=>row.textContent==='Χωρίς internet · τοπικά πρόχειρα').disabled,true);assert.equal(server.calls.filter(row=>row.path.endsWith('/orders')).length,0)},{storage,api:server.api});
});
test('explicit prepare and actual mounted capture persist encrypted local state only; empty outer store requires explicit profile unlock',async()=>{
 const server=backend(),storage=memoryStorage();
 await mounted(async ctx=>{
  await ctx.click('Χωρίς internet · τοπικά πρόχειρα');await ctx.change('Τοπικός κωδικός συσκευής',secret);await ctx.click('Προετοιμασία / ανανέωση online');await ctx.settle();assert.match(ctx.text(),/Η συσκευή προετοιμάστηκε/);
  await ctx.change('Τοπικός πελάτης','customer-a');await ctx.change('Τοπικό είδος','product-a');await ctx.change('Τοπική ποσότητα','2');await ctx.click('Προσθήκη στο πρόχειρο');await ctx.change('Τοπική σημείωση','Secret capture');await ctx.click('Κρυπτογραφημένη αποθήκευση προχείρου');await ctx.settle();assert.match(ctx.text(),/Αποθηκεύτηκε κρυπτογραφημένο/);assert.match(ctx.text(),/Τοπικό πρόχειρο/);assert.equal(server.calls.filter(row=>row.options.method==='POST').length,0);assert.equal(JSON.stringify([...storage.rows.values()]).includes('Secret capture'),false);
  await ctx.rerender({session:null,storeId:'',access:null});assert.doesNotMatch(ctx.text(),/Secret capture/);assert.ok(document.querySelector('[aria-label="Προετοιμασμένο κατάστημα"]'));assert.equal(document.querySelector('[aria-label="Προετοιμασμένο κατάστημα"]').value,'');const value=document.querySelector('[aria-label="Προετοιμασμένο κατάστημα"]').options[1].value;await ctx.change('Προετοιμασμένο κατάστημα',value);await ctx.change('Τοπικός κωδικός συσκευής',secret);await ctx.click('Ξεκλείδωμα τοπικών προχείρων');await ctx.settle();assert.match(ctx.text(),/Secret capture/);assert.equal(server.calls.filter(row=>row.options.method==='POST').length,0);
 },{storage,api:server.api});
});
test('changed current quote needs renewed explicit acceptance; known rejection preserves stable key and disables retry',async()=>{
 const storage=memoryStorage(),vault=factory(storage)();await vault.prepare(scope,secret,snapshot);const draft=await vault.addDraft({customerId:'customer-a',items:[{productId:'product-a',quantity:'2'}],notes:''});vault.dispose();let quotes=0,writes=0;
 const updated={...quote,quoteId:'b'.repeat(64),totals:{net:'12.00',vat:'1.56',gross:'13.56'},items:[{...quote.items[0],netTotal:'12.00',vatTotal:'1.56',grossTotal:'13.56'}]},server=backend(path=>{if(path==='/api/wholesale/quotes')return ++quotes===1?quote:updated;if(path==='/api/wholesale/orders'){writes++;throw Object.assign(Error('changed price'),{status:409,code:'PRICE_CHANGED'})}});
 await mounted(async ctx=>{await unlock(ctx);await ctx.click('Online έλεγχος και τρέχουσες τιμές');await ctx.settle();assert.match(ctx.text(),/11,30/);await ctx.click('Αποδέχομαι τις τιμές και υποβάλλω μία φορά');await ctx.settle();assert.equal(writes,0);assert.match(ctx.text(),/Οι τιμές άλλαξαν/);assert.match(ctx.text(),/13,56/);await ctx.click('Αποδέχομαι τις τιμές και υποβάλλω μία φορά');await ctx.settle();assert.equal(writes,1);assert.match(ctx.text(),/Απόρριψη/);assert.equal([...document.querySelectorAll('button')].some(row=>row.textContent==='Επανάληψη ακριβώς του αρχικού αιτήματος'),false)},{storage,api:server.api});
 const reopened=factory(storage)();await reopened.unlock(scope,secret);const frozen=(await reopened.read()).drafts[0];assert.equal(frozen.clientOrderId,draft.clientOrderId);assert.equal(frozen.status,'REJECTED');assert.equal(JSON.parse(frozen.sendBody).quoteId,updated.quoteId);reopened.dispose();
});
test('observed online grant denial revokes prepared encrypted profile until explicit authorized renewal',async()=>{
 const storage=memoryStorage(),vault=factory(storage)();await vault.prepare(scope,secret,snapshot);vault.dispose();const server=backend(path=>path==='/api/wholesale/capabilities'?{...paid,enabled:false}:undefined);
 await mounted(async ctx=>{await ctx.click('Χωρίς internet · τοπικά πρόχειρα');await ctx.change('Τοπικός κωδικός συσκευής',secret);await ctx.click('Προετοιμασία / ανανέωση online');await ctx.settle();assert.match(ctx.text(),/δεν είναι ενεργό/);assert.equal(document.querySelector('[aria-label="Τοπικός πελάτης"]'),null)},{storage,api:server.api});
 const reopened=factory(storage)();await assert.rejects(reopened.unlock(scope,secret),error=>error.code==='REVOKED');await reopened.prepare(scope,secret,snapshot);assert.equal((await reopened.read()).snapshot.store.id,'store-a');reopened.dispose();
});
test('authoritative parent denial locks previously unlocked snapshot durably; positive refresh plus explicit preparation preserves frozen original',async()=>{
 const storage=memoryStorage(),vault=factory(storage)();await vault.prepare(scope,secret,snapshot);const draft=await vault.addDraft({customerId:'customer-a',items:[{productId:'product-a',quantity:'2'}],notes:'Frozen original'});await vault.freezeSend(draft.id,{clientOrderId:draft.clientOrderId,storeId:'store-a',customerId:draft.customerId,items:draft.items,notes:draft.notes,quoteId:quote.quoteId});vault.dispose();const server=backend();
 await mounted(async ctx=>{
  await unlock(ctx);assert.match(ctx.text(),/Frozen original/);await ctx.rerender({access:null,storeId:'',accessDenial:{identity:session.identity,storeId:null,serial:1}});await ctx.settle();assert.doesNotMatch(ctx.text(),/Frozen original/);assert.match(ctx.text(),/ανακλήθηκε/);
  const select=document.querySelector('[aria-label="Προετοιμασμένο κατάστημα"]');assert.equal(select.options[1].disabled,true);await ctx.change('Προετοιμασμένο κατάστημα',select.options[1].value);assert.equal([...document.querySelectorAll('button')].find(row=>row.textContent==='Ξεκλείδωμα τοπικών προχείρων').disabled,true);
  const isolated=factory(storage)();await assert.rejects(isolated.unlock(scope,secret),error=>error.code==='REVOKED');isolated.dispose();
  await ctx.rerender({access:paid,storeId:'store-a',accessDenial:null});await ctx.change('Τοπικός κωδικός συσκευής',secret);await ctx.click('Προετοιμασία / ανανέωση online');await ctx.settle();assert.match(ctx.text(),/Frozen original/);assert.match(ctx.text(),/Αρχικό αίτημα κλειδωμένο/);assert.match(ctx.text(),new RegExp(draft.clientOrderId));assert.equal(server.calls.filter(row=>row.path.endsWith('/orders')).length,0);
 },{storage,api:server.api});
});
test('parent denial write failure remains visible and blocks matching profile unlock while observed denial remains',async()=>{
 const storage=memoryStorage(),vault=factory(storage)();await vault.prepare(scope,secret,snapshot);vault.dispose();storage.deny=async()=>{throw Error('quota failure')};
 await mounted(async ctx=>{await unlock(ctx);await ctx.rerender({accessDenial:{identity:session.identity,storeId:'store-a',serial:2}});await ctx.settle();assert.match(ctx.text(),/Δεν επιβεβαιώθηκε η μόνιμη ανάκληση/);assert.equal(document.querySelector('[aria-label="Τοπικός πελάτης"]'),null);assert.equal(document.querySelector('[aria-label="Προετοιμασμένο κατάστημα"]').options[1].disabled,true)},{storage});
});
test('real vault broadcast invalidation clears mounted matching plaintext but preserves a different store view',async()=>{
 const storage=memoryStorage(),channels=new Set(),broadcastFactory=()=>{const channel={onmessage:null,postMessage(data){for(const other of channels)if(other!==channel)other.onmessage?.({data})},close(){channels.delete(channel)}};channels.add(channel);return channel};
 const create=options=>createWholesaleOfflineVault({storage,crypto:webcrypto,lockManager:locks,broadcastFactory,...options}),seed=create();await seed.prepare(scope,secret,snapshot);await seed.addDraft({customerId:'customer-a',items:[{productId:'product-a',quantity:'2'}],notes:'Scoped plaintext'});seed.dispose();const peer=create();
 try{await mounted(async ctx=>{await unlock(ctx);assert.match(ctx.text(),/Scoped plaintext/);await ctx.act(async()=>peer.denyPrepared({...scope,storeId:'different-store'}));assert.match(ctx.text(),/Scoped plaintext/);await ctx.act(async()=>peer.denyPrepared(scope));assert.doesNotMatch(ctx.text(),/Scoped plaintext/);assert.match(ctx.text(),/ανακλήθηκε/);assert.equal(document.querySelector('[aria-label="Τοπικός πελάτης"]'),null)},{storage,initial:{vaultFactory:create}})}finally{peer.dispose()}
});
test('mounted local edit keeps the original UUID, clears old price acceptance and cannot edit frozen requests',async()=>{
 const storage=memoryStorage(),vault=factory(storage)();await vault.prepare(scope,secret,snapshot);const local=await vault.addDraft({customerId:'customer-a',items:[{productId:'product-a',quantity:'2'}],notes:'Initial local'}),frozen=await vault.addDraft({customerId:'customer-a',items:[{productId:'product-a',quantity:'2'}],notes:'Immutable frozen'});await vault.freezeSend(frozen.id,{clientOrderId:frozen.clientOrderId,storeId:'store-a',customerId:frozen.customerId,items:frozen.items,notes:frozen.notes,quoteId:quote.quoteId});const frozenBody=(await vault.read()).drafts.find(row=>row.id===frozen.id).sendBody;vault.dispose();const server=backend();
 await mounted(async ctx=>{
  await unlock(ctx);assert.equal([...document.querySelectorAll('button')].filter(row=>row.textContent==='Επεξεργασία τοπικού προχείρου').length,1);await ctx.click('Online έλεγχος και τρέχουσες τιμές');await ctx.settle();assert.ok(document.querySelector('[aria-label="Αποδοχή τρεχουσών τιμών"]'));await ctx.click('Επεξεργασία τοπικού προχείρου');assert.equal(document.querySelector('[aria-label="Αποδοχή τρεχουσών τιμών"]'),null);assert.equal(document.querySelector('[aria-label="Τοπική σημείωση"]').value,'Initial local');assert.equal([...document.querySelectorAll('button')].find(row=>row.textContent==='Online έλεγχος και τρέχουσες τιμές').disabled,true);
  await ctx.change('Τοπικό είδος','product-a');await ctx.change('Τοπική ποσότητα','3');await ctx.click('Προσθήκη στο πρόχειρο');await ctx.change('Τοπική σημείωση','Corrected local');await ctx.click('Αποθήκευση αλλαγών στο ίδιο πρόχειρο');await ctx.settle();assert.match(ctx.text(),/Corrected local/);assert.match(ctx.text(),new RegExp(local.clientOrderId));assert.match(ctx.text(),new RegExp(frozen.clientOrderId));
  await ctx.click('Επεξεργασία τοπικού προχείρου');await ctx.change('Τοπική σημείωση','Unsaved cancelled');await ctx.click('Ακύρωση τοπικής επεξεργασίας');assert.equal(document.querySelector('[aria-label="Τοπική σημείωση"]').value,'');assert.doesNotMatch(ctx.text(),/Unsaved cancelled/);assert.equal(server.calls.filter(row=>row.path.endsWith('/orders')).length,0);
 },{storage,api:server.api});
 const inspect=factory(storage)();await inspect.unlock(scope,secret);const saved=(await inspect.read()).drafts;assert.equal(saved.length,2);const edited=saved.find(row=>row.id===local.id);assert.equal(edited.clientOrderId,local.clientOrderId);assert.equal(edited.status,'LOCAL_DRAFT');assert.equal(edited.notes,'Corrected local');assert.equal(edited.items[0].quantity,'3');assert.equal(saved.find(row=>row.id===frozen.id).sendBody,frozenBody);inspect.dispose();
});
