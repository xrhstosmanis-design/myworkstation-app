import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PrismaClient} from '@prisma/client';
import {LAB_IDS as ids} from '../../ops/wholesale-lab/seed.mjs';

function isolated(){try{const url=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/myworkstation_test'&&['','5432'].includes(url.port)}catch{return false}}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function unusedPort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port}

test('dedicated disposable PostgreSQL runtime serves actual wholesale identities, portal and restricted seller flows',{skip:!isolated(),timeout:180000},async t=>{
  const admin=new PrismaClient(),password=crypto.randomBytes(24).toString('hex'),port=await unusedPort(),origin='http://127.0.0.1:'+port;
  const databaseUrl=`postgresql://whlab_runtime:${password}@127.0.0.1:5432/wholesale_lab?schema=public&connection_limit=4&pool_timeout=10`;
  let roleCreated=false,databaseCreated=false,child,db,output='';
  const root=fileURLToPath(new URL('../../',import.meta.url));
  try{
    const databases=await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname='wholesale_lab'`,roles=await admin.$queryRaw`SELECT 1 FROM pg_roles WHERE rolname='whlab_runtime'`;
    assert.equal(databases.length,0,'Refuse a pre-existing laboratory database; never reset it.');assert.equal(roles.length,0,'Refuse a pre-existing laboratory role; never replace it.');
    // Names are constants and password is generated hexadecimal, never user input.
    await admin.$executeRawUnsafe(`CREATE ROLE whlab_runtime WITH LOGIN PASSWORD '${password}'`);roleCreated=true;
    await admin.$executeRawUnsafe('CREATE DATABASE wholesale_lab OWNER whlab_runtime');databaseCreated=true;
    child=spawn(process.execPath,['ops/wholesale-lab/runtime.mjs','--initialize'],{cwd:root,env:{PATH:process.env.PATH,NODE_ENV:'test',WHOLESALE_LAB:'1',LAB_BOOT_NONCE:crypto.randomBytes(32).toString('hex'),DATABASE_URL:databaseUrl,PORT:String(port),LAB_PUBLIC_ORIGIN:origin,LAB_REVISION:'native-isolated-wholesale-test'},stdio:['ignore','pipe','pipe']});
    const collect=data=>{output=(output+data.toString()).slice(-20000)};child.stdout.on('data',collect);child.stderr.on('data',collect);
    let ready=false;
    for(let attempt=0;attempt<600;attempt++){
      if(child.exitCode!==null)throw new Error('Isolated runtime failed to start: '+output.replaceAll(password,'[redacted]'));
      try{const response=await fetch(origin+'/api/lab/health');if(response.ok){ready=true;break}}catch{}
      await delay(100);
    }
    assert.ok(ready,'Disposable runtime must become healthy before testing.');
    db=new PrismaClient({datasourceUrl:databaseUrl});
    const request=async(path,{token,method='GET',body,cookie,headers={}}={})=>{
      const response=await fetch(origin+path,{method,headers:{'content-type':'application/json',origin,...(token?{authorization:'Bearer '+token}:{}),...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
      const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}
      return {status:response.status,data,headers:response.headers};
    };
    const login=async role=>{const response=await request('/api/lab/session',{method:'POST',body:{role}});assert.equal(response.status,200);assert.equal(response.data.testOnly,true);return response};
    const owner=(await login('owner')).data,seller=(await login('seller')).data,unassigned=(await login('unassigned')).data;
    assert.ok(typeof owner.token==='string'&&owner.user.id===ids.owner);assert.equal(seller.user.role,'EMPLOYEE');assert.equal(unassigned.user.id,ids.unassigned);
    const baseline=await db.$queryRaw`SELECT "storeId","productId","currentStock"::text AS quantity FROM "StoreProduct" ORDER BY "id"`;
    const actualLedgerCounts=async()=>({sales:(await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "Sale"`)[0].n,stock:(await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "StockMovement"`)[0].n,money:(await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "StoreTransaction"`)[0].n});
    const sourceBefore=await actualLedgerCounts();
    await t.test('public metadata and route allowlist expose only the synthetic environment',async()=>{
      const meta=await request('/api/lab/meta');assert.equal(meta.status,200);assert.equal(meta.data.companyId,ids.company);assert.equal(meta.data.testOnly,true);assert.equal(meta.data.defaultStoreId,ids.store);
      assert.deepEqual(meta.data.roles,['owner','seller','unassigned','customer']);assert.ok(!JSON.stringify(meta.data).match(/password|jwt_secret|token/i));
      for(const path of ['/api/platform/companies','/api/transactions','/api/store-pos/stores/'+ids.store+'/checkout','/api/commerce/mydata/send','/api/auth/owner-companies','/api/lab/reset'])assert.equal((await request(path,{token:owner.token,method:'POST',body:{}})).status,404,path);
      assert.equal((await request('/api/lab/session',{method:'POST',body:{role:'SUPER_ADMIN'}})).status,400);
      assert.equal((await request('/api/lab/session',{method:'POST',body:{role:'owner',companyId:'foreign'}})).status,400);
      assert.equal((await request('/api/lab/session',{method:'POST',body:{role:'owner'},headers:{origin:'https://foreign.invalid'}})).status,403);
    });
    await t.test('manager and assigned seller preserve exact personal, company, store and customer boundaries',async()=>{
      const workspace=await request('/api/wholesale/workspace?storeId='+ids.store,{token:owner.token});assert.equal(workspace.status,200);assert.equal(workspace.data.storeId,ids.store);assert.equal(workspace.data.company.id,ids.company);
      assert.equal((await request('/api/wholesale/workspace?storeId='+ids.foreignStore,{token:owner.token})).status,404);
      assert.equal((await request('/api/wholesale/workspace?storeId=',{token:owner.token})).status,400);
      const context=await request('/api/wholesale/sellers/context',{token:seller.token});assert.equal(context.status,200);assert.deepEqual(context.data.stores.map(s=>s.id),[ids.store]);
      const binding={'x-wholesale-seller':ids.seller,'x-wholesale-company':ids.company};
      const customers=await request('/api/wholesale/sellers/customers?storeId='+ids.store,{token:seller.token,headers:binding});assert.equal(customers.status,200);assert.deepEqual(customers.data.items.map(c=>c.id),[ids.customer]);
      assert.equal((await request('/api/wholesale/sellers/customers?storeId='+ids.siblingStore,{token:seller.token,headers:binding})).status,404);
      assert.equal((await request('/api/wholesale/sellers/customers?storeId='+ids.store,{token:seller.token})).status,428);
      assert.equal((await request('/api/wholesale/customers',{token:seller.token})).status,403);
      const denied=await request('/api/wholesale/sellers/context',{token:unassigned.token});assert.equal(denied.status,403);assert.equal(denied.data.code,'SELLER_MEMBERSHIP_REQUIRED');
      const ownerDenied=await request('/api/wholesale/sellers/context',{token:owner.token});assert.equal(ownerDenied.status,403);assert.equal(ownerDenied.data.code,'SELLER_MEMBERSHIP_REQUIRED');
      assert.equal((await request('/api/wholesale/workspace?storeId='+ids.store,{token:owner.token})).status,200);
      const input={storeId:ids.store,customerId:ids.customer,items:[{productId:ids.productA,quantity:'2'}]},quote=await request('/api/wholesale/sellers/quotes',{token:seller.token,method:'POST',body:input,headers:binding});
      assert.equal(quote.status,200);assert.deepEqual(quote.data.totals,{net:'20.00',vat:'4.80',gross:'24.80'});
      const body={...input,clientOrderId:crypto.randomUUID(),quoteId:quote.data.quoteId,notes:'SYNTHETIC SELLER HTTP TEST'};
      const first=await request('/api/wholesale/sellers/orders',{token:seller.token,method:'POST',body,headers:binding}),replay=await request('/api/wholesale/sellers/orders',{token:seller.token,method:'POST',body,headers:binding});
      assert.equal(first.status,201);assert.equal(replay.status,200);assert.equal(replay.data.orderId,first.data.orderId);assert.equal(replay.data.replayed,true);
      assert.equal((await request('/api/wholesale/sellers/orders',{token:seller.token,method:'POST',body:{...body,notes:'CONFLICT'},headers:binding})).status,409);
    });
    await t.test('actual customer portal uses its HttpOnly session, origin/CSRF and publication scope',async()=>{
      const response=await login('customer'),cookie=response.headers.get('set-cookie').split(';')[0],customer=response.data;
      assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);assert.ok(customer.csrfToken);assert.equal(customer.targetUrl,'/b2b/'+ids.slug);
      const prefix='/api/b2b/'+ids.slug,me=await request(prefix+'/me',{cookie});assert.equal(me.status,200);assert.equal(me.data.account.customerId,ids.customer);
      const catalog=await request(prefix+'/catalog?storeId='+ids.store,{cookie});assert.equal(catalog.status,200);assert.ok(catalog.data.items.some(p=>p.id===ids.productA));assert.ok(!catalog.data.items.some(p=>p.id===ids.productPrivate));
      assert.equal((await request(prefix+'/catalog?storeId='+ids.siblingStore,{cookie})).status,403);
      assert.equal((await request(prefix+'/me',{token:owner.token,cookie})).status,401);
      const input={storeId:ids.store,items:[{productId:ids.productB,quantity:'2'}]},headers={'x-csrf-token':customer.csrfToken};
      assert.equal((await request(prefix+'/quotes',{cookie,method:'POST',body:input})).status,403);
      const quote=await request(prefix+'/quotes',{cookie,method:'POST',body:input,headers});assert.equal(quote.status,200);assert.deepEqual(quote.data.totals,{net:'10.00',vat:'1.30',gross:'11.30'});
      assert.equal((await request(prefix+'/quotes',{cookie,method:'POST',body:{storeId:ids.store,items:[{productId:ids.productPrivate,quantity:'1'}]},headers})).status,404);
      const order={...input,clientOrderId:crypto.randomUUID(),quoteId:quote.data.quoteId,notes:'SYNTHETIC PORTAL HTTP TEST'};
      const first=await request(prefix+'/orders',{cookie,method:'POST',body:order,headers}),replay=await request(prefix+'/orders',{cookie,method:'POST',body:order,headers});assert.equal(first.status,201);assert.equal(replay.status,200);assert.equal(replay.data.orderId,first.data.orderId);
      assert.equal((await request(prefix+'/orders',{cookie,method:'POST',body:{...order,notes:'CONFLICT'},headers})).status,409);
    });
    await t.test('current module and session revocations deny requests without granting replacement access',async()=>{
      await db.$executeRaw`UPDATE "CompanyModule" SET "active"=false WHERE "companyId"=${ids.company}`;
      try{assert.equal((await request('/api/wholesale/workspace?storeId='+ids.store,{token:owner.token})).status,401);assert.equal((await request('/api/b2b/'+ids.slug+'/config')).status,404)}finally{await db.$executeRaw`UPDATE "CompanyModule" SET "active"=true WHERE "companyId"=${ids.company}`}
      await db.userSession.updateMany({where:{userId:ids.unassigned},data:{revokedAt:new Date()}});
      assert.equal((await request('/api/wholesale/sellers/context',{token:unassigned.token})).status,401);
    });
    const {exerciseLabLedger}=await import('../../ops/wholesale-lab/test-ledger.mjs');
    await t.test('virtual document/payment/stock lifecycle is atomic, idempotent and append-only',()=>exerciseLabLedger({baseUrl:origin,ownerToken:owner.token,db,origin,ids}));
    assert.deepEqual(await actualLedgerCounts(),sourceBefore,'No production-shaped Sale/StockMovement/StoreTransaction posting.');
    assert.deepEqual(await db.$queryRaw`SELECT "storeId","productId","currentStock"::text AS quantity FROM "StoreProduct" ORDER BY "id"`,baseline,'Actual source inventory, sibling store and foreign tenant remain unchanged.');
    const health=await request('/api/lab/health');assert.equal(health.data.outboundBlocked,0,'No mounted route attempted outbound dispatch.');
    assert.ok(!output.includes(password),'Boot-generated database credential must never be logged.');
  }finally{
    if(db)await db.$disconnect();
    if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(5000)]);if(child.exitCode===null){child.kill('SIGKILL');await new Promise(resolve=>child.once('exit',resolve))}}
    if(databaseCreated){await admin.$executeRawUnsafe("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='wholesale_lab' AND pid<>pg_backend_pid()");await admin.$executeRawUnsafe('DROP DATABASE wholesale_lab')}
    if(roleCreated)await admin.$executeRawUnsafe('DROP ROLE whlab_runtime');
    await admin.$disconnect();
  }
});
