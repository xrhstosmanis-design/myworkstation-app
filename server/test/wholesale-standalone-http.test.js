import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {request as nodeRequest} from 'node:http';
import express from 'express';
import {PrismaClient} from '@prisma/client';
import {createWholesaleWorkspaceRouter} from '../src/routes/wholesale-workspace.js';

function isolated(){try{const url=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(url.hostname)&&url.pathname==='/myworkstation_test'}catch{return false}}
const pause=()=>new Promise(resolve=>setTimeout(resolve,15));
const owner={id:'owner-a',companyId:'company-a',sessionId:'session-owner-a',sessionVersion:0,tokenType:'BACKOFFICE_USER',role:'OWNER',platformRole:'OWNER'};

async function http(db){
  // This fixture injects only the already-authenticated upstream claims boundary.
  // The real router must still query/lock actual User, UserSession and grants.
  const state={user:{...owner}},app=express();app.use(express.json());
  app.use((req,res,next)=>{req.user=state.user;next()});
  app.use('/api/wholesale/workspace',createWholesaleWorkspaceRouter({db}));
  app.use((error,req,res,next)=>res.status(500).json({error:'Isolated service unavailable'}));
  const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener))});
  return {state,async get(query){const response=await fetch(`http://127.0.0.1:${server.address().port}/api/wholesale/workspace`+query);return {status:response.status,body:await response.json(),headers:response.headers}},getBody:body=>new Promise((resolve,reject)=>{
    // fetch intentionally forbids GET bodies; use actual HTTP to test that
    // clients cannot smuggle scope/identity overrides through a parsed body.
    const bytes=JSON.stringify(body),req=nodeRequest({host:'127.0.0.1',port:server.address().port,path:'/api/wholesale/workspace?scope=company',method:'GET',headers:{'content-type':'application/json','content-length':Buffer.byteLength(bytes)}},response=>{let text='';response.setEncoding('utf8');response.on('data',part=>{text+=part});response.on('end',()=>{try{resolve({status:response.statusCode,body:JSON.parse(text)})}catch(error){reject(error)}})});req.on('error',reject);req.end(bytes);
  }),close:()=>new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()})};
}

