import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {execFileSync} from 'node:child_process';
import jwt from 'jsonwebtoken';
import {Prisma,PrismaClient} from '@prisma/client';
import {createPosCatalogResolver} from '../../client/src/utils/pos-catalog-resolver.js';
import {isolatedDestination,stages,cohort,scheduleActions,runSchedule,localJson} from '../../tools/pos-capacity/runner.mjs';

import {priority20Phases,priority20Events,assessPhase} from '../../tools/pos-capacity/profiles.mjs';

const destination=isolatedDestination(process.env); // No connection or request before this gate.
const mode=process.env.MWS_CAPACITY_MODE||'smoke';
assert.ok(['smoke','measure','priority20'].includes(mode),'Unknown capacity mode');
const profile=process.env.MWS_CAPACITY_PROFILE||'full';
const phases=mode==='priority20'?priority20Phases(profile):stages;
const fixtureStores=mode==='priority20'?20:100;
const integer=(name,fallback,min,max)=>{
  const v=Number(process.env[name]??fallback);assert.ok(Number.isInteger(v)&&v>=min&&v<=max,`Invalid ${name}`);return v;
};
const productCount=integer('MWS_CAPACITY_PRODUCTS',7000,100,20000);
const storeProductCount=integer('MWS_CAPACITY_STORE_PRODUCTS',mode==='smoke'?32:5000,2,Math.min(productCount,5000));
const stageSeconds=integer('MWS_CAPACITY_STAGE_SECONDS',1800,60,10800);
const runId=`capacity-${crypto.randomUUID()}`;
const outDir=path.resolve(process.env.MWS_CAPACITY_OUTPUT||path.join('output','capacity',runId));
const url=new URL(process.env.DATABASE_URL);url.searchParams.set('connection_limit','2');
const db=new PrismaClient({datasourceUrl:url.toString()});
const ledger={runId,startedAt:new Date().toISOString(),fixture:null,before:null,stages:[],requests:[],database:[],after:null};
let httpRequests=0,monitor,observationPromise;
const request=async(route,actor,options={})=>{
  httpRequests++;
  return localJson(destination.base,route,{token:actor?.token,terminalPos:actor?.terminalPos,...options});
};
const checked=async(route,actor,options={})=>{
  const r=await request(route,actor,options);assert.equal(r.ok,true,`Fixture action rejected (${r.status||'network'})`);return r.value;
};
const writeResult=()=>{fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,'result.json'),JSON.stringify(ledger,null,2)+'\n')};
const safeRevision=()=>{try{return execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}catch{return 'NOT_MEASURED'}};

