import {lockActiveSaleProducts} from '../src/lib/inventory-sale-product-lock.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {z} from 'zod';
import {policyAvailable} from '../src/store-baking.js';
import {onlineUnitPrice,onlineSurchargeAmount} from '../src/kat-online-ordering-bootstrap.js';
import {registerOnlineMember,createRegistrationLimiter,memberDiscountPercent,normalizeMemberPhone,ensureOnlineMemberSchema,changeOnlineMember} from '../src/online-members.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native public handlers enforce pending approval, tenant and current pricing while preserving old orders and room fields',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client');const admin=new PrismaClient(),schema=`online_order_test_${crypto.randomUUID().replaceAll('-','')}`,url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 const cfg={enabled:true,surchargeType:'FIXED',surchargeValue:0,staffDiscountPercent:10,doctorDiscountPercent:15,nurseDiscountPercent:5,pickupEnabled:true,deliveryEnabled:true,cashEnabled:true,cardOnDeliveryEnabled:true,stockCheckEnabled:true,deliveryFee:0,minimumOrderRetail:0,weeklyHours:{}};
 let licenseAllowed=true;const previousSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='isolated-fictional-member-test-secret';
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   `CREATE TABLE "Store"("id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"active" BOOLEAN,"createdAt" TIMESTAMPTZ DEFAULT NOW())`,
   `CREATE TABLE "OnlineOrderingConfig"("storeId" TEXT,"publicSlug" TEXT)`,
   `CREATE TABLE "StorePaidModule"("storeId" TEXT,"moduleKey" TEXT,"active" BOOLEAN,"startsAt" TIMESTAMPTZ,"endsAt" TIMESTAMPTZ)`,
   `CREATE TABLE "Product"("id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"sku" TEXT,"vatRate" NUMERIC,"active" BOOLEAN,"trackStock" BOOLEAN,"salePrice" NUMERIC)`,
   `CREATE TABLE "StoreProduct"("storeId" TEXT,"productId" TEXT,"active" BOOLEAN,"salePrice" NUMERIC,"currentStock" NUMERIC)`,
   `CREATE TABLE "OnlineProductVisibility"("companyId" TEXT,"storeId" TEXT,"productId" TEXT,"visible" BOOLEAN)`,
   `CREATE TABLE "StoreBakedBalance"("companyId" TEXT,"storeId" TEXT,"productId" TEXT,"enabled" BOOLEAN,"bakedQuantity" INTEGER)`,
   `CREATE TABLE "StoreBakingPolicy"("companyId" TEXT,"storeId" TEXT,"productId" TEXT,"mode" TEXT)`,
   `CREATE TABLE "ManagementModifierGroup"("id" TEXT,"companyId" TEXT,"description" TEXT,"legacyId" INTEGER,"active" BOOLEAN)`,
   `CREATE TABLE "ManagementModifier"("id" TEXT,"companyId" TEXT,"groupId" TEXT,"sequence" INTEGER,"description" TEXT,"price" NUMERIC,"active" BOOLEAN)`,
   `CREATE TABLE "OnlineStoreMember"("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"fullName" TEXT,"phoneNormalized" TEXT,"pinHash" TEXT,"memberType" TEXT,"active" BOOLEAN,"updatedAt" TIMESTAMPTZ DEFAULT NOW(),UNIQUE("storeId","phoneNormalized"))`,
   `CREATE TABLE "AuthAudit"("id" TEXT PRIMARY KEY,"userId" TEXT,"email" TEXT,"event" TEXT,"success" BOOLEAN,"deviceName" TEXT,"ipAddress" TEXT,"userAgent" TEXT,"createdAt" TIMESTAMPTZ DEFAULT NOW())`,
   `CREATE TABLE "OnlineOrder"("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"orderNumber" TEXT,"channel" TEXT,"fulfillmentType" TEXT,"status" TEXT,"paymentMethod" TEXT,"customerName" TEXT,"customerPhone" TEXT,"building" TEXT,"floor" TEXT,"department" TEXT,"room" TEXT,"deliveryNotes" TEXT,"subtotal" NUMERIC,"deliveryFee" NUMERIC,"total" NUMERIC,"idempotencyKey" TEXT,"createdAt" TIMESTAMPTZ DEFAULT NOW(),UNIQUE("storeId","idempotencyKey"),UNIQUE("storeId","orderNumber"))`,
   `CREATE TABLE "OnlineOrderLine"("id" TEXT PRIMARY KEY,"orderId" TEXT,"productId" TEXT,"productName" TEXT,"quantity" NUMERIC,"storeUnitPrice" NUMERIC,"onlineSurcharge" NUMERIC,"onlineUnitPrice" NUMERIC,"lineTotal" NUMERIC,"modifiersJson" JSONB)`,
   `CREATE TABLE "OnlineOrderStatusEvent"("id" TEXT PRIMARY KEY,"orderId" TEXT,"toStatus" TEXT,"note" TEXT)`,
   `INSERT INTO "Store" VALUES('store','company','DAILY LAB',TRUE,NOW()),('foreign','other','Other',TRUE,NOW())`,
   `INSERT INTO "OnlineOrderingConfig" VALUES('store','daily'),('foreign','foreign')`,
   `INSERT INTO "Product" VALUES('coffee','company','FREDDO ESPRESSO','LAB',13,TRUE,FALSE,10)`,
   `INSERT INTO "StoreProduct" VALUES('store','coffee',TRUE,10,0)`,
   `INSERT INTO "OnlineProductVisibility" VALUES('company','store','coffee',TRUE)`,
   `INSERT INTO "ManagementModifierGroup" VALUES('milk','company','ΓΑΛΑ',1,TRUE)`,
   `INSERT INTO "ManagementModifier" VALUES('extra','company','milk',1,'EXTRA',1,TRUE)`
  ])await db.$executeRawUnsafe(sql);
  await ensureOnlineMemberSchema(db);
  const routes=new Map(),router={post(paths,handler){for(const path of paths)routes.set(`POST ${path}`,handler)},get(paths,handler){for(const path of paths)routes.set(`GET ${path}`,handler)}};
  let source=await readFile(new URL('../src/routes/kat-online-ordering-modifiers.js',import.meta.url),'utf8');source=source.slice(0,source.indexOf('router.get("/backoffice-managed/stores"')).replace(/^import .*;\r?\n/gm,'').replace(/export function /g,'function ');
  const deps={lockActiveSaleProducts,policyAvailable,ensureStoreBakingSchema:async()=>{},registerOnlineMember,createRegistrationLimiter,memberDiscountPercent,normalizeMemberPhone,assertCustomerDemoRuntimeClosed(){},Router:()=>router,crypto,bcrypt,jwt,z,prisma:db,auth(){},companyModuleState:async()=>({licenseAllowed,activeModules:['ONLINE_ORDERING']}),effectiveModuleEnabled:active=>active,ensureKatOnlineOrderingSchema:async()=>{},getOnlineOrderingConfig:async()=>cfg,onlineSurchargeAmount,onlineUnitPrice};
  new Function(...Object.keys(deps),source)(...Object.values(deps));
  const invoke=async(method,path,body={},token='',slug='daily')=>{const out={status:200};const res={status(v){out.status=v;return this},json(v){out.body=v;return this}};await routes.get(`${method} /:publicSlug/${path}`)({params:{publicSlug:slug},body,headers:token?{authorization:`Bearer ${token}`}:{},ip:'fictional'},res,error=>{out.status=error.status||500;out.error=error});return out};
  const registration={fullName:'Εικονικός Χρήστης',phone:'6900000001',pin:'123456',pinConfirmation:'123456',memberType:'STAFF'};
  assert.equal((await invoke('POST','member-registration',registration)).status,202);
  let session=await invoke('POST','member-session',registration);assert.equal(session.status,403);assert.equal(session.body.token,undefined);
  assert.equal((await invoke('POST','member-session',{...registration,pin:'654321'})).status,401);
  const [member]=await db.$queryRaw`SELECT "id" FROM "OnlineStoreMember"`;
  await changeOnlineMember(db,{companyId:'company',id:'store'},member.id,{active:true,decision:'APPROVE'},{id:null,email:'fictional'});
  session=await invoke('POST','member-session',registration);assert.equal(session.status,200);assert.equal(session.body.member.discountPercent,10);const token=session.body.token;
  const catalog=()=>invoke('GET','catalog-modifiers',{},token);assert.equal((await catalog()).body.products[0].onlinePrice,9);
  const order=(expectedSubtotal=10)=>({idempotencyKey:crypto.randomUUID(),fulfillmentType:'DELIVERY',paymentMethod:'CASH',customerName:'Εικονικός Πελάτης',customerPhone:'6900000002',building:'Πτέρυγα Α',floor:'2',department:'Κλινική LAB',room:'204',deliveryNotes:'Εικονική δοκιμή',expectedSubtotal,items:[{productId:'coffee',quantity:1,modifierIds:['extra']}]});
  let result=await invoke('POST','orders-with-modifiers',order(),token);assert.equal(result.status,201);const oldId=result.body.order.id;assert.equal(result.body.order.total,10);
  cfg.staffDiscountPercent=20;assert.equal((await catalog()).body.products[0].onlinePrice,8);
  assert.equal((await invoke('POST','orders-with-modifiers',order(),token)).status,409);
  result=await invoke('POST','orders-with-modifiers',order(9),token);assert.equal(result.status,201);assert.equal(result.body.order.total,9);
  const [old]=await db.$queryRaw`SELECT * FROM "OnlineOrder" WHERE "id"=${oldId}`;assert.equal(Number(old.total),10);assert.deepEqual([old.building,old.floor,old.department,old.room],['Πτέρυγα Α','2','Κλινική LAB','204']);
  const [line]=await db.$queryRaw`SELECT * FROM "OnlineOrderLine" WHERE "orderId"=${oldId}`;assert.equal(Number(line.onlineUnitPrice),10);assert.equal(line.modifiersJson[0].price,1);
  assert.equal((await invoke('POST','orders-with-modifiers',{...order(9),department:''},token)).status,400);
  assert.equal((await invoke('POST','orders-with-modifiers',{...order(9),fulfillmentType:'PICKUP',department:null,floor:null,room:null},token)).status,201);
  await changeOnlineMember(db,{companyId:'company',id:'store'},member.id,{active:false},{id:null,email:'fictional'});assert.equal((await catalog()).body.member,null);assert.equal((await catalog()).body.products[0].onlinePrice,10);
  assert.equal((await invoke('POST','orders-with-modifiers',order(9),token)).status,409);
  const wrongStore=jwt.sign({memberId:member.id,storeId:'foreign',memberType:'STAFF'},process.env.JWT_SECRET);assert.equal((await invoke('GET','catalog-modifiers',{},wrongStore)).body.member,null);
  licenseAllowed=false;assert.equal((await invoke('POST','member-registration',registration)).status,403);licenseAllowed=true;
  cfg.enabled=false;assert.equal((await invoke('POST','member-registration',registration)).status,503);cfg.enabled=true;
  assert.equal((await db.$queryRaw`SELECT * FROM "OnlineOrder"`).length,3);
 }finally{if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