test('native standalone wholesale metadata requires a live personal paid session without CORE, retail or shifts',{skip:!isolated(),timeout:45000},async t=>{
  const schema='wholesale_standalone_'+crypto.randomBytes(8).toString('hex'),admin=new PrismaClient(),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasourceUrl:url.toString()});let api;
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const sql of [
      'CREATE TABLE "Company" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"licenseStatus" TEXT NOT NULL DEFAULT \'ACTIVE\',"subscriptionStartsAt" TIMESTAMPTZ,"subscriptionEndsAt" TIMESTAMPTZ)',
      'CREATE TABLE "CompanyModule" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"moduleKey" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"startsAt" TIMESTAMPTZ,"endsAt" TIMESTAMPTZ,UNIQUE("companyId","moduleKey"))',
      'CREATE TABLE "User" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"fullName" TEXT NOT NULL,"role" TEXT NOT NULL,"passwordHash" TEXT,"sessionVersion" INTEGER NOT NULL DEFAULT 0,"mustChangePassword" BOOLEAN NOT NULL DEFAULT false)',
      'CREATE TABLE "UserSession" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"("id"),"expiresAt" TIMESTAMPTZ NOT NULL,"revokedAt" TIMESTAMPTZ)',
      'CREATE TABLE "Store" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"name" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true)',
      'CREATE TABLE "Sale" ("id" TEXT PRIMARY KEY,"amount" NUMERIC)',
      'CREATE TABLE "StockMovement" ("id" TEXT PRIMARY KEY,"quantity" NUMERIC)',
      'CREATE TABLE "StoreTransaction" ("id" TEXT PRIMARY KEY,"amount" NUMERIC)'
    ])await db.$executeRawUnsafe(sql);
    await db.$executeRaw`INSERT INTO "Company" ("id","name") VALUES ('company-a','Standalone company'),('company-b','Foreign company')`;
    await db.$executeRaw`INSERT INTO "CompanyModule" ("id","companyId","moduleKey") VALUES ('paid-a','company-a','WHOLESALE_B2B'),('paid-b','company-b','WHOLESALE_B2B')`;
    await db.$executeRaw`INSERT INTO "User" ("id","companyId","fullName","role","passwordHash") VALUES ('owner-a','company-a','Current owner','OWNER','private-password-hash'),('employee-a','company-a','Employee','EMPLOYEE','private-employee-hash'),('owner-b','company-b','Foreign owner','OWNER','private-foreign-hash'),('super-a','company-a','Platform manager','SUPER_ADMIN','private-platform-hash')`;
    await db.$executeRaw`INSERT INTO "UserSession" ("id","userId","expiresAt") SELECT 'session-'||"id","id",clock_timestamp()+INTERVAL '1 hour' FROM "User"`;
    await db.$executeRaw`INSERT INTO "Store" ("id","companyId","name","active") VALUES ('store-a','company-a','Selected store',true),('store-a2','company-a','Sibling store',true),('store-off','company-a','Inactive private store',false),('store-b','company-b','Foreign private store',true)`;
    await db.$executeRaw`INSERT INTO "Sale" VALUES ('control-sale',77.33)`;
    await db.$executeRaw`INSERT INTO "StockMovement" VALUES ('control-stock',42)`;
    await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES ('control-money',100.25)`;
    const digest=async()=>{const rows=await db.$queryRaw`SELECT 'Sale' AS kind,row_to_json(s)::text AS value FROM "Sale" s UNION ALL SELECT 'StockMovement',row_to_json(s)::text FROM "StockMovement" s UNION ALL SELECT 'StoreTransaction',row_to_json(s)::text FROM "StoreTransaction" s ORDER BY kind,value`;return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
    const controlsBefore=await digest();
    const tables=async()=>{const rows=await db.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema=${schema} ORDER BY table_name`;return rows.map(row=>row.table_name)};
    const tablesBefore=await tables();
    api=await http(db);
    const rejectPrivate=response=>{assert.ok(response.status>=400);assert.deepEqual(Object.keys(response.body).filter(key=>['user','company','access','stores','storeId'].includes(key)),[]);assert.doesNotMatch(JSON.stringify(response.body),/Current owner|Standalone company|private-password|Sibling store|Foreign private|Inactive private/)};
    const valid=async query=>{const response=await api.get(query);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);return response.body};

    await t.test('explicit company picker and selected-store DTO expose only minimal current metadata',async()=>{
      const central=await valid('?scope=company');
      assert.deepEqual(Object.keys(central).sort(),['access','company','storeId','stores','user']);
      assert.deepEqual(central.user,{id:'owner-a',fullName:'Current owner',role:'OWNER'});
      assert.deepEqual(central.company,{id:'company-a',name:'Standalone company'});
      assert.deepEqual(central.access,{moduleKey:'WHOLESALE_B2B',companyId:'company-a',enabled:true,expiresAt:null});
      assert.equal(central.storeId,'');assert.deepEqual(central.stores.map(store=>store.id).sort(),['store-a','store-a2']);
      for(const store of central.stores)assert.deepEqual(Object.keys(store).sort(),['id','name']);
      const scoped=await valid('?storeId=store-a');assert.equal(scoped.storeId,'store-a');assert.deepEqual(scoped.stores,[{id:'store-a',name:'Selected store'}]);
      assert.equal((await valid('?storeId=%20store-a%20')).storeId,'store-a','normalized explicit store remains scoped');
      assert.doesNotMatch(JSON.stringify(central),/password|sessionVersion|sessionId|price|stock|Foreign|Inactive|email/i);
      assert.deepEqual((await db.$queryRaw`SELECT "moduleKey" FROM "CompanyModule" WHERE "companyId"='company-a'`).map(row=>row.moduleKey),['WHOLESALE_B2B']);
      assert.equal(tablesBefore.some(name=>/shift|product|retail|terminal/i.test(name)),false,'fixture has no retail/shift dependencies');
      try{
        for(const role of ['ADMIN','MANAGER']){
          await db.$executeRaw`UPDATE "User" SET "role"=${role} WHERE "id"='owner-a'`;api.state.user={...owner,role,platformRole:role};
          assert.equal((await valid('?storeId=store-a')).user.role,role);
        }
      }finally{await db.$executeRaw`UPDATE "User" SET "role"='OWNER' WHERE "id"='owner-a'`;api.state.user={...owner}}
    });

    await t.test('missing, empty, array, mixed, unknown and foreign scopes never become central reads',async()=>{
      for(const query of ['', '?storeId=', '?storeId=%20', '?scope=', '?scope=store', '?scope=company&storeId=store-a', '?storeId=store-a&storeId=store-a2', '?storeId[]=store-a', '?scope=company&scope=company', '?scope=company&companyId=company-b', '?storeId=store-a&actorId=owner-b', '?scope=company&userId=owner-b', '?scope=company&body[companyId]=company-b']){
        const response=await api.get(query);assert.equal(response.status,400,query);rejectPrivate(response);
      }
      for(const storeId of ['store-b','store-off','missing']){const response=await api.get('?storeId='+storeId);assert.equal(response.status,404);rejectPrivate(response)}
      for(const body of [{companyId:'company-b'},{storeId:'store-b'},{userId:'owner-b'},['company-b']]){const response=await api.getBody(body);assert.equal(response.status,400);rejectPrivate(response)}
      await valid('?storeId=store-a2');
    });

    await t.test('claims cannot replace current user, session, company or manager authorization',async()=>{
      const attempts=[null,{}, {...owner,tokenType:'B2B_CUSTOMER'}, {...owner,tokenType:'STORE_OPERATOR'}, {...owner,tokenType:'POS_BACKGROUND'}, {...owner,sessionId:undefined}, {...owner,sessionId:'missing'}, {...owner,sessionVersion:undefined}, {...owner,sessionVersion:'0'}, {...owner,sessionVersion:99}, {...owner,id:' owner-a'}, {...owner,id:'employee-a'}, {...owner,sessionId:'session-owner-b'}, {...owner,companyId:'company-b'}, {...owner,companyId:'missing'}, {...owner,companyId:['company-a']}, {...owner,role:'ADMIN'}, {...owner,role:'OWNER',platformRole:'SUPER_ADMIN',isSuperAdmin:true}, {...owner,id:'employee-a',sessionId:'session-employee-a',role:'EMPLOYEE',platformRole:'EMPLOYEE'}];
      try{for(const user of attempts){api.state.user=user;const response=await api.get('?scope=company');assert.ok([401,403].includes(response.status));rejectPrivate(response)}}finally{api.state.user={...owner}}
      for(const supportContext of [true,{companyId:'company-a'}]){api.state.user={...owner,supportContext};const response=await api.get('?storeId=store-a');assert.equal(response.status,403);rejectPrivate(response)}
      api.state.user={...owner};await valid('?scope=company');
      api.state.user={...owner,id:'super-a',sessionId:'session-super-a',role:'OWNER',platformRole:'SUPER_ADMIN',isSuperAdmin:true};
      assert.deepEqual((await valid('?scope=company')).user,{id:'super-a',fullName:'Platform manager',role:'OWNER'},'canonical signed SA role remains compatible with reused suite');api.state.user={...owner};
    });

    await t.test('live session, password, role, grant and company boundaries fail closed independently',async()=>{
      const cases=[
        ['UPDATE "UserSession" SET "revokedAt"=clock_timestamp() WHERE "id"=\'session-owner-a\'','UPDATE "UserSession" SET "revokedAt"=NULL WHERE "id"=\'session-owner-a\''],
        ['UPDATE "UserSession" SET "expiresAt"=clock_timestamp()-INTERVAL \'1 second\' WHERE "id"=\'session-owner-a\'','UPDATE "UserSession" SET "expiresAt"=clock_timestamp()+INTERVAL \'1 hour\' WHERE "id"=\'session-owner-a\''],
        ['UPDATE "User" SET "sessionVersion"=1 WHERE "id"=\'owner-a\'','UPDATE "User" SET "sessionVersion"=0 WHERE "id"=\'owner-a\''],
        ['UPDATE "User" SET "mustChangePassword"=true WHERE "id"=\'owner-a\'','UPDATE "User" SET "mustChangePassword"=false WHERE "id"=\'owner-a\''],
        ['UPDATE "User" SET "role"=\'EMPLOYEE\' WHERE "id"=\'owner-a\'','UPDATE "User" SET "role"=\'OWNER\' WHERE "id"=\'owner-a\''],
        ['UPDATE "Company" SET "active"=false WHERE "id"=\'company-a\'','UPDATE "Company" SET "active"=true WHERE "id"=\'company-a\''],
        ...['TRIAL','PILOT','SUSPENDED','EXPIRED'].map(status=>[`UPDATE "Company" SET "licenseStatus"='${status}' WHERE "id"='company-a'`,'UPDATE "Company" SET "licenseStatus"=\'ACTIVE\' WHERE "id"=\'company-a\'']),
        ['UPDATE "Company" SET "subscriptionStartsAt"=clock_timestamp()+INTERVAL \'1 hour\' WHERE "id"=\'company-a\'','UPDATE "Company" SET "subscriptionStartsAt"=NULL WHERE "id"=\'company-a\''],
        ['UPDATE "Company" SET "subscriptionEndsAt"=clock_timestamp()-INTERVAL \'1 second\' WHERE "id"=\'company-a\'','UPDATE "Company" SET "subscriptionEndsAt"=NULL WHERE "id"=\'company-a\''],
        ['UPDATE "CompanyModule" SET "active"=false WHERE "id"=\'paid-a\'','UPDATE "CompanyModule" SET "active"=true WHERE "id"=\'paid-a\''],
        ['UPDATE "CompanyModule" SET "startsAt"=clock_timestamp()+INTERVAL \'1 hour\' WHERE "id"=\'paid-a\'','UPDATE "CompanyModule" SET "startsAt"=NULL WHERE "id"=\'paid-a\''],
        ['UPDATE "CompanyModule" SET "endsAt"=clock_timestamp()-INTERVAL \'1 second\' WHERE "id"=\'paid-a\'','UPDATE "CompanyModule" SET "endsAt"=NULL WHERE "id"=\'paid-a\'']
      ];
      for(const [deny,restore] of cases){await db.$executeRawUnsafe(deny);try{const response=await api.get('?storeId=store-a');assert.ok([401,403].includes(response.status));rejectPrivate(response)}finally{await db.$executeRawUnsafe(restore)}await valid('?storeId=store-a')}
      await db.$executeRaw`UPDATE "Company" SET "subscriptionEndsAt"=clock_timestamp()+INTERVAL '2 hours' WHERE "id"='company-a'`;
      await db.$executeRaw`UPDATE "CompanyModule" SET "endsAt"=clock_timestamp()+INTERVAL '1 hour' WHERE "id"='paid-a'`;
      try{const [row]=await db.$queryRaw`SELECT "endsAt" FROM "CompanyModule" WHERE "id"='paid-a'`;assert.equal((await valid('?scope=company')).access.expiresAt,row.endsAt.toISOString())}finally{await db.$executeRaw`UPDATE "Company" SET "subscriptionEndsAt"=NULL WHERE "id"='company-a'`;await db.$executeRaw`UPDATE "CompanyModule" SET "endsAt"=NULL WHERE "id"='paid-a'`}
    });

    await t.test('observed Store lock wait cannot leak metadata after session or paid grant expires',async()=>{
      for(const target of ['session','module']){
        if(target==='session')await db.$executeRaw`UPDATE "UserSession" SET "expiresAt"=clock_timestamp()+INTERVAL '4 seconds' WHERE "id"='session-owner-a'`;
        else await db.$executeRaw`UPDATE "CompanyModule" SET "endsAt"=clock_timestamp()+INTERVAL '4 seconds' WHERE "id"='paid-a'`;
        let waiter;
        try{
          await db.$transaction(async holder=>{
            const [ownerPid]=await holder.$queryRaw`SELECT pg_backend_pid() AS pid`;
            await holder.$queryRaw`SELECT "id" FROM "Store" WHERE "id"='store-a' FOR UPDATE`;
            waiter=api.get('?storeId=store-a');let observed=false;const deadline=Date.now()+9000;
            while(Date.now()<deadline){
              // Observe from a separate autocommit query: pg_stat_activity's query
              // text is cached inside the holder transaction and can otherwise
              // retain the request's earlier auth query before it reaches Store.
              const rows=await db.$queryRaw`SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND ${ownerPid.pid}::int=ANY(pg_blocking_pids(pid)) AND query LIKE '%Store%'`;
              if(rows.length){observed=true;break}await pause();
            }
            assert.equal(observed,true,'actual HTTP Store SELECT must wait behind this exact holder');
            while(Date.now()<deadline){
              const [row]=target==='session'?await holder.$queryRaw`SELECT clock_timestamp()>"expiresAt" AS expired FROM "UserSession" WHERE "id"='session-owner-a'`:await holder.$queryRaw`SELECT clock_timestamp()>"endsAt" AS expired FROM "CompanyModule" WHERE "id"='paid-a'`;
              if(row.expired)return;await pause();
            }
            assert.fail('fixture expiry must be observed using PostgreSQL wall clock');
          },{timeout:12000,maxWait:5000});
          const response=await waiter;assert.ok([401,403].includes(response.status));rejectPrivate(response);
        }finally{
          // Holder has committed/rolled back before waiting, so cleanup cannot
          // deadlock against an HTTP request waiting for its fixture-owned row.
          if(waiter)await waiter;
          await db.$executeRaw`UPDATE "UserSession" SET "expiresAt"=clock_timestamp()+INTERVAL '1 hour' WHERE "id"='session-owner-a'`;
          await db.$executeRaw`UPDATE "CompanyModule" SET "endsAt"=NULL WHERE "id"='paid-a'`;
        }
        await valid('?storeId=store-a');
      }
    });

    await t.test('all successful and denied reads leave synthetic business controls and schema unchanged',async()=>{
      assert.equal(await digest(),controlsBefore);assert.deepEqual(await tables(),tablesBefore);
      assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "CompanyModule" WHERE "moduleKey"<>'WHOLESALE_B2B'`)[0].n,0,'no automatic CORE/retail grant');
    });
  }finally{
    if(api)await api.close();await db.$disconnect();
    try{await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)}finally{await admin.$disconnect()}
  }
});
