import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {portalLogin,portalPassword,portalCookie,portalToken,requirePortalOrigin,requirePortalCsrf,authenticatePortalSession,describePortalSession,createPortalLoginLimiter} from '../src/lib/wholesale-portal-auth.js';
import {authorizeWholesalePrincipal,authorizeWholesaleQuoteProducts,assertWholesalePrincipal} from '../src/lib/wholesale-principal.js';
import {createWholesalePortalRouter,publicWholesaleQuote} from '../src/routes/wholesale-portal.js';

const token='b2bs_'+'A'.repeat(43),hash=crypto.createHash('sha256').update(token).digest('hex');
function fixture(){
  const state={active:true,published:true,now:new Date('2026-10-18T10:00:00Z'),scope:{accountId:'account-a',login:'alice',companyId:'company-a',customerId:'customer-a',storeId:'store-a',siteId:'site-a',slug:'company-a',siteName:'Company A',customerName:'Customer A',storeName:'Store A',sessionId:'session-a',expiresAt:new Date('2026-10-18T18:00:00Z')},calls:[]};
  const db={$queryRaw:async(first,...rest)=>{
    const sql=Array.isArray(first)?first.join('?'):first.sql,values=Array.isArray(first)?rest:first.values;state.calls.push({sql,values});
    if(sql.includes('clock_timestamp() AS "now"'))return [{now:state.now}];
    if(sql.includes('JOIN "WholesalePortalAccount"'))return state.active?[{...state.scope}]:[];
    if(sql.includes('FROM "WholesalePortalSession"'))return values[0]===hash?[{id:'session-a'}]:[];
    if(sql.includes('FROM "WholesalePortalPublication"'))return state.published?[{productId:'product-a'}]:[];
    throw Error('Unexpected SQL '+sql);
  }};return {db,state};
}
const input={customerId:'customer-a',storeId:'store-a',items:[{productId:'product-a',quantity:'1'}]};

test('portal credentials normalize login and refuse bcrypt UTF8 truncation aliases',()=>{
  assert.equal(portalLogin.parse(' ALICE@Example.COM '),'alice@example.com');
  assert.equal(portalPassword.parse('A'.repeat(72)),'A'.repeat(72));
  for(const password of ['short','A'.repeat(73),'😀'.repeat(19)])assert.equal(portalPassword.safeParse(password).success,false);
  for(const login of ['../alice','a b','a','x'.repeat(161)])assert.equal(portalLogin.safeParse(login).success,false);
});

test('opaque portal cookies are Secure HttpOnly Strict scoped and JWT/duplicate cookies rejected',()=>{
  const cookie=portalCookie(token,'company-a');assert.match(cookie,/^__Secure-mws_b2b=b2bs_/);assert.match(cookie,/Path=\/api\/b2b\/company-a; HttpOnly; Secure; SameSite=Strict; Max-Age=28800$/);
  assert.equal(portalToken({headers:{cookie:cookie.split(';')[0]}}),token);
  for(const cookie of ['', '__Secure-mws_b2b=eyJ.jwt.token',`__Secure-mws_b2b=${token}; __Secure-mws_b2b=${token}`])assert.throws(()=>portalToken({headers:{cookie}}),error=>error.status===401);
  assert.match(portalCookie('', 'company-a',{clear:true}),/Max-Age=0$/);
});

test('verified opaque identity is branded and derives safe me/CSRF without any plaintext token or credential',async()=>{
  const {db,state}=fixture(),ctx=await authenticatePortalSession(db,'company-a',token),me=describePortalSession(ctx);
  assert.equal(ctx.actorId,'b2b:account-a');assert.equal(ctx.channel,'B2B_SITE');assert.equal(me.expiresAt,'2026-10-18T18:00:00.000Z');assert.deepEqual(me.stores,[{id:'store-a',name:'Store A'}]);
  assert.match(me.csrfToken,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(me).includes(token),false);assert.equal(JSON.stringify(ctx).includes(hash),false);assert.equal(state.calls.some(call=>call.values.includes(token)),false);
  assert.throws(()=>assertWholesalePrincipal({...ctx}),error=>error.status===403,'copying trusted fields does not recreate the WeakMap principal');
  requirePortalCsrf({headers:{'x-csrf-token':me.csrfToken}},ctx);
  for(const value of [undefined,'0'.repeat(64),'x'.repeat(64),'a'])assert.throws(()=>requirePortalCsrf({headers:{'x-csrf-token':value}},ctx),error=>error.status===403);
  assert.throws(()=>requirePortalOrigin({headers:{origin:'https://attacker.invalid'}}),error=>error.status===403);
  requirePortalOrigin({headers:{origin:'https://myworkstation-app.onrender.com'}});
});

test('live session authorization rechecks revocation and store/customer binding inside each operation',async()=>{
  const {db,state}=fixture(),ctx=await authenticatePortalSession(db,'company-a',token);
  await authorizeWholesalePrincipal(db,ctx,input,{lock:true});assert.ok(state.calls.some(call=>call.sql.includes('JOIN "WholesalePortalAccount"')&&call.sql.includes('FOR SHARE')));
  const scope=state.calls.find(call=>call.sql.includes('JOIN "WholesalePortalAccount"')).sql;
  for(const predicate of ['s."sessionVersion"=a."sessionVersion"','a."active"=true','site."enabled"=true','cu."active"=true','st."active"=true','co."active"=true',"cm.\"moduleKey\"='WHOLESALE_B2B'",'s."expiresAt">clock_timestamp()'])assert.ok(scope.includes(predicate),predicate);assert.ok(scope.includes("co.\"licenseStatus\"='ACTIVE'"));assert.ok(scope.includes('co.\"subscriptionStartsAt\"'));
  await assert.rejects(()=>authorizeWholesalePrincipal(db,ctx,{...input,storeId:'other'}),error=>error.status===403);
  state.active=false;await assert.rejects(()=>authorizeWholesalePrincipal(db,ctx,input),error=>error.status===401);
});

