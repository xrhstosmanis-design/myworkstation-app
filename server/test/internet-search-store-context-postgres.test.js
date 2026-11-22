import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
function isolated(value=process.env.DATABASE_URL){
 try{const u=new URL(value);if(process.env.NODE_ENV!=='test'||!['postgres:','postgresql:'].includes(u.protocol)||!['localhost','127.0.0.1','postgres'].includes(u.hostname)||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(u.pathname)||u.hash)return false;
 const seen=new Set();for(const[k,v]of u.searchParams){if(seen.has(k))return false;seen.add(k);if(k==='schema'){if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(v))return false}else if(!Object.hasOwn({connection_limit:1,pool_timeout:1,statement_cache_size:1},k)||!/^\d{1,6}$/.test(v))return false}return true}catch{return false}
}
test('store-context native fixture refuses remote production and URL override targets',()=>{
 for(const value of ['postgresql://u:p@localhost/production','postgresql://u:p@localhost/production_latest','postgresql://u:p@remote/module_test','https://localhost/module_test','postgresql://u:p@localhost/module_test?host=remote','postgresql://u:p@localhost/module_test?options=-csearch_path=public','postgresql://u:p@localhost/module_test?schema=a&schema=b','postgresql://u:p@localhost/module_test#x','postgresql://u:p@localhost/module_test?schema=invalid-name','postgresql://u:p@localhost/module_test?connection_limit=unsafe'])assert.equal(isolated(value),false,value);
 if(process.env.NODE_ENV==='test')for(const value of ['postgresql://u:p@localhost/test','postgres://u:p@127.0.0.1/module_test?schema=isolated_1&connection_limit=1','postgresql://u:p@postgres/test_suite?pool_timeout=10&statement_cache_size=0'])assert.equal(isolated(value),true,value);
 if(process.env.CI)assert.ok(isolated(),'CI must execute real PostgreSQL selected-store proof');
});

