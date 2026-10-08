import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import {PrismaClient} from "@prisma/client";
import {createBackgroundDrain,createServerShutdown,allowActiveInvoiceDrainRequest} from "../../src/server-shutdown.js";

assert.equal(process.env.NODE_ENV,"test");
assert.ok(["localhost","127.0.0.1"].includes(new URL(process.env.DATABASE_URL).hostname));
const db=new PrismaClient(),work=createBackgroundDrain(),active=new Map();
const barriers=new Map();
function held(key){return new Promise(resolve=>barriers.set(key,resolve))}
process.on("message",message=>{if(message.release)barriers.get(message.release)?.()});
const send=data=>{if(process.connected)process.send(data)};
const shutdown=createServerShutdown({work,warningDelayMs:100,allowInternal:req=>allowActiveInvoiceDrainRequest(req,active,process.env.JWT_SECRET),logger:{info(message){send({event:message})},warn(message){send({event:message})},error(message){send({event:message})}},disconnect:async()=>{assert.equal(work.size,0);await db.$disconnect();send({event:"disconnected"});process.disconnect()}});
const app=express();app.use(shutdown.middleware);
app.get("/read",async(_,res,next)=>{try{
  const result=await db.$transaction(async tx=>{
    const [pid]=await tx.$queryRaw`SELECT pg_backend_pid()::int AS pid`;
    const rows=await tx.$queryRaw`SELECT "id" FROM "ShutdownFixture" ORDER BY "id"`;
    send({event:"read-held",pid:pid.pid});await held("read");return rows;
  },{timeout:20000});res.json(result);
}catch(error){next(error)}});
app.post("/write",async(_,res,next)=>{try{
  await db.$transaction(async tx=>{
    const [pid]=await tx.$queryRaw`SELECT pg_backend_pid()::int AS pid`;
    await tx.$executeRaw`INSERT INTO "ShutdownFixture" ("id") VALUES ('committed-once')`;
    send({event:"write-held",pid:pid.pid});await held("write");
  },{timeout:20000});res.json({committed:true});
}catch(error){next(error)}});
app.post("/api/commerce/ai-reader/jobs/job-1/pos-intake",async(_,res,next)=>{try{await db.$queryRaw`SELECT "id" FROM "ShutdownFixture"`;res.json({internal:true})}catch(error){next(error)}});
app.get("/new",(_,res)=>res.json({unexpected:true}));
app.use((error,_,res,_next)=>res.status(500).json({error:String(error.message)}));
const server=app.listen(0,"127.0.0.1",async()=>{
  const [schema]=await db.$queryRaw`SELECT current_schema() AS name`;
  assert.equal(schema.name,process.env.SHUTDOWN_FIXTURE_SCHEMA);
  const port=server.address().port;
  const worker=(async()=>{
    await held("worker");
    const path="/ai-reader/jobs/job-1/pos-intake";
    const token=jwt.sign({tokenType:"POS_BACKGROUND",jobId:"job-1",path,method:"POST"},process.env.JWT_SECRET,{issuer:"myworkstation-pos-background",audience:"commerce-pos-background",expiresIn:"1m"});
    const response=await fetch(`http://127.0.0.1:${port}/api/commerce${path}`,{method:"POST",headers:{authorization:`Bearer ${token}`}});
    assert.equal(response.status,200,await response.text());send({event:"internal-completed"});
  })().finally(()=>active.delete("job-1"));
  active.set("job-1",worker);work.track(worker);
  send({event:"ready",port});
});
shutdown.install(server);
