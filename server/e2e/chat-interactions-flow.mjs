import assert from 'node:assert/strict';import fs from 'node:fs';import jwt from 'jsonwebtoken';import crypto from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {prisma as sharedDb} from '../src/prisma.js';
import {issueChatOperatorSession} from '../src/chat-operator-auth.mjs';
import {ensureStoreChatInteractions} from '../src/chat-interactions.mjs';
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:8080';assert.equal(process.env.NODE_ENV,'test');
for(const url of [base,process.env.DATABASE_URL])assert.ok(['127.0.0.1','localhost'].includes(new URL(url).hostname),'Synthetic local HTTP/PostgreSQL only');
const db=new PrismaClient();
const call=async(token,store,path='',method='GET',body)=>{const r=await fetch(`${base}/api/store-chat/stores/${store.id}/messages${path}`,{method,headers:{...(token?{authorization:`Bearer ${token}`} :{}),'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')}};
try{
 await ensureStoreChatInteractions(db);await ensureStoreChatInteractions(db);
 const company=await db.company.create({data:{name:'CI Chat batch',active:true,licenseStatus:'ACTIVE',subscriptionEndsAt:new Date(Date.now()+86400000),modules:{create:{moduleKey:'STORE_CHAT',active:true}}}});
 const foreign=await db.company.create({data:{name:'CI Chat foreign',active:true,licenseStatus:'ACTIVE',subscriptionEndsAt:new Date(Date.now()+86400000),modules:{create:{moduleKey:'STORE_CHAT',active:true}}}});
 const store=await db.store.create({data:{name:'CI Chat A',companyId:company.id}}),sibling=await db.store.create({data:{name:'CI Chat sibling',companyId:company.id}}),other=await db.store.create({data:{name:'CI Chat B',companyId:foreign.id}});
 async function owner(co){const u=await db.user.create({data:{companyId:co.id,fullName:'CI Owner',email:`chat-${crypto.randomUUID()}@unit.test`,passwordHash:'isolated-no-login',role:'OWNER',mustChangePassword:false}}),s=await db.userSession.create({data:{userId:u.id,expiresAt:new Date(Date.now()+86400000)}});return {u,token:jwt.sign({id:u.id,email:u.email,companyId:co.id,role:u.role,sessionId:s.id,sessionVersion:u.sessionVersion},process.env.JWT_SECRET,{expiresIn:'10m'})};}
 const a=await owner(company),b=await owner(foreign);
 const employee=await db.employee.create({data:{storeId:store.id,fullName:'CI recipient'}}),operator={id:crypto.randomUUID(),employeeId:employee.id,companyId:company.id,storeId:store.id,role:'EMPLOYEE',displayName:'CI recipient',pinHash:null,cardCodeHash:null};
 await db.$executeRaw`INSERT INTO "StoreOperatorCredential" ("id","companyId","storeId","employeeId","displayName","role","createdBy") VALUES (${operator.id},${company.id},${store.id},${employee.id},${operator.displayName},${operator.role},${a.u.id})`;
 const staff=await issueChatOperatorSession(operator,{});
 const parent=await call(a.token,store,'','POST',{body:'Parent <script>literal</script> '+'x'.repeat(300),category:'GENERAL'});assert.equal(parent.status,201,JSON.stringify(parent.body));const parentId=parent.body.id;
 const siblingMessage=await call(a.token,sibling,'','POST',{body:'Sibling'}),foreignMessage=await call(b.token,other,'','POST',{body:'Foreign'});
 const initial=await call(staff,store);assert.equal(initial.status,200,JSON.stringify(initial.body));assert.equal(initial.body.interactionsAvailable,true);assert.match(initial.cache,/no-store/);assert.equal(initial.body.rows.find(r=>r.id===parentId).deliveries.length,0,'server save/GET alone never claims delivery');
 const receipts=await Promise.all(Array.from({length:8},()=>call(staff,store,'/delivered','POST',{messageIds:[parentId,parentId]})));for(const r of receipts)assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(receipts.reduce((sum,r)=>sum+r.body.received,0),1);
 const receipt=await db.$queryRaw`SELECT * FROM "StoreChatDelivery" WHERE "messageId"=${parentId}`;assert.equal(receipt.length,1);assert.equal(receipt[0].userId,operator.id);
 assert.equal((await call(a.token,store,'/delivered','POST',{messageIds:[parentId]})).body.received,0,'sender excluded');
 let list=(await call(a.token,store)).body.rows.find(r=>r.id===parentId);assert.equal(list.deliveries[0].name,'CI recipient');assert.deepEqual(list.readers,[],'delivery must not mark read');
 const photo=await call(staff,store,'','POST',{body:'Photo quote',replyToId:parentId,attachment:{name:'fixture.png',mimeType:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII='}});assert.equal(photo.status,201,JSON.stringify(photo.body));assert.equal((await call(a.token,store)).body.rows.find(r=>r.id===photo.body.id).replyTo.id,parentId);
 const sent=await call(staff,store,'','POST',{body:'Quoted answer',replyToId:parentId});assert.equal(sent.status,201,JSON.stringify(sent.body));
 list=(await call(a.token,store)).body.rows.find(r=>r.id===sent.body.id);assert.equal(list.replyTo.id,parentId);assert.equal(list.replyTo.senderName,'CI Owner');assert.equal(list.replyTo.body.length,280);assert.equal(Object.hasOwn(list.replyTo,'attachmentData'),false);
 for(const badId of [siblingMessage.body.id,foreignMessage.body.id,'missing']){
  const before=await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "StoreChatMessage" WHERE "storeId"=${store.id}`;
  assert.equal((await call(staff,store,'','POST',{body:'must not send',replyToId:badId})).status,404);
  assert.equal((await call(staff,store,`/${badId}/reaction`,'PUT',{reaction:'👍'})).status,404);
  assert.equal((await call(staff,store,'/delivered','POST',{messageIds:[parentId,badId]})).status,404);
  assert.deepEqual(await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "StoreChatMessage" WHERE "storeId"=${store.id}`,before);
 }
 for(const value of [undefined,'🔥',{},''])assert.equal((await call(staff,store,`/${parentId}/reaction`,'PUT',value===undefined?{}:{reaction:value})).status,400);
 const simultaneous=await Promise.all(Array.from({length:8},()=>call(staff,store,`/${parentId}/reaction`,'PUT',{reaction:'👍'})));for(const r of simultaneous)assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(simultaneous.reduce((sum,r)=>sum+r.body.changed,0),1);
 for(const emoji of ['👍','✅','❤️']){const r=await call(staff,store,`/${parentId}/reaction`,'PUT',{reaction:emoji});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal((await call(staff,store,`/${parentId}/reaction`,'PUT',{reaction:emoji})).body.changed,0);}
 const reactions=await db.$queryRaw`SELECT * FROM "StoreChatReaction" WHERE "messageId"=${parentId}`;assert.equal(reactions.length,1);assert.equal(reactions[0].reaction,'❤️');
 assert.equal((await call(a.token,store,`/${parentId}/reaction`,'PUT',{reaction:'👍'})).status,200);assert.equal((await call(staff,store,`/${parentId}/reaction`,'PUT',{reaction:null})).body.changed,1);assert.equal((await call(staff,store,`/${parentId}/reaction`,'PUT',{reaction:null})).body.changed,0);
 assert.equal((await db.$queryRaw`SELECT "userId" FROM "StoreChatReaction" WHERE "messageId"=${parentId}`)[0].userId,a.u.id,'removal touches only current actor');
 assert.ok([403,404].includes((await call(b.token,store,'/delivered','POST',{messageIds:[parentId]})).status));assert.equal((await call('',store)).status,401);assert.equal((await call(staff,sibling)).status,401);
 const announcement=await call(a.token,store,'','POST',{body:'Pinned announcement',category:'ANNOUNCEMENT'});const ann=announcement.body.id;
 assert.equal((await call(staff,store,`/${ann}`,'PATCH',{pinned:true})).status,403);assert.equal((await call(a.token,store,`/${ann}`,'PATCH',{pinned:true})).status,200);
 let response=await fetch(`${base}/api/store-chat/stores/${store.id}/settings`,{method:'PUT',headers:{authorization:`Bearer ${a.token}`,'content-type':'application/json'},body:JSON.stringify({announcementAcknowledgementRequired:true})});assert.equal(response.status,200);
 assert.equal((await call(staff,store,`/${ann}/acknowledge`,'POST',{})).status,201);assert.equal((await call(staff,store,`/${ann}/acknowledge`,'POST',{})).status,200);assert.equal((await call(staff,store)).body.pinnedAnnouncements[0].acknowledgements.length,1);
 // Existing voice/video routes carry the same authorized quote without changing their media rules.
 const wave=Buffer.alloc(46);wave.write('RIFF');wave.writeUInt32LE(38,4);wave.write('WAVE',8);wave.write('fmt ',12);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(16000,24);wave.writeUInt32LE(32000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(2,40);
 for(const [endpoint,mime,bytes] of [['voice-messages','audio/wav',wave],['video-messages','video/mp4',fs.readFileSync(new URL('../test/fixtures/chat-video/one-second.mp4',import.meta.url))]]){
  response=await fetch(`${base}/api/store-chat/stores/${store.id}/${endpoint}`,{method:'POST',headers:{authorization:`Bearer ${staff}`,'content-type':'application/json'},body:JSON.stringify({body:'Media reply',replyToId:parentId,attachment:{mimeType:mime,dataUrl:`data:${mime};base64,${bytes.toString('base64')}`}})});const value=await response.json();assert.equal(response.status,201,JSON.stringify(value));assert.equal((await call(a.token,store)).body.rows.find(r=>r.id===value.id).replyTo.id,parentId);
 }
 await db.storePaidModule.create({data:{storeId:store.id,companyId:company.id,moduleKey:'STORE_CHAT',active:false}});assert.equal((await call(a.token,store,'/delivered','POST',{messageIds:[parentId]})).status,403);assert.equal((await call(staff,store)).status,401);
 await db.storePaidModule.update({where:{storeId_moduleKey:{storeId:store.id,moduleKey:'STORE_CHAT'}},data:{active:true}});
 const payload=jwt.decode(staff);await db.$executeRaw`UPDATE "StoreChatMobileSession" SET "revokedAt"=NOW() WHERE "id"=${payload.chatSessionId}`;assert.equal((await call(staff,store,`/${parentId}/reaction`,'PUT',{reaction:'👍'})).status,401);
 console.log('Chat combined interactions real PostgreSQL/HTTP PASS: actual idempotent client receipts distinct from read, atomic same-store quotes including voice/video, reaction set/replace/current-user remove, foreign/sibling/malformed/module/revoked-session rejection, existing owner pin and explicit announcement acknowledgement. Synthetic local data only.');
}finally{await db.$disconnect();await sharedDb.$disconnect()}