test('actual registered history/proposal readers require active owned store before schema and isolate real PostgreSQL rows',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema=`internet_store_test_${crypto.randomUUID().replaceAll('-','')}`,url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});let created=false;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  for(const sql of [
   `CREATE TABLE "Store"("id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"active" BOOLEAN)`,
   `CREATE TABLE "Product"("id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"sku" TEXT)`,
   `CREATE TABLE "InternetProductSearch"("id" TEXT,"companyId" TEXT,"storeId" TEXT,"query" TEXT,"queryType" TEXT,"productId" TEXT,"resultCount" INT,"createdAt" TIMESTAMPTZ)`,
   `CREATE TABLE "InternetPriceProposal"("id" TEXT,"companyId" TEXT,"storeId" TEXT,"productId" TEXT,"currentPrice" NUMERIC,"proposedPrice" NUMERIC,"status" TEXT,"createdAt" TIMESTAMPTZ)`,
   `INSERT INTO "Store" VALUES('A','own','Store A',TRUE),('B','own','Store B',TRUE),('inactive','own','Closed',FALSE),('foreign','other','Foreign',TRUE)`,
   `INSERT INTO "Product" VALUES('pA','own','Product A','A'),('pB','own','Product B','B'),('pF','other','Foreign','F')`,
   `INSERT INTO "InternetProductSearch" VALUES('hA','own','A','query A','TEXT','pA',1,'2026-10-25'),('hB','own','B','query B','TEXT','pB',2,'2026-10-26'),('hF','other','foreign','foreign','TEXT','pF',3,'2026-10-26')`,
   `INSERT INTO "InternetPriceProposal" VALUES('a','own','A','pA',1,2,'PENDING','2026-10-25'),('b','own','B','pB',3,4,'PENDING','2026-10-26'),('f','other','foreign','pF',5,6,'PENDING','2026-10-26')`,
   `INSERT INTO "InternetProductSearch" SELECT 'bulk'||i,'own','B','B only','TEXT','pB',1,'2026-10-26' FROM generate_series(1,60) i`,
   `INSERT INTO "InternetPriceProposal" SELECT 'bulk'||i,'own','B','pB',3,4,'PENDING','2026-10-26' FROM generate_series(1,110) i`
  ])await db.$executeRawUnsafe(sql);
  const source=await readFile(new URL('../src/routes/commerce-advanced-online-search.js',import.meta.url),'utf8'),handlers=new Map();let schemaCalls=0;
  const functions=source.slice(source.indexOf('async function companyFor'),source.indexOf('\nconst offerText'));
  const readers=source.slice(source.indexOf('router.get("/history"'),source.indexOf('\nrouter.post("/price-proposals"'));
  let moduleEnabled=true;
  new Function('router','prisma','isPlatformSuper','isOwner','advancedOnlineSearchEntitlement','ensureMarketSchema',functions+'\n'+readers)({get(path,fn){handlers.set(path,fn)}},db,req=>req.user.role==='SUPER_ADMIN',req=>req.user.role==='OWNER',async()=>moduleEnabled,async()=>{schemaCalls++});
  const owner={id:'owner',role:'OWNER',companyId:'own'},invoke=async(path,query,user=owner,baseUrl='/api/commerce/internet-product-search')=>{const out={status:200};await handlers.get(path)({query,user,baseUrl},{status(value){out.status=value;return this},json(value){out.body=value;return this}},error=>{throw error});return out};
  const snapshot=async()=>JSON.stringify(await db.$queryRawUnsafe(`SELECT (SELECT json_agg(s ORDER BY "id") FROM "Store" s)::text AS stores,(SELECT json_agg(h ORDER BY "id") FROM "InternetProductSearch" h)::text AS history,(SELECT json_agg(p ORDER BY "id") FROM "InternetPriceProposal" p)::text AS proposals`));
  const before=await snapshot();
  await t.test('missing malformed inactive and foreign stores refuse before schema preparation',async()=>{
   for(const path of handlers.keys())for(const storeId of [undefined,'',' ',['A'],'A\u0000','x'.repeat(201),'inactive','foreign','missing']){const prior=schemaCalls;const result=await invoke(path,storeId===undefined?{}:{storeId});assert.ok([400,404].includes(result.status),JSON.stringify({path,storeId,result}));assert.equal(schemaCalls,prior)}
  });
  await t.test('selected store predicate runs before limits and query remains parameterized',async()=>{
   for(const path of handlers.keys()){const a=await invoke(path,{storeId:'A'});assert.equal(a.status,200);assert.equal(a.body.rows.length,1);assert.equal(a.body.rows[0].storeId||'A','A');assert.ok(['hA','a'].includes(a.body.rows[0].id));const b=await invoke(path,{storeId:'B'});assert.ok(b.body.rows.length>1);assert.ok(b.body.rows.every(row=>!['hA','a','hF','f'].includes(row.id)));const injection=await invoke(path,{storeId:"A' OR '1'='1"});assert.equal(injection.status,404)}
  });
  await t.test('Owner module and platform/support company checks remain authoritative',async()=>{
   moduleEnabled=false;for(const path of handlers.keys()){const prior=schemaCalls;assert.equal((await invoke(path,{storeId:'A'})).status,403);assert.equal(schemaCalls,prior)}moduleEnabled=true;
   for(const path of handlers.keys()){
    assert.equal((await invoke(path,{storeId:'A'},{...owner,role:'EMPLOYEE'})).status,403);
    assert.equal((await invoke(path,{storeId:'A'},owner,'/api/platform/internet-product-search')).status,403);
    assert.equal((await invoke(path,{storeId:'A'},{id:'sa',role:'SUPER_ADMIN',companyId:'login'},'/api/platform/internet-product-search')).status,400);
    const support={id:'sa',role:'SUPER_ADMIN',companyId:'own',supportContext:{companyId:'own'}};assert.equal((await invoke(path,{storeId:'A'},support)).body.rows.length,1);
    assert.equal((await invoke(path,{companyId:'own',storeId:'A'},{id:'sa',role:'SUPER_ADMIN'},'/api/platform/internet-product-search')).body.rows.length,1);
   }
  });
  assert.equal(await snapshot(),before,'no GET altered stores/history/proposals');
 }finally{await db.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
