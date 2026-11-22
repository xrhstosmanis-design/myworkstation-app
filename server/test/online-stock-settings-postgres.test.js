import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native bootstrap and actual settings handler preserve legacy defaults and tenant opt-in',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema=`online_stock_test_${crypto.randomUUID().replaceAll('-','')}`,url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await db.$executeRawUnsafe(`CREATE TABLE "Company"("id" TEXT PRIMARY KEY)`);
  await db.$executeRawUnsafe(`CREATE TABLE "Store"("id" TEXT PRIMARY KEY)`);
  await db.$executeRawUnsafe(`INSERT INTO "Company" VALUES('company'),('other')`);
  await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES('store'),('control')`);
  const bootstrap=await readFile(new URL('../src/kat-online-ordering-bootstrap.js',import.meta.url),'utf8');
  const statements=[...bootstrap.matchAll(/`([^`]+)`/g)].map(m=>m[1]).filter(s=>s.startsWith('CREATE TABLE IF NOT EXISTS "OnlineOrderingConfig"')||s.startsWith('ALTER TABLE "OnlineOrderingConfig"')||s.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS "OnlineOrderingConfig_'));
  for(let pass=0;pass<2;pass++)for(const sql of statements)await db.$executeRawUnsafe(sql);
  await db.$executeRawUnsafe(`INSERT INTO "OnlineOrderingConfig"("id","companyId","storeId") VALUES('one','company','store'),('two','other','control')`);
  assert.equal((await db.$queryRaw`SELECT "autoStockCatalogEnabled" FROM "OnlineOrderingConfig" WHERE "storeId"='store'`)[0].autoStockCatalogEnabled,false);
  const source=await readFile(new URL('../src/routes/platform-admin.js',import.meta.url),'utf8'),schemaSource=source.slice(source.indexOf('const onlineSettingsSchema='),source.indexOf('function newActivation('));
  const start=source.indexOf('router.put("/companies/:companyId/stores/:storeId/online-store/settings"'),end=source.indexOf('router.put("/companies/:companyId/stores/:storeId/online-store/products/',start);
  let handler;const prisma={$queryRaw:db.$queryRaw.bind(db),$executeRaw:db.$executeRaw.bind(db),authAudit:{create:async()=>({})}},router={put(path,fn){handler=fn}};
  const onlineStoreContext=async(companyId,id)=>{if(companyId!=='company'||id!=='store')throw Object.assign(Error('Forbidden'),{status:403});return{id,name:'Fictional'}};
  new Function('z','crypto','prisma','router','onlineStoreContext',schemaSource+source.slice(start,end))(z,crypto,prisma,router,onlineStoreContext);
  const body={enabled:false,publicSlug:'daily-test',surchargeType:'FIXED',surchargeValue:.1,stockCheckEnabled:false,autoStockCatalogEnabled:true,pickupEnabled:true,deliveryEnabled:true,deliveryFee:0,minimumOrderRetail:3,doctorDiscountPercent:15,nurseDiscountPercent:10,staffDiscountPercent:7,cashEnabled:true,cardOnDeliveryEnabled:true,brandName:'DAILY',brandTagline:'Daily',brandLogoUrl:'',brandPrimaryColor:'#52613a',brandSecondaryColor:'#354024',brandWelcomeMessage:'Welcome',estimatedMinutes:25,weeklyHours:{}};
  const invoke=async(input,companyId='company')=>{const out={status:200};await handler({params:{companyId,storeId:'store'},body:input,user:{id:'admin'},headers:{}},{status(v){out.status=v;return this},json(v){out.body=v}},e=>{out.status=e.status||500;out.error=e});return out};
  let saved=await invoke(body);assert.equal(saved.status,200,JSON.stringify(saved.error));assert.equal(saved.body.settings.stockCheckEnabled,true);
  let row=(await db.$queryRaw`SELECT * FROM "OnlineOrderingConfig" WHERE "storeId"='store'`)[0];assert.equal(row.autoStockCatalogEnabled,true);assert.equal(row.enabled,false);
  const {autoStockCatalogEnabled,staffDiscountPercent,...oldClient}=body;saved=await invoke(oldClient);assert.equal(saved.status,200);assert.equal(saved.body.settings.autoStockCatalogEnabled,true);assert.equal(saved.body.settings.staffDiscountPercent,7);
  assert.equal((await invoke(body,'other')).status,403);
  assert.equal((await db.$queryRaw`SELECT "autoStockCatalogEnabled" FROM "OnlineOrderingConfig" WHERE "storeId"='control'`)[0].autoStockCatalogEnabled,false);
  saved=await invoke({...body,autoStockCatalogEnabled:false});assert.equal(saved.status,200);assert.equal(saved.body.settings.stockCheckEnabled,false);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
