import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {PrismaClient} from '@prisma/client';
import {assertWholesaleEntitlement,createWholesaleEntitlementGuard,getWholesaleEntitlement} from '../src/lib/wholesale-entitlement.js';
import {createWholesaleCapabilitiesRouter} from '../src/routes/wholesale-capabilities.js';

function isolated(){try{const url=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(url.hostname)&&url.pathname==='/myworkstation_test'}catch{return false}}
const pause=()=>new Promise(resolve=>setTimeout(resolve,15));

async function http(db){
  // Upstream authentication is injected here, as in the focused router tests;
  // actual signed JWT/session validation is covered by the operational suites.
  const state={user:{id:'owner-a',companyId:'company-a',sessionId:'session-a',tokenType:'BACKOFFICE_USER',role:'OWNER'}};
  const app=express();app.use((req,res,next)=>{req.user=state.user;next()});
  app.use('/capabilities',createWholesaleCapabilitiesRouter({db}));
  app.use('/protected',createWholesaleEntitlementGuard({db}),(req,res)=>res.json({ok:true}));
  app.use((error,req,res,next)=>res.status(500).json({error:'Isolated service unavailable'}));
  const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener))});
  return {state,async get(path){const response=await fetch(`http://127.0.0.1:${server.address().port}`+path);return {status:response.status,body:await response.json(),headers:response.headers}},close:()=>new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()})};
}