async function fixture(){
  const [identity]=await db.$queryRaw`SELECT current_database() AS name`;
  assert.equal(identity.name,destination.database,'Connected database differs from isolated manifest');
  const expires=new Date(Date.now()+24*60*60*1000);
  const company=await db.company.create({data:{id:`${runId}-company`,name:'Synthetic capacity only',active:true,licenseStatus:'ACTIVE',subscriptionEndsAt:expires}});
  await db.companyModule.createMany({data:['STORE_MODE','CASH_CONTROL','INVENTORY'].map(moduleKey=>({companyId:company.id,moduleKey,active:true}))});
  const stores=Array.from({length:fixtureStores+1},(_,i)=>({id:`${runId}-store-${i}`,name:`Synthetic store ${i}`,companyId:company.id,active:true,cashCloseEmailEnabled:false}));
  await db.store.createMany({data:stores});
  const owners=[];
  for(let i=0;i<fixtureStores;i++){
    const user=await db.user.create({data:{id:`${runId}-owner-${i}`,email:`${runId}-${i}@example.invalid`,fullName:'Synthetic BackOffice',companyId:company.id,role:'OWNER',passwordHash:'isolated-no-login',mustChangePassword:false}});
    const session=await db.userSession.create({data:{userId:user.id,expiresAt:expires}});
    owners.push({id:user.id,storeIndex:i,storeId:stores[i].id,token:jwt.sign({id:user.id,role:'OWNER',companyId:company.id,sessionId:session.id,sessionVersion:user.sessionVersion,fullName:user.fullName},process.env.JWT_SECRET,{expiresIn:'12h'})});
  }
  // Initialize through existing APIs; do not invent or alter application schemas.
  await checked(`/api/operator-management/stores/${stores[0].id}/operators`,owners[0]);
  await checked(`/api/operators/stores/${stores[0].id}/directory`,null);
  await checked(`/api/cash/stores/${stores[0].id}/overview`,owners[0]);
  await db.$executeRaw`INSERT INTO "Product" ("id","companyId","name","sku","salePrice","costPrice","vatRate","active","trackStock") SELECT ${runId}||'-product-'||i,${company.id},'Capacity Product '||lpad(i::text,5,'0'),'CAP'||lpad(i::text,5,'0'),2.50,1,24,i%10<>0,TRUE FROM generate_series(1,${productCount}::int) i`;
  await db.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") SELECT ${runId}||'-barcode-'||i,${runId}||'-product-'||i,'998'||lpad(i::text,10,'0'),1 FROM generate_series(1,${productCount}::int) i`;
  await db.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","active","currentStock","minStock") SELECT s."id"||'-sp-'||i,s."id",${runId}||'-product-'||i,2.50,TRUE,100000,0 FROM "Store" s CROSS JOIN generate_series(1,${storeProductCount}::int) i WHERE s."companyId"=${company.id}`;
  const foreign=await db.company.create({data:{id:`${runId}-foreign-company`,name:'Synthetic foreign control',active:true,licenseStatus:'ACTIVE',subscriptionEndsAt:expires}});
  const foreignStore=await db.store.create({data:{id:`${runId}-foreign-store`,name:'Synthetic foreign control',companyId:foreign.id,cashCloseEmailEnabled:false}});
  await db.$executeRaw`INSERT INTO "Product" ("id","companyId","name","sku","salePrice","active") VALUES (${runId+'-foreign-product'},${foreign.id},'FOREIGN-CAPACITY-CONTROL','FOREIGN-CAPACITY-CONTROL',999,TRUE)`;
  const actors=[];
  for(let i=0;i<fixtureStores;i++)for(let terminalIndex=0;terminalIndex<(i<fixtureStores/10?2:1);terminalIndex++){
    const id=`${runId}-operator-${i}-${terminalIndex}`,employeeId=`${id}-employee`,sessionId=`${id}-session`,shiftId=`${id}-shift`,terminalPos=`POS-${terminalIndex+1}`;
    await db.employee.create({data:{id:employeeId,storeId:stores[i].id,fullName:'Synthetic operator',active:true}});
    await db.$executeRaw`INSERT INTO "StoreOperatorCredential" ("id","companyId","storeId","employeeId","displayName","role","active","createdBy") VALUES (${id},${company.id},${stores[i].id},${employeeId},'Synthetic operator','EMPLOYEE',TRUE,${owners[0].id})`;
    await db.$executeRaw`INSERT INTO "StoreOperatorProfile" ("id","companyId","storeId","employeeId","posAccess","terminalPos","permissions","createdBy") VALUES (${id+'-profile'},${company.id},${stores[i].id},${employeeId},TRUE,${terminalPos},'{"cash":true,"cards":true,"initialCash":true,"shiftTransactionsPos":true,"sameShiftPayments":true}'::jsonb,${owners[0].id})`;
    await db.$executeRaw`INSERT INTO "StoreOperatorSession" ("id","operatorId","companyId","storeId","terminalPos","expiresAt") VALUES (${sessionId},${id},${company.id},${stores[i].id},${terminalPos},${expires})`;
    await db.$executeRaw`INSERT INTO "CashShiftSession" ("id","companyId","storeId","terminalPos","openedBy","openedByName","openingDrawer","openingOperational") VALUES (${shiftId},${company.id},${stores[i].id},${terminalPos},${id},'Synthetic operator',20,20)`;
    actors.push({id,employeeId,shiftId,storeIndex:i,terminalIndex,terminalPos,storeId:stores[i].id,
      token:jwt.sign({id,operatorId:id,employeeId,companyId:company.id,storeId:stores[i].id,role:'EMPLOYEE',tokenType:'STORE_OPERATOR',operatorSessionId:sessionId,terminalPos},process.env.JWT_SECRET,{expiresIn:'12h'})});
  }
  return {companyId:company.id,foreignStoreId:foreignStore.id,stores,owners,actors,productId:`${runId}-product-1`,controlStoreId:stores[fixtureStores].id};
}

