import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createAttendedRemote} from '../src/lib/attended-remote.js';
import {createAttendedRemoteRouter} from '../src/routes/attended-remote.js';

test('independent authenticated input delivery wakes without a frame, drains once, rejects competing consumers and rechecks authority',async()=>{
 let revoked=false,waiting=0;const remote=createAttendedRemote();const subscribe=remote.onCommands.bind(remote);
 remote.onCommands=(id,fn)=>{const remove=subscribe(id,fn);waiting++;return()=>{waiting--;remove();};};
 const db={$queryRaw:async(strings,...v)=>strings.join('').includes('StoreInstallationTerminal')?(v[0]==='t'&&v[1]==='c'&&v[2]==='s'?[{terminalName:'POS',storeName:'Store'}]:[]):revoked?[]:[{id:'os'}],userSession:{findUnique:async()=>({userId:'a',expiresAt:new Date(Date.now()+60000),user:{role:'SUPER_ADMIN',sessionVersion:1}})},authAudit:{create:async()=>{}}};
 const authenticate=(req,res,next)=>{req.user=req.headers['x-pos']?{id:'op',operatorId:'op',employeeId:'e',operatorSessionId:'os',tokenType:'STORE_OPERATOR',role:'EMPLOYEE',companyId:'c',storeId:'s',terminalId:'t'}:{id:'a',sessionId:'as',sessionVersion:1,role:'SUPER_ADMIN'};next();};
 const route=createAttendedRemoteRouter({db,authenticate,service:remote,env:{REMOTE_SUPPORT_ENABLED:'true',REMOTE_SUPPORT_ALL_ENROLLED:'true'}}),app=express();app.use(express.json());app.use(route);app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(path,body,headers={},signal)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined,signal});return {status:r.status,body:await r.json()};};
 const ready=async()=>{const end=Date.now()+1500;while(!waiting&&Date.now()<end)await new Promise(r=>setTimeout(r,5));assert.equal(waiting,1);};
 const start=async()=>{const j=(await call('/invitations',{companyId:'c',storeId:'s',terminalId:'t'})).body;const g=(await call(`/pos/${j.id}/consent`,{accepted:true},{'x-pos':'1'})).body;const p=(await call('/pair',{grant:g.grant})).body;return {id:j.id,headers:{Authorization:`Bearer ${p.token}`}};};
 try{
  let {id,headers}=await start();assert.equal((await call(`/device/${id}/commands`,undefined,{Authorization:'Bearer wrong'})).status,401);
  let pending=call(`/device/${id}/commands`,undefined,headers);await ready();
  assert.equal((await call(`/device/${id}/commands`,undefined,headers)).status,409);
  const at=performance.now();assert.equal((await call(`/controller/${id}/input`,{type:'text',text:'Ελληνικά'})).status,200);
  const result=await pending;assert.equal(result.status,200);assert.equal(result.body.commands[0].text,'Ελληνικά');assert.ok(performance.now()-at<500,'delivery must not wait for the next 900ms frame');
  assert.deepEqual((await call(`/device/${id}/frame`,{jpeg:'/9j/YQ==',width:10,height:10},headers)).body.commands,[]);
  await call(`/controller/${id}/input`,{type:'key',key:'Tab'});
  assert.deepEqual((await call(`/device/${id}/frame`,{jpeg:'/9j/YQ==',width:10,height:10,separateCommands:true},headers)).body.commands,[]);
  assert.equal((await call(`/device/${id}/commands`,undefined,headers)).body.commands[0].key,'Tab');
  // An aborted empty poll leaves no consumer or queue drain behind.
  const abort=new AbortController();pending=call(`/device/${id}/commands`,undefined,headers,abort.signal).catch(e=>e);await ready();abort.abort();assert.equal((await pending).name,'AbortError');
  const end=Date.now()+1000;while(waiting&&Date.now()<end)await new Promise(r=>setTimeout(r,5));assert.equal(waiting,0);
  pending=call(`/device/${id}/commands`,undefined,headers);await ready();await call(`/controller/${id}/stop`,{});assert.equal((await pending).status,404);assert.equal(waiting,0);
  ({id,headers}=await start());pending=call(`/device/${id}/commands`,undefined,headers);await ready();
  // Revoke after registration, with queued input: response must fail closed before drain.
  remote.sessions.command(remote.sessions.controller(id,'a'),{type:'key',key:'Enter'});revoked=true;remote.commandsAvailable(id);
  assert.equal((await pending).status,403);assert.throws(()=>remote.get(id),{status:404});assert.equal(waiting,0);
 }finally{route.close();await new Promise(r=>{server.close(r);server.closeAllConnections();});}
});