test('native paid wholesale capabilities and guard use explicit company grants and live PostgreSQL time',{skip:!isolated(),timeout:30000},async t=>{
  const schema='wholesale_entitlement_'+crypto.randomBytes(8).toString('hex'),admin=new PrismaClient(),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasourceUrl:url.toString()});let api;
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await db.$executeRawUnsafe('CREATE TABLE "Company" ("id" TEXT PRIMARY KEY,"active" BOOLEAN NOT NULL DEFAULT true,"licenseStatus" TEXT NOT NULL DEFAULT \'ACTIVE\',"subscriptionStartsAt" TIMESTAMPTZ,"subscriptionEndsAt" TIMESTAMPTZ)');
    await db.$executeRawUnsafe('CREATE TABLE "CompanyModule" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"moduleKey" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"startsAt" TIMESTAMPTZ,"endsAt" TIMESTAMPTZ,UNIQUE("companyId","moduleKey"))');
    await db.$executeRaw`INSERT INTO "Company" ("id") VALUES ('company-a'),('company-b')`;
    await db.$executeRaw`INSERT INTO "CompanyModule" ("id","companyId","moduleKey") VALUES ('core-a','company-a','CORE'),('paid-b','company-b','WHOLESALE_B2B')`;
    api=await http(db);
    const check=async enabled=>{
      const caps=await api.get('/capabilities');assert.equal(caps.status,200);assert.equal(caps.body.enabled,enabled);assert.equal(caps.body.companyId,'company-a');assert.equal(caps.body.moduleKey,'WHOLESALE_B2B');assert.equal(caps.headers.get('cache-control'),'no-store');
      assert.equal((await api.get('/protected')).status,enabled?200:403);return caps.body;
    };
    await t.test('CORE and a foreign paid grant never enable the selected company, even for Super Admin',async()=>{
      await check(false);
      api.state.user={...api.state.user,role:'SUPER_ADMIN',platformRole:'SUPER_ADMIN',isSuperAdmin:true};
      await check(false);
      assert.equal((await api.get('/capabilities?companyId=company-b')).status,400,'query input cannot select another company');
      api.state.user={...api.state.user,role:'OWNER',platformRole:'OWNER',isSuperAdmin:false};
      await db.$executeRaw`INSERT INTO "CompanyModule" ("id","companyId","moduleKey") VALUES ('paid-a','company-a','WHOLESALE_B2B')`;
      const granted=await check(true);assert.equal(granted.expiresAt,null);
    });
    await t.test('each current status and date boundary fails closed independently',async()=>{
      const cases=[
        ['company inactive','UPDATE "Company" SET "active"=false WHERE "id"=\'company-a\'','UPDATE "Company" SET "active"=true WHERE "id"=\'company-a\''],
        ...['TRIAL','PILOT','SUSPENDED','EXPIRED'].map(status=>[status,`UPDATE "Company" SET "licenseStatus"='${status}' WHERE "id"='company-a'`,'UPDATE "Company" SET "licenseStatus"=\'ACTIVE\' WHERE "id"=\'company-a\'']),
        ['subscription not started','UPDATE "Company" SET "subscriptionStartsAt"=clock_timestamp()+INTERVAL \'1 hour\' WHERE "id"=\'company-a\'','UPDATE "Company" SET "subscriptionStartsAt"=NULL WHERE "id"=\'company-a\''],
        ['subscription expired','UPDATE "Company" SET "subscriptionEndsAt"=clock_timestamp()-INTERVAL \'1 hour\' WHERE "id"=\'company-a\'','UPDATE "Company" SET "subscriptionEndsAt"=NULL WHERE "id"=\'company-a\''],
        ['module inactive','UPDATE "CompanyModule" SET "active"=false WHERE "id"=\'paid-a\'','UPDATE "CompanyModule" SET "active"=true WHERE "id"=\'paid-a\''],
        ['module not started','UPDATE "CompanyModule" SET "startsAt"=clock_timestamp()+INTERVAL \'1 hour\' WHERE "id"=\'paid-a\'','UPDATE "CompanyModule" SET "startsAt"=NULL WHERE "id"=\'paid-a\''],
        ['module expired','UPDATE "CompanyModule" SET "endsAt"=clock_timestamp()-INTERVAL \'1 hour\' WHERE "id"=\'paid-a\'','UPDATE "CompanyModule" SET "endsAt"=NULL WHERE "id"=\'paid-a\'']
      ];
      for(const [label,deny,restore] of cases){
        await db.$executeRawUnsafe(deny);
        try{assert.equal((await getWholesaleEntitlement(db,'company-a')).enabled,false,label);await check(false)}finally{await db.$executeRawUnsafe(restore)}
        await check(true);
      }
      await db.$executeRaw`UPDATE "Company" SET "subscriptionStartsAt"=clock_timestamp()-INTERVAL '1 hour',"subscriptionEndsAt"=clock_timestamp()+INTERVAL '2 hours' WHERE "id"='company-a'`;
      await db.$executeRaw`UPDATE "CompanyModule" SET "startsAt"=clock_timestamp()-INTERVAL '1 hour',"endsAt"=clock_timestamp()+INTERVAL '1 hour' WHERE "id"='paid-a'`;
      const [expected]=await db.$queryRaw`SELECT "endsAt" FROM "CompanyModule" WHERE "id"='paid-a'`;
      assert.equal((await check(true)).expiresAt,expected.endsAt.toISOString());
      await db.$executeRaw`UPDATE "Company" SET "subscriptionStartsAt"=NULL,"subscriptionEndsAt"=NULL WHERE "id"='company-a'`;
      await db.$executeRaw`UPDATE "CompanyModule" SET "startsAt"=NULL,"endsAt"=NULL WHERE "id"='paid-a'`;
    });
    await t.test('invalid personal auth context is rejected and unknown companies cannot borrow a grant',async()=>{
      const original=api.state.user;
      try{
        for(const patch of [null,{sessionId:null},{tokenType:'STORE_OPERATOR'},{companyId:undefined}]){
          api.state.user=patch===null?null:{...original,...patch};assert.equal((await api.get('/capabilities')).status,401);
        }
        api.state.user={...original,companyId:'missing-company'};assert.equal((await api.get('/capabilities')).body.enabled,false);assert.equal((await api.get('/protected')).status,403);
      }finally{api.state.user=original}
    });
    await t.test('an observed FOR SHARE waiter is denied after its module expires while waiting',async()=>{
      // Short wall-clock lifetime; only a fixture-owned module row is locked.
      // Observe the actual PostgreSQL blocker rather than assuming a timed wait.
      await db.$executeRaw`UPDATE "CompanyModule" SET "endsAt"=clock_timestamp()+INTERVAL '2 seconds' WHERE "id"='paid-a'`;
      let waiter,waiterPid,observed=false;
      try{
        await db.$transaction(async holder=>{
          const [owner]=await holder.$queryRaw`SELECT pg_backend_pid() AS pid`;
          await holder.$queryRaw`SELECT "id" FROM "CompanyModule" WHERE "id"='paid-a' FOR UPDATE`;
          waiter=db.$transaction(async tx=>{
            [ {pid:waiterPid} ]=await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
            return assertWholesaleEntitlement(tx,'company-a',{lock:true});
          },{timeout:10000,maxWait:5000}).then(value=>({value}),error=>({error}));
          const deadline=Date.now()+5000;
          while(Date.now()<deadline){
            if(waiterPid){const [locks]=await holder.$queryRaw`SELECT pg_blocking_pids(${waiterPid}::int) AS blockers`;if(locks.blockers.includes(owner.pid)){observed=true;break}}
            await pause();
          }
          assert.equal(observed,true,'the entitlement SELECT must be blocked by this exact module row owner');
          while(Date.now()<deadline){
            const [clock]=await holder.$queryRaw`SELECT clock_timestamp()>"endsAt" AS expired FROM "CompanyModule" WHERE "id"='paid-a'`;
            if(clock.expired)return;await pause();
          }
          assert.fail('fixture module must expire before releasing the row lock');
        },{timeout:10000,maxWait:5000});
        const result=await waiter;assert.equal(result.value,undefined);assert.equal(result.error?.status,403);assert.equal(result.error?.code,'WHOLESALE_MODULE_DISABLED');
      }finally{
        // Rollback/commit always releases the holder before awaiting the waiter.
        if(waiter)await waiter;
        await db.$executeRaw`UPDATE "CompanyModule" SET "endsAt"=NULL WHERE "id"='paid-a'`;
      }
      await check(true);
    });
    await t.test('capability and guard reads introduce no schema or business mutations',async()=>{
      const before=await db.$queryRaw`SELECT row_to_json(c) AS row FROM "CompanyModule" c ORDER BY "id"`;
      await check(true);await db.$transaction(tx=>assertWholesaleEntitlement(tx,'company-a',{lock:true}));
      assert.deepEqual(await db.$queryRaw`SELECT row_to_json(c) AS row FROM "CompanyModule" c ORDER BY "id"`,before);
      const rows=await db.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema=${schema} ORDER BY table_name`;
      assert.deepEqual(rows.map(row=>row.table_name),['Company','CompanyModule'],'no wholesale/customer/seller bootstrap is permitted');
    });
  }finally{
    if(api)await api.close();await db.$disconnect();
    try{await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)}finally{await admin.$disconnect()}
  }
});
