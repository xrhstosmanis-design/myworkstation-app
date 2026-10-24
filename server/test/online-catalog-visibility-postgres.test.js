import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {saveOnlineVisibility} from '../src/online-catalog-visibility.js';
import {readAutomaticStockCatalog,automaticOnlineAvailable} from '../src/online-stock-catalog.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test('actual visibility handler persists audited own-store choices without a bulk ceiling or foreign writes',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema=`online_visibility_test_${crypto.randomUUID().replaceAll('-','')}`,url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   `CREATE TABLE "Store"("id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"active" BOOLEAN)`,
   `CREATE TABLE "OnlineOrderingConfig"("companyId" TEXT,"storeId" TEXT,"autoStockCatalogEnabled" BOOLEAN)`,
   `CREATE TABLE "Product"("id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"sku" TEXT,"vatRate" NUMERIC,"active" BOOLEAN,"trackStock" BOOLEAN,"salePrice" NUMERIC)`,
   `CREATE TABLE "StoreProduct"("storeId" TEXT,"productId" TEXT,"active" BOOLEAN,"salePrice" NUMERIC,"currentStock" NUMERIC,PRIMARY KEY("storeId","productId"))`,
   `CREATE TABLE "OnlineProductVisibility"("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"productId" TEXT,"visible" BOOLEAN,"updatedAt" TIMESTAMPTZ DEFAULT NOW(),UNIQUE("storeId","productId"))`,
   `CREATE TABLE "StoreBakedBalance"("companyId" TEXT,"storeId" TEXT,"productId" TEXT,"enabled" BOOLEAN,"bakedQuantity" INTEGER)`,
   `CREATE TABLE "StoreBakingPolicy"("companyId" TEXT,"storeId" TEXT,"productId" TEXT,"mode" TEXT)`,
   `CREATE TABLE "AuthAudit"("id" TEXT PRIMARY KEY,"userId" TEXT,"email" TEXT,"event" TEXT,"success" BOOLEAN,"deviceName" TEXT,"ipAddress" TEXT,"userAgent" TEXT,"createdAt" TIMESTAMPTZ DEFAULT NOW())`,
   `INSERT INTO "Store" VALUES('store','company','Store',TRUE),('control','company','Control',TRUE),('foreign','other','Foreign',TRUE),('closed','company','Closed',FALSE)`,
   `INSERT INTO "OnlineOrderingConfig" VALUES('company','store',TRUE)`,
   `INSERT INTO "Product" SELECT 'p'||i,'company','Product '||i,'SKU'||i,13,TRUE,TRUE,1 FROM generate_series(1,5001) i`,
   `INSERT INTO "Product" VALUES('foreign','other','Foreign','F',13,TRUE,TRUE,1),('inactive','company','Inactive','I',13,FALSE,TRUE,1),('not-in-store','company','Absent','A',13,TRUE,TRUE,1)`,
   `INSERT INTO "StoreProduct" SELECT 'store',"id",TRUE,1,0 FROM "Product" WHERE "id"<>'not-in-store'`,
   `INSERT INTO "StoreProduct" VALUES('control','p1',TRUE,2,5),('foreign','foreign',TRUE,1,10),('closed','p1',TRUE,1,10)`,
   `INSERT INTO "OnlineProductVisibility" SELECT 'v'||i,'company','store','p'||i,TRUE,NOW() FROM generate_series(1,5001) i`,
   `INSERT INTO "OnlineProductVisibility" VALUES('control','company','control','p1',TRUE,NOW())`
  ])await db.$executeRawUnsafe(sql);
  const source=await readFile(new URL('../src/routes/platform-admin.js',import.meta.url),'utf8'),start=source.indexOf('router.put("/companies/:companyId/stores/:storeId/online-store/products/:productId/visibility"'),end=source.indexOf('router.put("/companies/:companyId/stores/:storeId/online-store/products",',start);
  let handler,allowed=true;const onlineStoreContext=async(companyId,id)=>{if(!allowed||companyId!=='company'||id!=='store')throw Object.assign(Error('Forbidden'),{status:403});return{id,name:'Store'}};
  new Function('router','prisma','onlineStoreContext','saveOnlineVisibility',source.slice(start,end))({put(path,fn){handler=fn}},db,onlineStoreContext,saveOnlineVisibility);
  const invoke=async(mode,productId='p1',extra={})=>{const out={status:200};await handler({params:{companyId:'company',storeId:'store',productId},body:{mode,...extra},user:{id:null,email:'fictional'},headers:{},ip:'fictional'},{status(n){out.status=n;return this},json(v){out.body=v;return this}},e=>{out.status=e.status||500;out.error=e});return out};
  let result=await invoke('HIDE');assert.equal(result.status,200,JSON.stringify(result.error));assert.equal(result.body.product.visibilityOverride,false);
  assert.equal((await readAutomaticStockCatalog(db,{companyId:'company',id:'store'})).length,5000);
  result=await invoke('AUTO');assert.equal(result.body.product.visibilityOverride,null);
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "OnlineProductVisibility" WHERE "storeId"='store'`)[0].n,5000);
  // Execute the actual pilot-default INSERT: automatic reset must survive normal bootstrap.
  const bootstrap=await readFile(new URL('../src/kat-online-ordering-bootstrap.js',import.meta.url),'utf8');
  const seedLine=bootstrap.split('\n').find(line=>line.includes('SELECT md5(${store.id}')&&line.includes('OnlineProductVisibility'));
  assert.ok(seedLine);
  const seed=new Function('prisma','store',`return (async()=>{${seedLine}})()`);
  await seed(db,{id:'store',companyId:'company'});
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "OnlineProductVisibility" WHERE "storeId"='store' AND "productId"='p1'`)[0].n,0);
  await db.$executeRawUnsafe(`UPDATE "OnlineOrderingConfig" SET "autoStockCatalogEnabled"=FALSE WHERE "storeId"='store'`);
  await seed(db,{id:'store',companyId:'company'});
  assert.equal((await db.$queryRaw`SELECT "visible" FROM "OnlineProductVisibility" WHERE "storeId"='store' AND "productId"='p1'`)[0].visible,true);
  await db.$executeRawUnsafe(`UPDATE "OnlineOrderingConfig" SET "autoStockCatalogEnabled"=TRUE WHERE "storeId"='store'`);
  result=await invoke('AUTO');assert.equal(result.body.product.visibilityOverride,null);
  result=await invoke('SHOW');assert.equal(result.body.product.visibilityOverride,true);
  const shown=(await readAutomaticStockCatalog(db,{companyId:'company',id:'store'},['p1']))[0];assert.ok(shown);assert.equal(automaticOnlineAvailable(shown),false);
  await db.$executeRawUnsafe(`INSERT INTO "StoreBakingPolicy" VALUES('company','store','p1','ALWAYS')`);
  assert.equal(automaticOnlineAvailable((await readAutomaticStockCatalog(db,{companyId:'company',id:'store'},['p1']))[0],100),true);
  await db.$executeRawUnsafe(`INSERT INTO "StoreBakedBalance" VALUES('company','store','p1',TRUE,0)`);
  assert.equal(automaticOnlineAvailable((await readAutomaticStockCatalog(db,{companyId:'company',id:'store'},['p1']))[0]),false);
  for(const id of ['foreign','inactive','not-in-store'])assert.equal((await invoke('SHOW',id)).status,404);
  assert.equal((await invoke('INVALID')).status,400);assert.equal((await invoke('SHOW','p1',{companyId:'other'})).status,400);
  allowed=false;assert.equal((await invoke('HIDE')).status,403);allowed=true;
  // Corrupt foreign collision must fail without changing the row or writing an audit.
  await db.$executeRawUnsafe(`UPDATE "OnlineProductVisibility" SET "companyId"='other' WHERE "storeId"='store' AND "productId"='p2'`);
  assert.equal((await invoke('HIDE','p2')).status,409);assert.equal((await invoke('AUTO','p2')).status,409);
  assert.equal((await db.$queryRaw`SELECT "visible" FROM "OnlineProductVisibility" WHERE "storeId"='store' AND "productId"='p2'`)[0].visible,true);
  assert.equal((await db.$queryRaw`SELECT "visible" FROM "OnlineProductVisibility" WHERE "storeId"='control'`)[0].visible,true);
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "AuthAudit"`)[0].n,4);
  assert.equal((await db.$queryRaw`SELECT SUM("currentStock") AS n FROM "StoreProduct" WHERE "storeId"='store'`)[0].n.toNumber(),0);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
