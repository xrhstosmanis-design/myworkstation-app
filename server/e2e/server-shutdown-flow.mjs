import assert from "node:assert/strict";
import crypto from "node:crypto";
import {fork} from "node:child_process";
import {fileURLToPath} from "node:url";
import {PrismaClient} from "@prisma/client";

assert.equal(process.env.NODE_ENV,"test");
const url=new URL(process.env.DATABASE_URL);
assert.ok(["localhost","127.0.0.1"].includes(url.hostname),"Only isolated local database allowed");
const schema="mws_shutdown_"+crypto.randomBytes(8).toString("hex");
const admin=new PrismaClient();url.searchParams.set("schema",schema);url.searchParams.set("connection_limit","4");
const db=new PrismaClient({datasourceUrl:url.toString()});
let child;const observed=[],waiters=[];let stderr="",exitResult;
const timeout=setTimeout(()=>{stderr+="Isolated shutdown fixture exceeded 25s";child?.kill("SIGKILL")},25000);
function event(name){
  const old=observed.find(value=>value.event===name);if(old)return Promise.resolve(old);
  if(exitResult)return Promise.reject(new Error("Child exited before "+name+": "+JSON.stringify(exitResult)+stderr));
  return new Promise((resolve,reject)=>waiters.push({name,resolve,reject}));
}
try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const [current]=await db.$queryRaw`SELECT current_schema() AS name`;assert.equal(current.name,schema);
  await db.$executeRawUnsafe('CREATE TABLE "ShutdownFixture" ("id" TEXT PRIMARY KEY)');
  await db.$executeRaw`INSERT INTO "ShutdownFixture" ("id") VALUES ('retained')`;
  child=fork(fileURLToPath(new URL("./fixtures/server-shutdown-child.mjs",import.meta.url)),[],{env:{...process.env,DATABASE_URL:url.toString(),SHUTDOWN_FIXTURE_SCHEMA:schema},stdio:["ignore","ignore","pipe","ipc"]});
  child.stderr.on("data",data=>stderr+=data);
  child.on("message",value=>{observed.push(value);for(const waiter of [...waiters])if(waiter.name===value.event){waiters.splice(waiters.indexOf(waiter),1);waiter.resolve(value)}});
  const exited=new Promise(resolve=>child.on("exit",(code,signal)=>{exitResult={code,signal};for(const waiter of waiters)waiter.reject(new Error("Child exit: "+JSON.stringify(exitResult)+stderr));resolve(exitResult)}));
  const {port}=await event("ready"),base=`http://127.0.0.1:${port}`;
  const read=fetch(base+"/read"),write=fetch(base+"/write",{method:"POST"});
  const held=await Promise.all([event("read-held"),event("write-held")]);
  const before=await db.$queryRaw`SELECT "id" FROM "ShutdownFixture" ORDER BY "id"`;assert.deepEqual(before,[{id:"retained"}]);
  child.kill("SIGTERM");await event("Server shutdown started");child.kill("SIGINT");
  const denied=await fetch(base+"/new");assert.equal(denied.status,503);assert.equal((await denied.json()).code,"SERVER_DRAINING");
  await event("Server shutdown still draining; active work was not force-closed");assert.equal(observed.some(v=>v.event==="disconnected"),false);
  child.send({release:"read"});child.send({release:"write"});child.send({release:"worker"});
  const [readResponse,writeResponse]=await Promise.all([read,write]);assert.equal(readResponse.status,200);assert.equal(writeResponse.status,200);
  assert.deepEqual(await readResponse.json(),[{id:"retained"}]);assert.deepEqual(await writeResponse.json(),{committed:true});
  await event("internal-completed");await event("disconnected");assert.deepEqual(await exited,{code:0,signal:null});
  assert.equal(observed.filter(v=>v.event==="disconnected").length,1);
  const after=await db.$queryRaw`SELECT "id" FROM "ShutdownFixture" ORDER BY "id"`;assert.deepEqual(after,[{id:"committed-once"},{id:"retained"}]);
  const pids=held.map(v=>v.pid);const remaining=await admin.$queryRaw`SELECT pid FROM pg_stat_activity WHERE pid=ANY(${pids}::int[])`;assert.equal(remaining.length,0);
  console.log("Server shutdown isolated PostgreSQL + HTTP PASS: SIGTERM/SIGINT preserve held read and one committed fixture write, deny new traffic, allow active signed loopback worker calls, drain/disconnect once and release database connections. No production action or capacity claim.");
}finally{
  clearTimeout(timeout);if(child&&!exitResult){child.kill("SIGKILL");await new Promise(resolve=>child.once("exit",resolve))}
  await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();
}
