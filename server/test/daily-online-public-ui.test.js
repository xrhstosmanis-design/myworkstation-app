import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../../client/public/kat/app.html',import.meta.url),'utf8'),registrationJS=await readFile(new URL('../../client/public/kat/member-registration.js',import.meta.url),'utf8');
const flush=()=>new Promise(r=>setTimeout(r,10));
test('real public page registers once, scopes session and submits all room fields with current cart price',async()=>{
 const requests=[],alerts=[];let price=10,member=null,releaseRegistration;
 const loaded=html.replace('<script src="/kat/member-registration.js"></script>',`<script>${registrationJS}</script>`);
 const dom=new JSDOM(loaded,{url:'https://isolated.invalid/online/daily-bite',runScripts:'dangerously',beforeParse(window){
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true};window.HTMLDialogElement.prototype.close=function(){this.open=false};window.alert=msg=>alerts.push(msg);
  window.sessionStorage.setItem('mwsOnlineMemberToken','foreign-token');
  window.fetch=async(url,opts={})=>{
   requests.push({url:String(url),opts});const path=String(url);
   if(path.endsWith('/member-registration')){await new Promise(resolve=>{releaseRegistration=resolve});return{ok:true,json:async()=>({message:'Η αίτηση περιμένει έγκριση.'})}}
   if(path.endsWith('/member-session')){member={memberType:'STAFF',discountPercent:20};price=8;return{ok:true,json:async()=>({token:'fictional-own-token',member})}}
   if(path.endsWith('/catalog-modifiers'))return{ok:true,json:async()=>({store:{name:'DAILY BITE'},member,settings:{brandName:'DAILY BITE',deliveryEnabled:true,pickupEnabled:true,deliveryFee:0},modifierGroups:[],products:[{id:'coffee',name:'FREDDO ESPRESSO',available:true,onlinePrice:price,storePrice:10,modifierGroupIds:[]}]})};
   if(path.endsWith('/orders-with-modifiers'))return{ok:true,json:async()=>({order:{orderNumber:'ONL-FICTIONAL',total:8}})};
   return{ok:true,json:async()=>({})};
  };
 }});
 try{
  await flush();const d=dom.window.document,w=dom.window;
  assert.equal(requests[0].opts.headers?.Authorization,undefined);assert.equal(d.title,'DAILY BITE · Online Παραγγελίες');
  d.getElementById('memberRegister').click();const form=d.getElementById('registrationForm');
  for(const [name,value] of Object.entries({fullName:'Εικονικό Μέλος',phone:'6900000001',memberType:'STAFF',pin:'123456',pinConfirmation:'123456'}))form.elements.namedItem(name).value=value;
  const submit=()=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));submit();submit();await flush();
  assert.equal(requests.filter(r=>r.url.endsWith('/member-registration')).length,1);assert.equal(d.getElementById('registrationSubmit').disabled,true);
  releaseRegistration();await flush();assert.match(d.getElementById('registrationMessage').textContent,/έγκριση/);assert.equal(w.sessionStorage.getItem('mwsOnlineMemberToken:daily-bite'),null);assert.equal(form.elements.namedItem('pin').value,'');
  d.getElementById('memberLogin').click();d.getElementById('memberPhone').value='6900000001';d.getElementById('memberPin').value='123456';d.getElementById('memberSubmit').click();await flush();
  assert.equal(w.sessionStorage.getItem('mwsOnlineMemberToken:daily-bite'),'fictional-own-token');assert.match(d.getElementById('pricingNote').textContent,/20%/);
  await w.fetch('/api/public/online/other/catalog-modifiers');await w.fetch('https://external.invalid/api/public/online/daily-bite/catalog-modifiers');
  for(const r of requests.slice(-2))assert.equal(r.opts.headers?.Authorization,undefined);
  d.querySelector('#products button').click();d.getElementById('checkout').click();
  for(const [id,value] of Object.entries({name:'Εικονικός Πελάτης',phone:'6900000002',building:'Πτέρυγα Α',floor:'2',department:'Κλινική LAB',room:'204'}))d.getElementById(id).value=value;
  d.getElementById('submitOrder').click();await flush();const posted=requests.find(r=>r.url.endsWith('/orders-with-modifiers'));assert.ok(posted);
  const payload=JSON.parse(posted.opts.body);assert.deepEqual([payload.floor,payload.department,payload.room],['2','Κλινική LAB','204']);assert.equal(payload.expectedSubtotal,8);assert.equal(posted.opts.headers.Authorization,'Bearer fictional-own-token');
  member=null;await w.loadCatalog();assert.equal(w.sessionStorage.getItem('mwsOnlineMemberToken:daily-bite'),null);
  assert.equal(alerts.length,1);
 }finally{dom.window.close()}
});

test('saved member survives page reload because session wrapper initializes before first catalog request',async()=>{
 const loaded=html.replace('<script src="/kat/member-registration.js"></script>',`<script>${registrationJS}</script>`);let first;
 const dom=new JSDOM(loaded,{url:'https://isolated.invalid/online/daily-bite',runScripts:'dangerously',beforeParse(w){
  w.sessionStorage.setItem('mwsOnlineMemberToken:daily-bite','saved-own-token');
  w.fetch=async(url,opts)=>{first=opts;return{ok:true,json:async()=>({member:{memberType:'STAFF',discountPercent:0},products:[],settings:{},modifierGroups:[]})}};
 }});
 try{await flush();assert.equal(first.headers.Authorization,'Bearer saved-own-token');assert.equal(dom.window.sessionStorage.getItem('mwsOnlineMemberToken:daily-bite'),'saved-own-token')}finally{dom.window.close()}
});