test('wall clock expiry after lock wait is checked for session and module/license dates',async()=>{
  for(const field of ['expiresAt','subscriptionEndsAt','moduleEndsAt']){
    const {db,state}=fixture(),ctx=await authenticatePortalSession(db,'company-a',token);state.scope[field]=new Date('2026-10-18T10:00:01Z');state.now=new Date('2026-10-18T10:00:02Z');
    await assert.rejects(()=>authorizeWholesalePrincipal(db,ctx,input,{lock:true}),error=>error.status===401);
  }
});

test('subscription or module future start after lock acquisition denies access',async()=>{
  for(const date of ['subscriptionStartsAt','moduleStartsAt']){
    const {db,state}=fixture(),ctx=await authenticatePortalSession(db,'company-a',token);state.scope[date]=new Date('2026-10-18T10:00:03Z');
    await assert.rejects(()=>authorizeWholesalePrincipal(db,ctx,input,{lock:true}),error=>error.status===401);
  }
});

test('publication authorization is explicitly site/company/store scoped and withdrawal does not block accepted-history authorization',async()=>{
  const {db,state}=fixture(),ctx=await authenticatePortalSession(db,'company-a',token);
  await authorizeWholesaleQuoteProducts(db,ctx,input,{lock:true});
  const query=state.calls.find(call=>call.sql.includes('FROM "WholesalePortalPublication"'));assert.deepEqual(query.values,['site-a','company-a','store-a',['product-a']]);assert.ok(query.sql.includes('FOR SHARE'));
  state.published=false;await assert.rejects(()=>authorizeWholesaleQuoteProducts(db,ctx,input),error=>error.code==='B2B_PRODUCT_UNAVAILABLE');
  await authorizeWholesalePrincipal(db,ctx,input,'accepted-history does not invoke publication or reprice');
});

test('process-local login limiter is time bounded and refuses repeat attempts with bounded key storage',()=>{
  let now=0;const limit=createPortalLoginLimiter({now:()=>now,maxKeys:4,windowMs:100});for(let n=0;n<5;n++)limit('site','alice');assert.throws(()=>limit('site','alice'),error=>error.status===429);
  now=101;assert.doesNotThrow(()=>limit('site','alice'));for(let n=0;n<100;n++)assert.doesNotThrow(()=>limit('site'+n,'login'+n));
});

test('public quote serializer removes internal pricing revisions and identifiers',()=>{
  const safe=publicWholesaleQuote({quoteId:'q',currency:'EUR',customerId:'customer-a',customerName:'Customer',storeId:'store-a',creditChecked:false,totals:{net:'1.00',vat:'0.24',gross:'1.24'},items:[{productId:'p',name:'Product',quantity:'1.0000',tierId:'private-tier',priceListId:'private-list',priceVersion:9,minimumQuantity:'1.0000',sourceUnitPrice:'1.0000',sourcePriceBasis:'NET'}]});
  for(const value of ['private-tier','private-list','priceVersion','minimumQuantity'])assert.equal(JSON.stringify(safe).includes(value),false);
});

test('real public router denies management Authorization and wrong Origin before bootstrap/database work',async()=>{
  let bootstraps=0;const app=express();app.use(express.json());app.use('/api/b2b',createWholesalePortalRouter({db:{},ensureSchema:async()=>{bootstraps++},expectedOrigin:'https://portal.invalid'}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});const base=`http://127.0.0.1:${server.address().port}/api/b2b/site`;
  try{
    const jwt=await fetch(base+'/me',{headers:{Authorization:'Bearer ordinary-management-jwt'}});assert.equal(jwt.status,401);assert.equal(jwt.headers.get('cache-control'),'no-store');
    const cross=await fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://wrong.invalid'},body:JSON.stringify({login:'alice',password:'a strong password'})});assert.equal(cross.status,403);assert.equal(bootstraps,0);
  }finally{await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()})}
});


test('expected-account header can only reject a cookie identity mismatch before business reads',async()=>{
  const {db,state}=fixture(),app=express();app.use(express.json());app.use('/api/b2b',createWholesalePortalRouter({db,ensureSchema:async()=>{}}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))}),base=`http://127.0.0.1:${server.address().port}/api/b2b/company-a`,cookie=`__Secure-mws_b2b=${token}`;
  try{
    const changed=await fetch(base+'/catalog?storeId=store-a',{headers:{Cookie:cookie,'X-B2B-Account':'other-account'}});
    assert.equal(changed.status,401);assert.equal((await changed.json()).code,'B2B_ACCOUNT_CHANGED');
    assert.equal(state.calls.some(call=>call.sql.includes('FROM "Product"')),false);
    const me=await fetch(base+'/me',{headers:{Cookie:cookie,'X-B2B-Account':'other-account'}});assert.equal(me.status,200);assert.equal((await me.json()).account.id,'account-a');
    const missingCookie=await fetch(base+'/catalog?storeId=store-a',{headers:{'X-B2B-Account':'account-a'}});assert.equal(missingCookie.status,401,'an account expectation cannot authenticate a request');
  }finally{await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()})}
});