async function snapshot(f){
  const sales=await db.$queryRaw`SELECT "id","storeId","operatorEmployeeId","clientTransactionId","total" FROM "Sale" WHERE "companyId"=${f.companyId} ORDER BY "id"`;
  const payments=await db.$queryRaw`SELECT p."saleId",p."method",p."amount" FROM "Payment" p JOIN "Sale" s ON s."id"=p."saleId" WHERE s."companyId"=${f.companyId} ORDER BY p."saleId"`;
  const transactions=await db.$queryRaw`SELECT "sessionId","type",COUNT(*)::int AS count,COALESCE(SUM("amount"),0)::float8 AS amount FROM "StoreTransaction" WHERE "companyId"=${f.companyId} GROUP BY "sessionId","type" ORDER BY "sessionId","type"`;
  const stock=await db.$queryRaw`SELECT sp."storeId",sp."currentStock"::float8 AS quantity FROM "StoreProduct" sp JOIN "Store" s ON s."id"=sp."storeId" WHERE s."companyId"=${f.companyId} AND sp."productId"=${f.productId} ORDER BY sp."storeId"`;
  const movements=await db.$queryRaw`SELECT m."storeId",m."sourceId",m."quantity",m."idempotencyKey" FROM "StockMovement" m JOIN "Store" s ON s."id"=m."storeId" WHERE s."companyId"=${f.companyId} ORDER BY m."sourceId"`;
  const audits=await db.$queryRaw`SELECT "storeId","operatorId","details"->>'saleId' AS "saleId" FROM "StoreOperatorAudit" WHERE "companyId"=${f.companyId} AND "eventType"='POS_SALE_COMPLETED' ORDER BY "details"->>'saleId'`;
  return JSON.parse(JSON.stringify({sales,payments,transactions,stock,movements,audits}));
}

function reconcile(f,after){
  const intended=ledger.requests;
  assert.equal(after.sales.length,intended.length,'Every intended sale must persist once');
  assert.equal(new Set(after.sales.map(s=>s.clientTransactionId)).size,intended.length,'Duplicate request identity');
  assert.equal(after.payments.length,intended.length);assert.equal(after.movements.length,intended.length);assert.equal(after.audits.length,intended.length);
  for(const sale of after.sales){
    const r=intended.find(r=>r.requestId===sale.clientTransactionId);assert.ok(r,'Unplanned fixture sale');
    assert.equal(sale.storeId,r.storeId);assert.equal(sale.operatorEmployeeId,r.employeeId);assert.equal(Number(sale.total),2.5);
    const p=after.payments.filter(p=>p.saleId===sale.id);assert.equal(p.length,1);assert.equal(p[0].method,'CASH');assert.equal(Number(p[0].amount),2.5);
    const m=after.movements.filter(m=>m.sourceId===sale.id);assert.equal(m.length,1);assert.equal(m[0].storeId,r.storeId);assert.equal(Number(m[0].quantity),-1);
    const a=after.audits.find(a=>a.saleId===sale.id);assert.equal(a?.operatorId,r.actorId);assert.equal(a?.storeId,r.storeId);
  }
  for(const actor of f.actors){
    const count=intended.filter(r=>r.actorId===actor.id).length;
    const tx=after.transactions.filter(t=>t.sessionId===actor.shiftId);
    assert.equal(tx.length,count?1:0);if(count){assert.equal(tx[0].type,'SALE_CASH');assert.equal(tx[0].count,count);assert.equal(tx[0].amount,count*2.5)}
  }
  for(const s of after.stock){const count=intended.filter(r=>r.storeId===s.storeId).length;assert.equal(s.quantity,100000-count,'Store stock/control must reconcile exactly')}
  assert.equal(after.stock.find(s=>s.storeId===f.controlStoreId).quantity,100000);
}

