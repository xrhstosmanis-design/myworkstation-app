import test from "node:test";
import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import net from "node:net";
import jwt from "jsonwebtoken";
import express from "express";
import {createBackgroundDrain,createServerShutdown,allowActiveInvoiceDrainRequest} from "../src/server-shutdown.js";

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const quiet={info(){},warn(){},error(){}};

test("shutdown drains real HTTP, late worker work and repeated signals without interrupting work",async()=>{
  const work=createBackgroundDrain(),signals=new EventEmitter(),read=deferred(),started=deferred(),worker=deferred(),late=deferred();
  let disconnects=0,stopped=0,closed=false;
  work.onStop(()=>stopped++);
  work.track(worker.promise.then(()=>{work.track(late.promise)}));
  const shutdown=createServerShutdown({work,signalTarget:signals,logger:quiet,disconnect:async()=>{assert.equal(closed,true);assert.equal(work.size,0);disconnects++}});
  const app=express();app.use(shutdown.middleware);
  app.get("/hold",async(_,res)=>{started.resolve();await read.promise;res.json({completed:true})});
  app.get("/new",(_,res)=>res.json({unexpected:true}));
  const server=app.listen(0,"127.0.0.1");shutdown.install(server);
  await new Promise(resolve=>server.once("listening",resolve));server.on("close",()=>closed=true);
  const socket=net.connect(server.address().port,"127.0.0.1");
  let output="";socket.on("data",data=>output+=data);const ended=new Promise(resolve=>socket.on("close",resolve));
  socket.write("GET /hold HTTP/1.1\r\nHost: localhost\r\nConnection: keep-alive\r\n\r\n");
  await started.promise;
  signals.emit("SIGTERM");const draining=shutdown.shutdown();signals.emit("SIGINT");
  assert.equal(shutdown.shutdown(),draining);assert.equal(stopped,1);assert.equal(disconnects,0);
  const denied=await fetch(`http://127.0.0.1:${server.address().port}/new`);
  assert.equal(denied.status,503);assert.equal((await denied.json()).code,"SERVER_DRAINING");
  worker.resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(disconnects,0);
  late.resolve();read.resolve();await draining;await ended;
  assert.match(output,/200 OK/);assert.doesNotMatch(output,/unexpected/);assert.equal(disconnects,1);
});

test("existing internal worker calls remain available until work finishes; warning does not force shutdown",async()=>{
  const work=createBackgroundDrain(),worker=deferred(),warning=deferred(),signals=new EventEmitter();let disconnected=false;
  work.track(worker.promise);
  const shutdown=createServerShutdown({work,signalTarget:signals,warningDelayMs:10,logger:{...quiet,warn(){warning.resolve()}},allowInternal:req=>req.path==="/internal",disconnect:async()=>{disconnected=true}});
  const app=express();app.use(shutdown.middleware);app.get("/internal",(_,res)=>res.json({done:true}));
  const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));shutdown.install(server);
  const done=shutdown.shutdown();await warning.promise;
  assert.equal(disconnected,false);assert.equal(server.listening,true);
  const response=await fetch(`http://127.0.0.1:${server.address().port}/internal`);assert.equal(response.status,200);
  await response.json();worker.resolve();await done;assert.equal(disconnected,true);
});

test("shutdown admission allows only signed loopback requests for active invoice jobs; auth still handles body scope",()=>{
  const secret="isolated-shutdown-test",jobId="job-1",path=`/ai-reader/jobs/${jobId}/pos-intake`,active=new Map([[jobId,Promise.resolve()]]);
  const payload={tokenType:"POS_BACKGROUND",jobId,path,method:"POST",bodyHash:"checked-by-existing-auth"};
  const sign=(data=payload,options={})=>jwt.sign(data,secret,{expiresIn:"5m",issuer:"myworkstation-pos-background",audience:"commerce-pos-background",...options});
  const req={socket:{remoteAddress:"127.0.0.1"},originalUrl:"/api/commerce"+path,method:"POST",headers:{authorization:"Bearer "+sign()}};
  assert.equal(allowActiveInvoiceDrainRequest(req,active,secret),true);
  for(const variant of [
    {...req,socket:{remoteAddress:"198.51.100.1"}},
    {...req,method:"DELETE"},
    {...req,originalUrl:"/api/commerce/other"},
    {...req,headers:{authorization:"Bearer "+sign({...payload,jobId:"other"})}},
    {...req,headers:{authorization:"Bearer "+sign(payload,{issuer:"other"})}},
    {...req,headers:{authorization:"Bearer "+sign(payload,{audience:"other"})}},
    {...req,headers:{authorization:"Bearer "+sign(payload,{expiresIn:-1})}},
    {...req,headers:{authorization:"Bearer forged"}}
  ])assert.equal(allowActiveInvoiceDrainRequest(variant,active,secret),false);
  assert.equal(allowActiveInvoiceDrainRequest(req,new Map(),secret),false);
});

test("drain waits late tasks and handles failed tasks; stop is idempotent and invokes all timer cleanup",async()=>{
  const work=createBackgroundDrain(),first=deferred(),second=deferred();let drained=false,calls=0;
  work.onStop(()=>{calls++;throw new Error("timer failure")});work.onStop(()=>calls++);
  work.track(first.promise.then(()=>{work.track(second.promise)}));
  work.track(Promise.reject(new Error("existing task failure")));
  const done=work.drain().then(()=>drained=true);
  assert.throws(()=>work.stop(),AggregateError);work.stop();assert.equal(calls,2);
  first.resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(drained,false);
  second.resolve();await done;assert.equal(work.size,0);
});
