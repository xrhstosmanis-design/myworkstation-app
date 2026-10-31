import assert from 'node:assert/strict';import fs from 'node:fs';import jwt from 'jsonwebtoken';import crypto from 'node:crypto';
import {Prisma,PrismaClient} from '@prisma/client';
import {prisma as sharedDb} from '../src/prisma.js';
import {issueChatOperatorSession} from '../src/chat-operator-auth.mjs';
import {forwardChatMessage} from '../src/chat-search-forward.mjs';
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
 async function owner(co,role="OWNER"){const u=await db.user.create({data:{companyId:co.id,fullName:'CI Owner',email:`chat-${crypto.randomUUID()}@unit.test`,passwordHash:'isolated-no-login',role,mustChangePassword:false}}),s=await db.userSession.create({data:{userId:u.id,expiresAt:new Date(Date.now()+86400000)}});return {u,token:jwt.sign({id:u.id,email:u.email,companyId:co.id,role:u.role,sessionId:s.id,sessionVersion:u.sessionVersion},process.env.JWT_SECRET,{expiresIn:'10m'})};}
 const a=await owner(company),b=await owner(foreign);
 const employee=await db.employee.create({data:{storeId:store.id,fullName:'CI recipient'}}),operator={id:crypto.randomUUID(),employeeId:employee.id,companyId:company.id,storeId:store.id,role:'EMPLOYEE',displayName:'CI recipient',pinHash:null,cardCodeHash:null};
 await db.$executeRaw`INSERT INTO "StoreOperatorCredential" ("id","companyId","storeId","employeeId","displayName","role","createdBy") VALUES (${operator.id},${company.id},${store.id},${employee.id},${operator.displayName},${operator.role},${a.u.id})`;
 const staff=await issueChatOperatorSession(operator,{});
 const parent=await call(a.token,store,'','POST',{body:'Parent <script>literal</script> '+'x'.repeat(300),category:'GENERAL'});assert.equal(parent.status,201,JSON.stringify(parent.body));const parentId=parent.body.id;
 const siblingMessage=await call(a.token,sibling,'','POST',{body:'Sibling'}),foreignMessage=await call(b.token,other,'','POST',{body:'Foreign'});
 // A long history must be bounded before names/reactions/delivery enrichment. Older read pins stay visible.
 const prefix=`ci-chat-page-${crypto.randomUUID()}-`,oldPin=prefix+'1';
 await db.$executeRaw`INSERT INTO "StoreChatMessage" ("id","companyId","storeId","senderId","category","body","pinned","createdAt","updatedAt") SELECT ${prefix}||i::text,${company.id},${store.id},${a.u.id},CASE WHEN i=1 THEN 'ANNOUNCEMENT' ELSE 'GENERAL' END,'Synthetic older history',i=1,NOW()-INTERVAL '1 day',NOW() FROM generate_series(1,400) i`;
 await db.$executeRaw`INSERT INTO "StoreChatRead" ("messageId","userId") VALUES (${oldPin},${operator.id})`;
 const page=await call(staff,store,'?limit=1');assert.equal(page.status,200,JSON.stringify(page.body));assert.deepEqual(page.body.rows.map(r=>r.id),[parentId]);assert.equal(page.body.pinnedAnnouncements[0].id,oldPin);assert.equal(Object.hasOwn(page.body.rows[0],'inTimeline'),false);
 const querySource=fs.readFileSync(new URL('../src/routes/store-chat.js',import.meta.url),'utf8').match(/const fetched=await prisma\.\$queryRaw`([\s\S]*?)`;/)[1];
 const parts=querySource.split(/\$\{([^}]+)\}/),strings=[],values=[],bindings={'req.user.id':operator.id,'store.companyId':company.id,'store.id':store.id,limit:1};
 for(let i=0;i<parts.length;i++)if(i%2){assert.ok(Object.hasOwn(bindings,parts[i]));values.push(bindings[parts[i]])}else strings.push(parts[i]);
 const enriched=await db.$queryRaw(Prisma.sql(strings,...values));assert.equal(enriched.length,2,'Only one timeline row plus the older pin are enriched, not the400-row history');assert.equal(enriched.filter(r=>r.inTimeline).length,1);
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
 const forwardedMedia=[];
 const wave=Buffer.alloc(46);wave.write('RIFF');wave.writeUInt32LE(38,4);wave.write('WAVE',8);wave.write('fmt ',12);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(16000,24);wave.writeUInt32LE(32000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(2,40);
 for(const [endpoint,mime,bytes] of [['voice-messages','audio/wav',wave],['video-messages','video/mp4',fs.readFileSync(new URL('../test/fixtures/chat-video/one-second.mp4',import.meta.url))]]){
  response=await fetch(`${base}/api/store-chat/stores/${store.id}/${endpoint}`,{method:'POST',headers:{authorization:`Bearer ${staff}`,'content-type':'application/json'},body:JSON.stringify({body:'Media reply',replyToId:parentId,attachment:{mimeType:mime,dataUrl:`data:${mime};base64,${bytes.toString('base64')}`}})});const value=await response.json();assert.equal(response.status,201,JSON.stringify(value));forwardedMedia.push(value.id);assert.equal((await call(a.token,store)).body.rows.find(r=>r.id===value.id).replyTo.id,parentId);
 }

 // Expanded batch: history search and explicit authorized forwarding, on actual local HTTP/PostgreSQL.
 const third=await db.store.create({data:{name:'CI Forward third',companyId:company.id}});
 const literal=await call(a.token,store,'','POST',{body:'Literal 100%_! offer and καφές'});
 const pdf=await call(a.token,store,'','POST',{body:'PDF source',replyToId:parentId,attachment:{name:'fixture.pdf',mimeType:'application/pdf',dataUrl:'data:application/pdf;base64,'+Buffer.from('%PDF-fixture').toString('base64')}});assert.equal(pdf.status,201,JSON.stringify(pdf.body));
 async function chatSnapshot(){return db.$queryRawUnsafe(`SELECT
 (SELECT COUNT(*)::int FROM "StoreChatMessage" WHERE "companyId"=$1) messages,
 (SELECT COUNT(*)::int FROM "StoreChatRead" r JOIN "StoreChatMessage" m ON m."id"=r."messageId" WHERE m."companyId"=$1) reads,
 (SELECT COUNT(*)::int FROM "StoreChatDelivery" WHERE "companyId"=$1) deliveries,
 (SELECT COUNT(*)::int FROM "StoreChatAcknowledgement" WHERE "companyId"=$1) acknowledgements,
 (SELECT COUNT(*)::int FROM "StoreChatReaction" WHERE "companyId"=$1) reactions,
 (SELECT COUNT(*)::int FROM "WorkforceAuditLog" WHERE "companyId"=$1) audits`,company.id);}
 const beforeSearch=await chatSnapshot(),seen=new Set();let cursor=null,pages=0;
 do{const r=await call(a.token,store,'/search?q=older%20history'+(cursor?'&before='+encodeURIComponent(cursor):''));assert.equal(r.status,200,JSON.stringify(r.body));assert.match(r.cache,/no-store/);assert.equal(r.body.store.id,store.id);assert.ok(r.body.rows.length<=20);
 for(const row of r.body.rows){assert.ok(row.id.startsWith(prefix));assert.equal(seen.has(row.id),false);seen.add(row.id);assert.equal(Object.hasOwn(row,'attachmentData'),false);}cursor=r.body.nextCursor;pages++;assert.ok(pages<=20);
 }while(cursor);assert.equal(seen.size,400,'stable keyset must preserve every timestamp tie');assert.equal(pages,20);
 for(const query of ['100%_!','ΚΑΦΈΣ'])assert.equal((await call(a.token,store,'/search?q='+encodeURIComponent(query))).body.rows[0].id,literal.body.id);
 assert.equal((await call(a.token,store,'/search?q='+encodeURIComponent("x' OR 1=1--"))).body.rows.length,0);
 for(const query of ['q=a','q=','q='+('x'.repeat(121)),'q=older&q=history','q=older&before=bad%2Fid'])assert.equal((await call(a.token,store,'/search?'+query)).status,400);
 assert.equal((await call(a.token,store,'/search?q=older&before='+foreignMessage.body.id)).status,404);assert.equal((await call('',store,'/search?q=older')).status,401);assert.ok([403,404].includes((await call(b.token,store,'/search?q=older')).status));
 assert.deepEqual(await chatSnapshot(),beforeSearch,'search never creates Chat reads/deliveries/acks/reactions/messages/audits');
 const destinationList=async token=>{const r=await fetch(base+'/api/store-chat/stores/'+store.id+'/forward-targets',{headers:{authorization:'Bearer '+token}});return {status:r.status,body:await r.json()}};
 const choices=await destinationList(a.token);assert.equal(choices.status,200,JSON.stringify(choices.body));assert.ok(choices.body.stores.some(s=>s.id===sibling.id));assert.ok(choices.body.stores.every(s=>s.companyId===company.id&&s.id!==store.id));assert.deepEqual((await destinationList(staff)).body.stores,[]);
 const forward=(token,message,target,requestId=crypto.randomUUID(),extra={})=>call(token,store,'/'+message+'/forward','POST',{targetStoreId:target.id,targetCompanyId:target.companyId,requestId,...extra});
 assert.equal((await forward(staff,parentId,sibling)).status,403);assert.equal((await forward(a.token,parentId,other)).status,404);assert.equal((await forward(a.token,parentId,store)).status,404);
 assert.equal((await forward(a.token,parentId,sibling,crypto.randomUUID(),{targetCompanyId:foreign.id})).status,404);assert.equal((await forward(a.token,parentId,sibling,'short')).status,400);assert.equal((await forward(a.token,foreignMessage.body.id,sibling)).status,404);
 const intent=crypto.randomUUID(),concurrent=await Promise.all(Array.from({length:8},()=>forward(a.token,parentId,sibling,intent)));for(const r of concurrent)assert.ok([200,201].includes(r.status),JSON.stringify(r.body));assert.equal(concurrent.filter(r=>r.status===201).length,1);assert.equal(new Set(concurrent.map(r=>r.body.id)).size,1);
 const forwardedId=concurrent[0].body.id,forwardedRow=(await db.$queryRawUnsafe('SELECT * FROM "StoreChatMessage" WHERE "id"=$1',forwardedId))[0];
 assert.equal(forwardedRow.body,'Parent <script>literal</script> '+'x'.repeat(300));assert.equal(forwardedRow.senderId,a.u.id);assert.equal(forwardedRow.storeId,sibling.id);assert.equal(forwardedRow.companyId,company.id);assert.equal(forwardedRow.category,'GENERAL');assert.equal(forwardedRow.forwarded,true);assert.equal(forwardedRow.pinned,false);assert.equal(forwardedRow.completed,false);assert.equal(forwardedRow.replyToId,null);
 assert.equal((await db.$queryRawUnsafe('SELECT COUNT(*)::int n FROM "WorkforceAuditLog" WHERE "entityId"=$1 AND "action"=$2',forwardedId,'STORE_CHAT_MESSAGE_FORWARDED'))[0].n,1);
 for(const table of ['StoreChatRead','StoreChatDelivery','StoreChatAcknowledgement','StoreChatReaction','StoreChatTask'])assert.equal((await db.$queryRawUnsafe('SELECT COUNT(*)::int n FROM "'+table+'" WHERE "messageId"=$1',forwardedId))[0].n,0);
 assert.equal((await forward(a.token,sent.body.id,sibling,intent)).status,409);assert.equal((await forward(a.token,parentId,third,intent)).status,409);
 const publicForward=(await call(a.token,sibling)).body.rows.find(r=>r.id===forwardedId);assert.equal(publicForward.forwarded,true);for(const key of ['sourceStoreId','sourceCompanyId','sourceMessageId','originalSenderId'])assert.equal(Object.hasOwn(publicForward,key),false);
 const announcementForward=await forward(a.token,ann,sibling);assert.equal(announcementForward.status,201);assert.deepEqual((await db.$queryRawUnsafe('SELECT "category","pinned","replyToId" FROM "StoreChatMessage" WHERE "id"=$1',announcementForward.body.id))[0],{category:'GENERAL',pinned:false,replyToId:null});
 for(const message of [photo.body.id,pdf.body.id,...forwardedMedia]){const r=await forward(a.token,message,sibling);assert.equal(r.status,201,JSON.stringify(r.body));const original=(await db.$queryRawUnsafe('SELECT * FROM "StoreChatMessage" WHERE "id"=$1',message))[0],copy=(await db.$queryRawUnsafe('SELECT * FROM "StoreChatMessage" WHERE "id"=$1',r.body.id))[0];for(const key of ['attachmentName','attachmentMimeType','attachmentSize','attachmentChecksum','attachmentData','body'])assert.equal(copy[key],original[key]);assert.equal(copy.replyToId,null);}
 async function settingsFor(target,values){const r=await fetch(base+'/api/store-chat/stores/'+target.id+'/settings',{method:'PUT',headers:{authorization:'Bearer '+a.token,'content-type':'application/json'},body:JSON.stringify(values)});assert.equal(r.status,200);}
 await settingsFor(sibling,{photosEnabled:false,pdfEnabled:false});for(const message of [photo.body.id,pdf.body.id,forwardedMedia[1]])assert.equal((await forward(a.token,message,sibling)).status,403);await settingsFor(sibling,{photosEnabled:true,pdfEnabled:true});
 await settingsFor(store,{downloadsEnabled:false});assert.equal((await forward(a.token,photo.body.id,sibling)).status,403);assert.equal((await forward(a.token,parentId,sibling)).status,201);await settingsFor(store,{downloadsEnabled:true});
 await db.storePaidModule.create({data:{storeId:sibling.id,companyId:company.id,moduleKey:'STORE_CHAT',active:false}});assert.equal((await forward(a.token,parentId,sibling)).status,404);await db.storePaidModule.update({where:{storeId_moduleKey:{storeId:sibling.id,moduleKey:'STORE_CHAT'}},data:{active:true}});
 await db.store.update({where:{id:sibling.id},data:{active:false}});assert.equal((await forward(a.token,parentId,sibling)).status,404);await db.store.update({where:{id:sibling.id},data:{active:true}});
 await assert.rejects(()=>forwardChatMessage(db,{source:store,target:{...sibling,companyId:foreign.id},user:a.u,messageId:parentId,requestId:crypto.randomUUID(),attachmentPolicy:{canCopyAttachment:true,photosEnabled:true,pdfEnabled:true}},async()=>{}),{status:404});
 const rollbackKey=crypto.randomUUID();await assert.rejects(()=>forwardChatMessage(db,{source:store,target:sibling,user:a.u,messageId:parentId,requestId:rollbackKey,attachmentPolicy:{canCopyAttachment:true,photosEnabled:true,pdfEnabled:true}},()=>{throw Error('synthetic audit failure')}),/synthetic audit failure/);
 assert.equal((await db.$queryRawUnsafe('SELECT COUNT(*)::int n FROM "StoreChatForwardIntent" WHERE "userId"=$1 AND "requestId"=$2',a.u.id,rollbackKey))[0].n,0);assert.equal((await forward(a.token,parentId,sibling,rollbackKey)).status,201);
 const platformOwner=await owner(company,'SUPER_ADMIN');assert.equal((await forward(platformOwner.token,parentId,other)).status,201,'existing unrestricted SuperAdmin may explicitly choose another company');
 console.log('Chat history/forward real PostgreSQL/HTTP PASS:400 timestamp-tied history rows exactly once; literal wildcard/SQL/Greek searches; no implicit Chat writes; source/destination roles/modules/settings; concurrent idempotent forward/conflicting keys/audit rollback; exact text/photo/PDF/audio/video content copying with fresh metadata; explicit existing SuperAdmin cross-company scope. Synthetic only.');
 await db.storePaidModule.create({data:{storeId:store.id,companyId:company.id,moduleKey:'STORE_CHAT',active:false}});assert.equal((await call(a.token,store,'/delivered','POST',{messageIds:[parentId]})).status,403);assert.equal((await call(a.token,store,'/search?q=older')).status,403);assert.equal((await forward(a.token,parentId,sibling,crypto.randomUUID(),{storeId:sibling.id})).status,403,'body storeId cannot bypass the source module');assert.equal((await call(staff,store)).status,401);
 // Real GET bodies must not redirect the outer module gate to an enabled sibling.
 for(const endpoint of ['/messages/search?q=older','/forward-targets']){
  const payload=JSON.stringify({storeId:sibling.id}),http=await import('node:http');
  const status=await new Promise((resolve,reject)=>{const request=http.request(base+'/api/store-chat/stores/'+store.id+endpoint,{method:'GET',headers:{authorization:'Bearer '+a.token,'content-type':'application/json','content-length':Buffer.byteLength(payload)}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode))});request.on('error',reject);request.end(payload)});
  assert.equal(status,403,'GET body.storeId must not replace the selected-store module check');
 }

 await db.storePaidModule.update({where:{storeId_moduleKey:{storeId:store.id,moduleKey:'STORE_CHAT'}},data:{active:true}});
 const payload=jwt.decode(staff);await db.$executeRaw`UPDATE "StoreChatMobileSession" SET "revokedAt"=NOW() WHERE "id"=${payload.chatSessionId}`;assert.equal((await call(staff,store,`/${parentId}/reaction`,'PUT',{reaction:'👍'})).status,401);
 assert.equal((await call(staff,store,'/search?q=older')).status,401);assert.equal((await forward(staff,parentId,sibling)).status,401);
 console.log('Chat combined interactions real PostgreSQL/HTTP PASS: bounded-before-enrichment timeline and older read pins across400 rows, actual idempotent client receipts distinct from read, atomic same-store quotes including voice/video, reaction set/replace/current-user remove, foreign/sibling/malformed/module/revoked-session rejection, existing owner pin and explicit announcement acknowledgement. Synthetic local data only.');
}finally{await db.$disconnect();await sharedDb.$disconnect()}
