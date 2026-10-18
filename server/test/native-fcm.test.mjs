import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {nativePayload,nativeToken,createNativeFcmProvider} from '../src/native-fcm-provider.mjs';
import {nativeRecipientAllowed} from '../src/native-fcm-policy.mjs';
const input={token:'valid_token_1234567890:abcdefgh',binding:'a'.repeat(64),storeId:'store-A',companyId:'company-A'};
test('native payload contains technical routing only and is data-only',()=>{
 const p=nativePayload({...input,body:'PRIVATE',name:'PRIVATE',url:'https://evil.example'});
 assert.deepEqual(Object.keys(p.message).sort(),['android','data','token']);
 assert.deepEqual(p.message.data,{kind:'MWS_CHAT',binding:input.binding,storeId:'store-A',companyId:'company-A'});
 assert.equal(JSON.stringify(p).includes('PRIVATE'),false);
 for(const t of ['short','https://evil.example/token','a'.repeat(4097),'token with whitespace'.repeat(3)])assert.throws(()=>nativeToken(t));
});
test('disabled provider performs no credential read or network',async()=>{
 const p=createNativeFcmProvider({env:{},read:()=>assert.fail('read'),fetchImpl:()=>assert.fail('network')});
 assert.deepEqual(await p.send(input),{delivered:false,disabled:true});
});
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const credential={type:'service_account',project_id:'myworkstation-chat',client_email:'push@myworkstation-chat.iam.gserviceaccount.com',private_key:privateKey};
test('provider signs fixed-audience OAuth and sends only to fixed project without retry',async()=>{
 const calls=[];const p=createNativeFcmProvider({env:{NATIVE_CHAT_FCM_ENABLED:'true',NATIVE_CHAT_FCM_CREDENTIALS_FILE:'/secret'},read:async()=>Buffer.from(JSON.stringify(credential)),fetchImpl:async(url,opts)=>{
 calls.push({url,opts});return {ok:true,status:200,text:async()=>JSON.stringify(url.includes('oauth2')?{access_token:'oauth-token',expires_in:3600}:{name:'ok'})};}});
 await p.send(input);await p.send(input);assert.equal(calls.length,3);
 const assertion=calls[0].opts.body.get('assertion');const claim=JSON.parse(Buffer.from(assertion.split('.')[1],'base64url'));
 assert.equal(claim.aud,'https://oauth2.googleapis.com/token');assert.equal(claim.scope,'https://www.googleapis.com/auth/firebase.messaging');
 for(const c of calls){assert.equal(c.opts.redirect,'error');assert(c.opts.signal);}
 assert.equal(calls[1].url,'https://fcm.googleapis.com/v1/projects/myworkstation-chat/messages:send');
 assert.deepEqual(JSON.parse(calls[1].opts.body),nativePayload(input));
});
test('provider rejects foreign project and only retires explicit UNREGISTERED',async()=>{
 const env={NATIVE_CHAT_FCM_ENABLED:'true',NATIVE_CHAT_FCM_CREDENTIALS_FILE:'/secret'};
 const bad=createNativeFcmProvider({env,read:async()=>Buffer.from(JSON.stringify({...credential,project_id:'foreign'})),fetchImpl:()=>assert.fail('network')});
 await assert.rejects(bad.send(input));
 const p=createNativeFcmProvider({env,read:async()=>Buffer.from(JSON.stringify(credential)),fetchImpl:async url=>({ok:url.includes('oauth2'),status:url.includes('oauth2')?200:404,text:async()=>JSON.stringify(url.includes('oauth2')?{access_token:'x',expires_in:1000}:{error:{details:[{'@type':'type.googleapis.com/google.firebase.fcm.v1.FcmError',errorCode:'UNREGISTERED'}]}})})});
 assert.deepEqual(await p.send(input),{delivered:false,unregistered:true});
});
const store={id:'store-A',companyId:'company-A'};
const user={id:'owner',tokenType:'BACKOFFICE_USER',role:'OWNER',sessionVersion:3,companyId:'company-A'};
const row={userId:'owner',sessionId:'session',identityJson:user};
const session={expiresAt:new Date(Date.now()+60000),user:{id:'owner',role:'OWNER',sessionVersion:3,companyId:'company-A',company:{active:true},mustChangePassword:false}};
const deps={db:{userSession:{findUnique:async()=>session}},storesFor:async()=>({stores:[store]}),enabled:async()=>true,authorize:async()=>({id:'operator'})};
test('recipient policy rechecks role, session expiry/revocation, version and current store ownership',async()=>{
 assert.equal(await nativeRecipientAllowed(row,store,deps),true);
 for(const value of [{...session,revokedAt:new Date()},{...session,expiresAt:new Date(0)},{...session,user:{...session.user,role:'EMPLOYEE'}},{...session,user:{...session.user,sessionVersion:4}},{...session,user:{...session.user,mustChangePassword:true}}])assert.equal(await nativeRecipientAllowed(row,store,{...deps,db:{userSession:{findUnique:async()=>value}}}),false);
 assert.equal(await nativeRecipientAllowed(row,store,{...deps,storesFor:async()=>({stores:[{...store,companyId:'foreign'}]})}),false);
 assert.equal(await nativeRecipientAllowed(row,store,{...deps,storesFor:async()=>({stores:[]})}),false);
 assert.equal(await nativeRecipientAllowed({...row,identityJson:{...user,supportContext:true,companyId:'foreign'}},store,deps),false);
});
test('staff requires exact store, company, credential authorization and enabled module',async()=>{
 const identity={id:'operator',tokenType:'STORE_OPERATOR',storeId:'store-A',companyId:'company-A',chatSessionId:'staff-session'};
 const r={userId:'operator',sessionId:'staff-session',identityJson:identity};
 assert.equal(await nativeRecipientAllowed(r,store,deps),true);
 for(const patch of [{storeId:'B'},{companyId:'B'},{chatSessionId:'other'}])assert.equal(await nativeRecipientAllowed({...r,identityJson:{...identity,...patch}},store,deps),false);
 assert.equal(await nativeRecipientAllowed(r,store,{...deps,authorize:async()=>null}),false);
 assert.equal(await nativeRecipientAllowed(r,store,{...deps,enabled:async()=>false}),false);
});