async function observeDatabase(){
  const [sample]=await db.$queryRaw`SELECT COUNT(*)::int AS connections,COUNT(*) FILTER(WHERE state='active')::int AS active,COUNT(*) FILTER(WHERE wait_event_type='Lock')::int AS lockWaiters,COALESCE(MAX(EXTRACT(EPOCH FROM clock_timestamp()-query_start)) FILTER(WHERE state='active'),0)::float8 AS oldestActiveSeconds,current_setting('max_connections')::int AS maxConnections,current_setting('superuser_reserved_connections')::int AS reservedConnections FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()`;
  ledger.database.push({at:new Date().toISOString(),...sample});
}

try{
  ledger.environment={sourceRevision:safeRevision(),node:process.version,generator:{cpuCount:os.cpus().length,totalMemoryBytes:os.totalmem(),platform:os.platform()},destination:{host:destination.host,database:destination.database},mode,profile:mode==='priority20'?profile:null,productCount,storeProductCount,
    applicationHardware:process.env.MWS_CAPACITY_RESOURCE_MODEL||'NOT_MEASURED',applicationPoolLimit:process.env.MWS_CAPACITY_APP_POOL_LIMIT||'NOT_MEASURED',diagnosticPoolLimit:2,
    omitted:['invoice/provider job load','myDATA/workforce job budget','independent-company distribution','supplier and financial history volume','optional holds/audience/table-service refresh calls','physical devices/UI rendering','external fiscal/card providers','restart/failover/restore'],
    conclusion:'ISOLATED_HARNESS_ONLY_NOT_PRODUCTION_CAPACITY'};
  const version=await db.$queryRaw`SELECT version() AS version`;ledger.environment.postgres=version[0].version;
  const f=await fixture();
  ledger.fixture={companyId:f.companyId,stores:f.stores.map(s=>s.id),controlStoreId:f.controlStoreId,productId:f.productId,actors:f.actors.map(({id,storeId,employeeId,shiftId,terminalPos})=>({id,storeId,employeeId,shiftId,terminalPos}))};
  ledger.before=await snapshot(f);assert.equal(ledger.before.sales.length,0);writeResult();
  assert.equal((await request(`/api/store-pos/stores/${f.stores[0].id}`)).status,401);
  assert.equal((await request(`/api/store-pos/stores/${f.stores[1].id}`,f.actors[0])).status,403);
  assert.equal((await request(`/api/store-pos/stores/${f.foreignStoreId}`,f.owners[0])).status,404);
  assert.deepEqual(await checked('/api/owner-products/catalog?q=FOREIGN-CAPACITY-CONTROL',f.owners[0]),[]);
  const forbidden=await request(`/api/store-pos/stores/${f.stores[1].id}/checkout`,f.actors[0],{method:'POST',body:{items:[{productId:f.productId,quantity:1}],paymentMethod:'CASH',clientTransactionId:crypto.randomUUID()}});assert.equal(forbidden.status,403);
  assert.deepEqual(await snapshot(f),ledger.before,'Negative controls changed business values');
  // Warm catalogs before timed local resolver actions; login/opening workflow itself is not under test.
  const catalogs=new Map();
  for(const actor of f.actors){
    const payload=await checked(`/api/store-pos/stores/${actor.storeId}`,actor);
    assert.equal(payload.store.id,actor.storeId);assert.ok(payload.products.some(p=>p.id===f.productId));
    catalogs.set(actor.id,createPosCatalogResolver(payload.products,false));
  }
  await observeDatabase();let observing=false;
  monitor=setInterval(()=>{if(!observing){observing=true;observationPromise=observeDatabase().catch(()=>{ledger.diagnosticFailure=true}).finally(()=>{observing=false})}},1000);
  for(const stage of phases){
    const actors=cohort(f.actors,stage.stores),owners=f.owners.slice(0,stage.stores);
    let events;
    const posSpecs=[{kind:'pos-local-search',perMinute:6},{kind:'pos-refresh',perMinute:1},{kind:'pos-session',perMinute:2},{kind:'pos-sale',perMinute:1}];
    const boSpecs=[{kind:'backoffice-search',perMinute:1},{kind:'backoffice-report',perMinute:.2}];
    if(mode==='priority20')events=priority20Events(stage,actors,owners);
    else if(mode==='smoke'){
      events=[...scheduleActions(actors,posSpecs,1,{seed:`${stage.pos}-pos`,burst:true}),...scheduleActions(owners,boSpecs,1,{seed:`${stage.pos}-bo`,burst:true})];
      // Small regression smoke: spread requests; do not disguise it as the planned peak/burst.
      events.sort((a,b)=>a.id.localeCompare(b.id));events.forEach((e,i)=>{e.atMs=i*20});
    }else events=[...scheduleActions(actors,posSpecs,stageSeconds*1000,{seed:`${stage.pos}-pos`}),...scheduleActions(owners,boSpecs,stageSeconds*1000,{seed:`${stage.pos}-bo`})].sort((a,b)=>a.atMs-b.atMs);
    for(const event of events)if(event.kind==='pos-sale'){
      event.requestId=crypto.randomUUID();ledger.requests.push({actionId:event.id,requestId:event.requestId,actorId:event.actor.id,employeeId:event.actor.employeeId,storeId:event.actor.storeId,shiftId:event.actor.shiftId,terminalPos:event.actor.terminalPos,productId:f.productId,quantity:1,method:'CASH',amount:2.5});
    }
    ledger.stages.push({name:stage.name||String(stage.stores),profile:stage.profile||mode,plannedSeconds:stage.seconds??null,stores:stage.stores,pos:stage.pos,backoffice:owners.length,before:await snapshot(f),scheduledActions:events.length,startedAt:new Date().toISOString()});writeResult();
    const httpBefore=httpRequests,phaseStarted=Date.now();
    console.log('Capacity phase started',JSON.stringify({name:stage.name||String(stage.stores),stores:stage.stores,pos:stage.pos,profile:stage.profile||mode,plannedSeconds:stage.seconds??null,scheduledActions:events.length}));
    const metrics=await runSchedule(events,async event=>{
      const {actor,kind}=event,root=`/api/store-pos/stores/${actor.storeId}`;
      if(kind==='pos-local-search'){assert.equal(catalogs.get(actor.id).quickProduct({productQuery:'CAP00001'})?.id,f.productId);return {ok:true}}
      if(kind==='pos-refresh'){
        const result=await Promise.all([request(root,actor),request(root+'/access',actor),request(`/api/cash/stores/${actor.storeId}/overview`,actor)]);
        for(const r of result)if(!r.ok)return r;
        assert.equal(result[0].value.store.id,actor.storeId);assert.equal(result[2].value.openSession?.id,actor.shiftId);
        catalogs.set(actor.id,createPosCatalogResolver(result[0].value.products,false));return {ok:true,status:200};
      }
      if(kind==='pos-session')return request(root+'/access',actor);
      if(kind==='backoffice-search'){
        const r=await request('/api/owner-products/catalog?q=CAP00001',actor);if(!r.ok)return r;
        assert.equal(r.value.length,1);assert.equal(r.value[0].id,f.productId);return r;
      }
      if(kind==='backoffice-report')return request(`/api/transactions/stores/${actor.storeId}/overview`,actor);
      const r=await request(root+'/checkout',actor,{method:'POST',body:{items:[{productId:f.productId,quantity:1}],paymentMethod:'CASH',clientTransactionId:event.requestId,confirmDuplicate:true}});
      if(!r.ok)return r;assert.equal(r.status,201);assert.ok(r.value.saleId);assert.equal(r.value.total,2.5);assert.equal(r.value.idempotentReplay,false);return r;
    });
    if(mode==='priority20'&&profile==='full'){await delay(Math.max(0,stage.seconds*1000-(Date.now()-phaseStarted)));metrics.elapsedMs=Date.now()-phaseStarted}
    Object.assign(ledger.stages.at(-1),{metrics,httpRequests:httpRequests-httpBefore,after:await snapshot(f),finishedAt:new Date().toISOString()});
    writeResult();reconcile(f,ledger.stages.at(-1).after);
    ledger.stages.at(-1).correctness='PASS';
    if(mode==='priority20'){
      ledger.stages.at(-1).assessment=assessPhase(metrics);writeResult();
      if(profile==='full'&&stage.name!=='warmup')assert.equal(ledger.stages.at(-1).assessment.status,'PASS','Phase latency/arrival criteria failed');
    }
    writeResult();
    assert.equal(metrics.samples.filter(s=>!s.ok).length,0,'Offered action failed or was dropped');
    assert.equal(new Set(metrics.samples.filter(s=>s.kind.startsWith('pos-')&&s.ok).map(s=>s.actorId)).size,stage.pos,'Some claimed POS performed no action');
    console.log('Isolated capacity HARNESS stage verified',JSON.stringify({stores:stage.stores,pos:stage.pos,backoffice:owners.length,mode,actions:metrics.samples.length,httpRequests:httpRequests-httpBefore,peakInFlight:metrics.peakInFlight,errors:0}));
  }
  const first=ledger.requests[0],actor=f.actors.find(a=>a.id===first.actorId),beforeReplay=await snapshot(f);
  const replay=await checked(`/api/store-pos/stores/${actor.storeId}/checkout`,actor,{method:'POST',body:{items:[{productId:f.productId,quantity:1}],paymentMethod:'CASH',clientTransactionId:first.requestId,confirmDuplicate:true}});
  assert.equal(replay.idempotentReplay,true);assert.equal(replay.saleId,beforeReplay.sales.find(s=>s.clientTransactionId===first.requestId).id);
  ledger.after=await snapshot(f);assert.deepEqual(ledger.after,beforeReplay,'Replay duplicated financial/stock effects');reconcile(f,ledger.after);
  for(const actor of f.actors){
    const overview=await checked(`/api/transactions/stores/${actor.storeId}/overview`,actor);
    assert.equal(overview.openSession?.id,actor.shiftId);assert.equal(Number(overview.summary.cashSales),ledger.requests.filter(r=>r.actorId===actor.id).length*2.5);
  }
  await observeDatabase();assert.notEqual(ledger.diagnosticFailure,true,'Database diagnostics failed');
  ledger.status=mode==='priority20'&&profile==='full'?'ISOLATED_20STORE_WORKLOAD_PASS':'ISOLATED_HARNESS_CORRECTNESS_PASS';ledger.capacityAcceptance='NOT_TESTED';
  ledger.modelAcceptance=mode==='priority20'&&profile==='full'?'AWAITING_RESOURCE_REVIEW':'NOT_TESTED';
  ledger.finishedAt=new Date().toISOString();ledger.httpRequests=httpRequests;writeResult();
  console.log(`Capacity HARNESS PostgreSQL + real HTTP PASS: mode=${mode}/profile=${mode==='priority20'?profile:'existing'}, ${fixtureStores} fixture stores, ${f.actors.length} distinct active terminals, ${ledger.requests.length} synthetic sales with exact per-terminal/payment/stock/audit controls and one idempotent replay. Production capacity, sustained peak/endurance, jobs/providers/devices NOT TESTED.`);
}catch(error){
  ledger.status='ISOLATED_HARNESS_FAIL';ledger.failure={type:error.name};ledger.capacityAcceptance='NOT_TESTED';writeResult();throw error;
}finally{clearInterval(monitor);await observationPromise;await db.$disconnect()}
