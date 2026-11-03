import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import crypto from 'node:crypto';
import {createAttendedRemoteRouter} from '../src/routes/attended-remote.js';
const admin={id:'admin',role:'SUPER_ADMIN',sessionId:'admin-session',sessionVersion:1};
const operator={id:'operator',operatorId:'operator',tokenType:'STORE_OPERATOR',operatorSessionId:'operator-session',employeeId:'employee',role:'EMPLOYEE',companyId:'c',storeId:'s',terminalId:'t'};
test('actual mounted HTTP: exact POS consent, one-use pairing, bidirectional transfers, stream close and live revocation',async()=>{
 let revoked=false;const audits=[];
 const db={$queryRaw:async(strings,...values)=>{const sql=strings.join('?');if(sql.includes('StoreInstallationTerminal')){const [terminalId,companyId,storeId]=values;return terminalId==='t'&&companyId==='c'&&storeId==='s'?[{id:'t',companyId:'c',storeId:'s',terminalName:'POS1',storeName:'Store'}]:[];}if(sql.includes('StoreOperatorSession'))return revoked?[]:[{id:'operator-session'}];return [];},userSession:{findUnique:async()=>revoked?null:{userId:'admin',expiresAt:new Date(Date.now()+60000),user:{role:'SUPER_ADMIN',sessionVersion:1}}},authAudit:{create:async x=>audits.push(x)}};
 const auth=(req,res,next)=>{const who=req.headers['x-actor'];req.user=who==='admin'?admin:who==='other'?{...admin,id:'other',sessionId:'other-session'}:who==='foreign'?{...operator,storeId:'foreign'}:who==='legacy'?{...operator,terminalId:null}:operator;next();};
 const route=createAttendedRemoteRouter({db,authenticate:auth,env:{REMOTE_SUPPORT_ENABLED:'true',REMOTE_SUPPORT_TERMINALS:'t'}}),app=express();app.use(express.json());app.use(route);app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(path,actor='admin',body)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-actor':actor},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
 const invite=()=>call('/invitations','admin',{companyId:'c',storeId:'s',terminalId:'t'});
 try{
  assert.equal((await call('/pos/pending','legacy')).status,403);assert.equal((await call('/invitations','operator',{companyId:'c',storeId:'s',terminalId:'t'})).status,403);
  const j=(await invite()).body;assert.ok(j.id);assert.equal((await invite()).status,409);assert.equal((await call('/pos/pending','operator')).body.invitation.id,j.id);assert.equal((await call('/pos/pending','foreign')).status,403);
  assert.equal((await call(`/pos/${j.id}/consent`,'operator',{accepted:false})).status,400);
  const grant=(await call(`/pos/${j.id}/consent`,'operator',{accepted:true})).body.grant;const paired=await call('/pair','anonymous',{grant});assert.equal(paired.status,201);assert.equal(paired.body.expiresAt,null);assert.equal((await call('/pair','anonymous',{grant})).status,410);assert.equal((await call(`/controller/${j.id}/frame`,'other')).status,403);
  assert.equal((await call(`/controller/${j.id}/heartbeat`,'other',{})).status,403);assert.equal((await call(`/controller/${j.id}/heartbeat`,'admin',{})).status,200);
  const bytes=Buffer.from('driver bytes'),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const f=(await call(`/controller/${j.id}/files`,'admin',{name:'driver.zip',size:bytes.length,sha256})).body;
  assert.equal((await call(`/controller/${j.id}/files/${f.id}/chunk`,'admin',{offset:0,data:bytes.toString('base64')})).status,200);
  const devicePath=`/device/${j.id}`,token=paired.body.token;
  const get=await fetch(base+`${devicePath}/files/${f.id}/chunk?offset=0`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(get.status,200);assert.equal(Buffer.from((await get.json()).data,'base64').toString(),'driver bytes');
  const denied=await fetch(base+`/device/foreign/files/${f.id}/chunk?offset=0`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(denied.status,404);
  const outgoing=await fetch(base+`${devicePath}/files`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({name:'diagnostics.txt',size:bytes.length,sha256})});assert.equal(outgoing.status,201);const outgoingId=(await outgoing.json()).id;
  await fetch(base+`${devicePath}/files/${outgoingId}/chunk`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({offset:0,data:bytes.toString('base64')})});assert.equal((await call(`/controller/${j.id}/files/${outgoingId}/chunk?offset=0`)).status,200);
  const stream=await fetch(base+`/controller/${j.id}/stream`,{headers:{'x-actor':'admin'}});assert.equal(stream.headers.get('content-type').startsWith('text/event-stream'),true);const reader=stream.body.getReader();const event=await reader.read();assert.match(new TextDecoder().decode(event.value),/"storeName":"Store"/);const started=performance.now();
  const posted=await fetch(base+`${devicePath}/frame`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({jpeg:'/9j/YQ==',width:1600,height:900})});assert.equal(posted.status,200);
  let framePacket='',timeout;try{await Promise.race([(async()=>{while(!framePacket.includes('"sequence":1')){const part=await reader.read();assert.equal(part.done,false);framePacket+=new TextDecoder().decode(part.value);}})(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('fresh frame waited for the old 1-second polling timer')),750);})]);}finally{clearTimeout(timeout);}
  assert.ok(performance.now()-started<750);assert.match(framePacket, /"jpeg":"\/9j\/YQ=="/);
  await reader.cancel();await new Promise(r=>setTimeout(r,30));assert.equal((await call(`/controller/${j.id}/frame`)).status,404);assert.ok(audits.some(x=>x.data.event==='ATTENDED_REMOTE_STOP_STREAM_CLOSED'));
  const j2=(await invite()).body;const g2=(await call(`/pos/${j2.id}/consent`,'operator',{accepted:true})).body.grant;revoked=true;assert.equal((await call('/pair','anonymous',{grant:g2})).status,403);assert.ok(audits.length>0);assert.ok(!JSON.stringify(audits).includes(token));
 }finally{route.close();await new Promise(r=>{server.close(r);server.closeAllConnections();});}
});