test('malformed expiry cannot grant delivery',async()=>{
 assert.equal(await nativeRecipientAllowed(row,store,{...deps,db:{userSession:{findUnique:async()=>({...session,expiresAt:'invalid'})}}}),false);
});

import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
function registryHarness({configured=true,stores=[store],database}={}) {
 const calls=[]; const db=database||{
  $executeRawUnsafe:async(sql,...args)=>{calls.push({sql,args});return 1;},
  $queryRawUnsafe:async(sql,...args)=>{calls.push({sql,args});return [];},
  $transaction:async fn=>fn(db),
  store:{findUnique:async()=>({...store,active:true,company:{active:true}})}
 };
 const code=fs.readFileSync(new URL('../src/native-chat-push.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'')+'\nthis.api={registerNativePush,revokeNativePush};';
 const box={createHash,prisma:db,mobileChatStores:async()=>({stores}),chatEnabled:async()=>true,authorizeChatOperator:async()=>true,nativeRecipientAllowed,assertCustomerDemoOutboundAllowed:()=>{},createNativeFcmProvider:()=>({configured:()=>configured}),nativeToken};
 vm.runInNewContext(code,box);return {...box.api,calls};
}
test('registry serializes token ownership and binds only authenticated session; revocation cannot delete another session',async()=>{
 const h=registryHarness();const u={...user,sessionId:'s'};
 const r=await h.registerNativePush(u,input.token,'authenticated-bearer');
 assert.equal(r.ok,true);assert.equal(r.binding,createHash('sha256').update('authenticated-bearer').digest('hex'));
 const lock=h.calls.findIndex(x=>x.sql.includes('pg_advisory_xact_lock'));
 const write=h.calls.findIndex(x=>x.sql.startsWith('INSERT'));
 assert(lock>=0&&write>lock);const values=h.calls[write].args;
 assert.equal(values[2],'owner');assert.equal(values[3],'s');assert.equal(JSON.parse(values[5]).sessionVersion,3);
 assert(h.calls[write].sql.includes('ON CONFLICT ("tokenHash") DO UPDATE'));
 await h.revokeNativePush({...u,sessionId:'other'},input.token);
 const deletion=h.calls.at(-1);assert(deletion.sql.includes('"userId"=$2 AND "sessionId"=$3'));assert.equal(deletion.args[2],'other');
});
test('disabled/no authorized stores/foreign staff registration never writes a native binding',async()=>{
 const off=registryHarness({configured:false});await assert.rejects(off.registerNativePush({...user,sessionId:'s'},input.token,'bearer'));assert.equal(off.calls.length,0);
 const noStores=registryHarness({stores:[]});await assert.rejects(noStores.registerNativePush({...user,sessionId:'s'},input.token,'bearer'));assert.equal(noStores.calls.length,0);
 const staff=registryHarness();await assert.rejects(staff.registerNativePush({id:'op',tokenType:'STORE_OPERATOR',storeId:'A',companyId:'C',chatSessionId:'s'},input.token,'bearer','B'));assert.equal(staff.calls.length,0);
});

const isolatedNativeDatabase=()=>{try{const url=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(url.hostname)&&/test/i.test(url.pathname)}catch{return false}};
test('isolated PostgreSQL native token ownership transition and session-bound revocation',{skip:!isolatedNativeDatabase()},async()=>{
 const {PrismaClient}=await import('@prisma/client');
 const admin=new PrismaClient(),schema='native_chat_fcm_'+createHash('sha256').update(String(Date.now())+Math.random()).digest('hex').slice(0,12);
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 await admin.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"');
 const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
 try {
  const h=registryHarness({database:db});
  const one={...user,id:'owner-one',sessionId:'session-one'},two={...user,id:'owner-two',sessionId:'session-two'};
  await Promise.all([h.registerNativePush(one,input.token,'bearer-one'),h.registerNativePush(two,input.token,'bearer-two')]);
  const rows=await db.$queryRawUnsafe('SELECT * FROM "StoreChatNativePush"');
  assert.equal(rows.length,1);const current=rows[0],identity=current.identityJson;
  assert.equal(current.userId,identity.id);
  const winner=current.userId==='owner-one'?one:two,other=current.userId==='owner-one'?two:one;
  assert.equal(current.sessionId,winner.sessionId);
  assert.equal(current.binding,createHash('sha256').update(winner.id==='owner-one'?'bearer-one':'bearer-two').digest('hex'));
  await h.revokeNativePush(other,input.token);assert.equal((await db.$queryRawUnsafe('SELECT * FROM "StoreChatNativePush"')).length,1);
  await h.revokeNativePush({...winner,sessionId:'foreign-session'},input.token);assert.equal((await db.$queryRawUnsafe('SELECT * FROM "StoreChatNativePush"')).length,1);
  await h.revokeNativePush(winner,input.token);assert.equal((await db.$queryRawUnsafe('SELECT * FROM "StoreChatNativePush"')).length,0);
 } finally {await db.$disconnect();await admin.$executeRawUnsafe('DROP SCHEMA "'+schema+'" CASCADE');await admin.$disconnect();}
});

test('direct Render secret environment credential does not read a filesystem secret',async()=>{
 let calls=0;
 const p=createNativeFcmProvider({env:{NATIVE_CHAT_FCM_ENABLED:'true',NATIVE_CHAT_FCM_SERVICE_ACCOUNT_JSON:JSON.stringify(credential)},read:()=>assert.fail('filesystem read'),fetchImpl:async url=>{calls++;return{ok:true,status:200,text:async()=>JSON.stringify(url.includes('oauth2')?{access_token:'x',expires_in:1000}:{name:'accepted'})}}});
 assert.equal((await p.send(input)).delivered,true);assert.equal(calls,2);
});


test('native registration preserves the authenticated platform role for compatibility Super Admin',async()=>{
 const h=registryHarness();
 await h.registerNativePush({...user,sessionId:'s',platformRole:'SUPER_ADMIN',isSuperAdmin:true},input.token,'bearer');
 const identity=JSON.parse(h.calls.find(x=>x.sql.startsWith('INSERT')).args[5]);
 assert.equal(identity.role,'OWNER');assert.equal(identity.platformRole,'SUPER_ADMIN');
});

test('compatibility Super Admin recipient uses current DB role and preserves support-company restriction',async()=>{
 const identity={...user,platformRole:'SUPER_ADMIN'};
 const adminRow={...row,identityJson:identity};
 const adminSession={...session,user:{...session.user,role:'SUPER_ADMIN',company:{active:false}}};
 let resolved;
 const d={...deps,db:{userSession:{findUnique:async()=>adminSession}},storesFor:async u=>{resolved=u;return {stores:[store]}}};
 assert.equal(await nativeRecipientAllowed(adminRow,store,d),true);
 assert.equal(resolved.platformRole,'SUPER_ADMIN');assert.equal(resolved.isSuperAdmin,true);
 assert.equal(await nativeRecipientAllowed({...adminRow,identityJson:{...identity,supportContext:true,companyId:'foreign'}},store,d),false);
 assert.equal(await nativeRecipientAllowed({...adminRow,identityJson:{...identity,supportContext:true}},store,d),true);
 assert.deepEqual(resolved.supportContext,{native:true});assert.equal(resolved.companyId,store.companyId);
 for(const patch of [{role:'OWNER'},{role:'EMPLOYEE'},{sessionVersion:4},{mustChangePassword:true}]){
  assert.equal(await nativeRecipientAllowed(adminRow,store,{...d,db:{userSession:{findUnique:async()=>({...adminSession,user:{...adminSession.user,...patch}})}}}),false);
 }
 for(const patch of [{revokedAt:new Date()},{expiresAt:new Date(0)}]){
  assert.equal(await nativeRecipientAllowed(adminRow,store,{...d,db:{userSession:{findUnique:async()=>({...adminSession,...patch})}}}),false);
 }
 assert.equal(await nativeRecipientAllowed(adminRow,store,{...d,storesFor:async()=>({stores:[]})}),false);
 // A stale pre-fix OWNER binding cannot silently gain platform access. Resume re-registers it.
 assert.equal(await nativeRecipientAllowed(row,store,d),false);
});
