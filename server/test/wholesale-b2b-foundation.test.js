import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import express, {Router} from 'express';
import {z} from 'zod';
import {Prisma} from '@prisma/client';
import {assertWholesaleManager,buildWholesaleQuote,wholesaleError} from '../src/lib/wholesale-pricing.js';
import {createWholesaleOrder} from '../src/lib/wholesale-orders.js';

const source=(await readFile(new URL('../src/routes/wholesale-b2b.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export default .*;\n/gm,'');
const bootstrapSource=(await readFile(new URL('../src/wholesale-b2b-bootstrap.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export async function','async function');
const owner={id:'owner-a',companyId:'company-a',role:'OWNER'};

// Execute the complete real router registration with Express. Only the external
// auth boundary and database/bootstrap dependencies are injected.
async function httpRouter(db,bootstrap=async()=>{}){
  const router=new Function('crypto','Router','z','prisma','ensureWholesaleSchema','Prisma','assertWholesaleManager','buildWholesaleQuote','wholesaleError','createWholesaleOrder',source+'\nreturn router;')(crypto,Router,z,db,bootstrap,Prisma,assertWholesaleManager,buildWholesaleQuote,wholesaleError,createWholesaleOrder);
  const app=express();app.use(express.json());
  app.use((req,res,next)=>{req.user={...owner,role:req.headers['x-test-role']||owner.role,tokenType:req.headers['x-test-token'],companyId:req.headers['x-test-company']||owner.companyId};next()});
  app.use('/api/wholesale',router);
  app.use((error,req,res,next)=>res.status(error.name==='ZodError'?400:(error.status||500)).json({error:error.message}));
  const server=await new Promise(resolve=>{const running=app.listen(0,'127.0.0.1',()=>resolve(running))});
  const base=`http://127.0.0.1:${server.address().port}/api/wholesale`;
  return {
    async request(path,method='GET',body,headers={}){const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()}},
    close:()=>new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeIdleConnections()})
  };
}

function memoryDb(){
  const customers=[{id:'customer-a',companyId:'company-a',name:'Alpha',active:true,creditLimit:'10.25',paymentTermsDays:7},{id:'customer-b',companyId:'company-b',name:'Foreign',active:true},{id:'inactive',companyId:'company-a',name:'Inactive',active:false}];
  const lists=[{id:'list-a',companyId:'company-a',name:'A',active:true},{id:'list-b',companyId:'company-b',name:'B',active:true},{id:'inactive-list',companyId:'company-a',name:'Old',active:false}];
  const links=new Map(),calls=[];
  const tiers=[{id:'tier-1',productId:'product-a',sku:'SKU-A',name:'Alpha product',minimumQuantity:'0.1250',unitPrice:'0.0000',discountPercent:null,updatedAt:new Date('2026-10-17T00:00:00Z')}];
  const db={
    async $queryRaw(strings,...values){
      assert.ok(strings.raw,'all data SQL is parameterized');const sql=strings.join('?');calls.push({kind:'read',sql,values});
      if(sql.includes('SELECT c.*'))return customers.filter(c=>c.companyId===values[0]).map(c=>{const list=lists.find(l=>l.id===links.get(c.id)&&l.companyId===c.companyId);return {...c,priceListId:list?.id??null,priceListName:list?.name??null,priceListActive:list?.active??null}});
      if(sql.includes('FROM "WholesaleCustomer"'))return customers.filter(c=>c.id===values[0]&&c.companyId===values[1]&&c.active);
      if(sql.includes('FROM "WholesalePriceList"'))return lists.filter(l=>l.id===values[0]&&l.companyId===values[1]&&(!sql.includes('"active"=true')||l.active));
      if(sql.includes('COUNT(*)'))return [{total:1n}];
      if(sql.includes('FROM "WholesalePriceListProduct"'))return tiers.slice(values[3],values[3]+values[2]);
      throw new Error('Unexpected query: '+sql);
    },
    async $executeRaw(strings,...values){const sql=strings.join('?');calls.push({kind:'write',sql,values});if(sql.startsWith('INSERT INTO "WholesaleCustomerPriceList"')){links.set(values[0],values[2]);return 1}if(sql.startsWith('DELETE FROM "WholesaleCustomerPriceList"')){links.delete(values[0]);return 1}throw new Error('Unexpected mutation: '+sql)},
    async $transaction(fn){calls.push({kind:'transaction'});return fn(db)}
  };return {db,calls,links,lists};
}

test('registered Express wholesale router assigns, reads back and unlinks with explicit null',async()=>{
  const state=memoryDb(),api=await httpRouter(state.db);
  try{
    const assignment=await api.request('/customers/customer-a/price-list','PUT',{priceListId:'list-a'});assert.equal(assignment.status,200);assert.deepEqual(assignment.data,{ok:true,customerId:'customer-a',priceListId:'list-a'});
    const list=await api.request('/customers');assert.equal(list.status,200);const customer=list.data.items.find(x=>x.id==='customer-a');assert.equal(customer.priceListId,'list-a');assert.equal(customer.priceListName,'A');assert.equal(customer.priceListActive,true);assert.equal(customer.creditLimit,10.25);assert.equal(list.data.items.some(x=>x.id==='customer-b'),false);
    assert.equal((await api.request('/customers/customer-a/price-list','PUT',{priceListId:null})).status,200);
    assert.equal((await api.request('/customers')).data.items.find(x=>x.id==='customer-a').priceListId,null);
    assert.equal(state.calls.filter(x=>x.kind==='transaction').length,2);
    assert.ok(state.calls.filter(x=>x.sql?.includes('FROM "WholesaleCustomer"')&&!x.sql.includes('SELECT c.*')).every(x=>x.sql.includes('FOR UPDATE')));
  }finally{await api.close()}
});

test('registered router rejects missing/invalid assignment, foreign and inactive masters without changing saved association',async()=>{
  const state=memoryDb();state.links.set('customer-a','list-a');const api=await httpRouter(state.db);
  try{
    for(const body of [undefined,{},null,{priceListId:''},{priceListId:0},{priceListId:false},{priceListId:[]},{priceListId:null,companyId:'company-b'}])assert.equal((await api.request('/customers/customer-a/price-list','PUT',body)).status,400);
    for(const id of ['list-b','missing','inactive-list'])assert.equal((await api.request('/customers/customer-a/price-list','PUT',{priceListId:id})).status,400);
    for(const customer of ['customer-b','missing','inactive'])for(const priceListId of ['list-a',null])assert.equal((await api.request(`/customers/${customer}/price-list`,'PUT',{priceListId})).status,404);
    assert.equal(state.links.get('customer-a'),'list-a');assert.equal(state.calls.some(x=>x.kind==='write'),false);
  }finally{await api.close()}
});

test('registered assignment reports a conflict when an inconsistent foreign association cannot be updated',async()=>{
  const state=memoryDb();state.db.$executeRaw=async()=>0;const api=await httpRouter(state.db);
  try{assert.equal((await api.request('/customers/customer-a/price-list','PUT',{priceListId:'list-a'})).status,409)}finally{await api.close()}
});

test('registered router denies roles and store operators before database bootstrap or reads',async()=>{
  const state=memoryDb();let bootstraps=0;const api=await httpRouter(state.db,async()=>{bootstraps++});
  try{
    for(const headers of [{'x-test-role':'EMPLOYEE'},{'x-test-role':'CUSTOMER'},{'x-test-role':'OWNER','x-test-token':'STORE_OPERATOR'}]){
      assert.equal((await api.request('/customers','GET',undefined,headers)).status,403);
      assert.equal((await api.request('/customers/customer-a/price-list','PUT',{priceListId:null},headers)).status,403);
      assert.equal((await api.request('/price-lists/list-a/products','GET',undefined,headers)).status,403);
    }
    assert.equal(bootstraps,0);assert.equal(state.calls.length,0);
  }finally{await api.close()}
});

test('registered tiers preserve zero/null/decimal values with bounded deterministic pagination and tenant joins',async()=>{
  const state=memoryDb(),api=await httpRouter(state.db);
  try{
    const response=await api.request('/price-lists/list-a/products?page=1&pageSize=1');assert.equal(response.status,200);assert.equal(response.data.total,1);assert.equal(response.data.page,1);assert.equal(response.data.pageSize,1);assert.equal(response.data.items[0].unitPrice,0);assert.equal(response.data.items[0].discountPercent,null);assert.equal(response.data.items[0].minimumQuantity,0.125);
    assert.deepEqual((await api.request('/price-lists/list-a/products?page=2&pageSize=1')).data.items,[]);
    for(const query of ['page=0','page=-1','page=1.2','page=1000001','pageSize=0','pageSize=101','pageSize=Infinity','pageSize[]=1'])assert.equal((await api.request('/price-lists/list-a/products?'+query)).status,400);
    for(const id of ['list-b','missing'])assert.equal((await api.request(`/price-lists/${id}/products`)).status,404);
    const sql=state.calls.find(x=>x.sql?.includes('SELECT t.')).sql;assert.ok(sql.includes('l."companyId"=t."companyId"'));assert.ok(sql.includes('p."companyId"=t."companyId"'));assert.ok(sql.includes('ORDER BY p."name",p."id",t."minimumQuantity",t."id"'));
    assert.equal(state.calls.some(x=>x.kind==='write'),false);
  }finally{await api.close()}
});

function isolated(){try{const url=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(url.hostname)&&url.pathname==='/myworkstation_test'}catch{return false}}
test('native PostgreSQL registered wholesale router enforces tenant readback, assignment, persisted tiers and no ledger/stock writes',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='wholesale_foundation_'+crypto.randomBytes(8).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasourceUrl:url.toString()});let api;
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await db.$executeRawUnsafe('CREATE TABLE "Company" ("id" TEXT PRIMARY KEY)');
    await db.$executeRawUnsafe('CREATE TABLE "Store" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"active" BOOLEAN NOT NULL DEFAULT true)');
    await db.$executeRawUnsafe('CREATE TABLE "Product" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"sku" TEXT,"name" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true)');
    await db.$executeRawUnsafe('CREATE TABLE "StockMovement" ("id" TEXT PRIMARY KEY,"quantity" NUMERIC)');
    await db.$executeRawUnsafe('CREATE TABLE "StoreTransaction" ("id" TEXT PRIMARY KEY,"amount" NUMERIC)');
    await db.$executeRaw`INSERT INTO "Company" VALUES ('company-a'),('company-b')`;
    await db.$executeRaw`INSERT INTO "Product" ("id","companyId","sku","name") VALUES ('product-a','company-a','SKU-A','Alpha'),('product-a2','company-a','SKU-A2','Alpha'),('product-b','company-b','SECRET-SKU','Foreign')`;
    await db.$executeRaw`INSERT INTO "StockMovement" VALUES ('control-stock',42)`;
    await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES ('control-money',100.25)`;
    const ensure=new Function('prisma',bootstrapSource+';return ensureWholesaleSchema;')(db);await ensure();
    api=await httpRouter(db,ensure);
    await db.$executeRaw`INSERT INTO "WholesaleCustomer" ("id","companyId","name","active") VALUES ('customer-a','company-a','Own',true),('customer-b','company-b','Foreign',true),('inactive','company-a','Inactive',false)`;
    await db.$executeRaw`INSERT INTO "WholesalePriceList" ("id","companyId","code","name","active") VALUES ('list-a','company-a','A','Own',true),('list-b','company-b','B','Foreign',true),('inactive-list','company-a','OLD','Inactive',false)`;
    assert.equal((await api.request('/customers/customer-a/price-list','PUT',{priceListId:'list-a'})).status,200);
    assert.equal((await api.request('/customers')).data.items.find(x=>x.id==='customer-a').priceListId,'list-a');
    assert.equal((await api.request('/customers/customer-a/price-list','PUT',{})).status,400);
    for(const id of ['list-b','inactive-list','missing'])assert.equal((await api.request('/customers/customer-a/price-list','PUT',{priceListId:id})).status,400);
    for(const id of ['customer-b','inactive','missing'])assert.equal((await api.request(`/customers/${id}/price-list`,'PUT',{priceListId:null})).status,404);
    assert.equal((await api.request('/customers')).data.items.find(x=>x.id==='customer-a').priceListId,'list-a');
    for(const [productId,minimumQuantity,unitPrice,discountPercent] of [['product-a',0.125,0,null],['product-a',2.5,null,12.345],['product-a2',1,1.2345,null]])assert.equal((await api.request('/price-lists/list-a/products','PUT',{productId,minimumQuantity,unitPrice,discountPercent})).status,200);
    assert.equal((await api.request('/price-lists/list-a/products','PUT',{productId:'product-b',unitPrice:5})).status,400);
    assert.equal((await api.request('/price-lists/list-b/products','PUT',{productId:'product-a',unitPrice:5})).status,404);
    // Corrupt historical cross-company references are not disclosed by read joins.
    await db.$executeRaw`INSERT INTO "WholesalePriceListProduct" ("id","companyId","priceListId","productId","unitPrice") VALUES ('bad-product','company-a','list-a','product-b',9),('bad-company','company-b','list-a','product-a',8)`;
    const first=await api.request('/price-lists/list-a/products?page=1&pageSize=2'),second=await api.request('/price-lists/list-a/products?page=2&pageSize=2');
    assert.equal(first.status,200);assert.equal(first.data.total,3);assert.equal(first.data.items.length,2);assert.equal(second.data.items.length,1);
    assert.equal(first.data.items[0].unitPrice,0);assert.equal(first.data.items[0].minimumQuantity,0.125);assert.equal(first.data.items[0].discountPercent,null);assert.equal(first.data.items[1].unitPrice,null);assert.equal(first.data.items[1].discountPercent,12.345);assert.equal(second.data.items[0].unitPrice,1.2345);
    assert.equal((await api.request('/price-lists/list-b/products')).status,404);assert.equal((await api.request('/price-lists/list-a/products?pageSize=101')).status,400);
    assert.equal((await api.request('/customers','GET',undefined,{'x-test-role':'EMPLOYEE'})).status,403);assert.equal((await api.request('/customers','GET',undefined,{'x-test-token':'STORE_OPERATOR'})).status,403);
    assert.equal((await api.request('/customers/customer-a/price-list','PUT',{priceListId:null})).status,200);assert.equal((await api.request('/customers')).data.items.find(x=>x.id==='customer-a').priceListId,null);
    await db.$executeRaw`INSERT INTO "WholesaleCustomerPriceList" ("customerId","companyId","priceListId") VALUES ('customer-a','company-b','list-b')`;
    assert.equal((await api.request('/customers')).data.items.find(x=>x.id==='customer-a').priceListId,null);
    assert.equal((await api.request('/customers/customer-a/price-list','PUT',{priceListId:'list-a'})).status,409);
    assert.equal((await db.$queryRaw`SELECT "companyId" FROM "WholesaleCustomerPriceList" WHERE "customerId"='customer-a'`)[0].companyId,'company-b');
    assert.equal((await api.request('/customers/customer-a/price-list','PUT',{priceListId:null})).status,200);
    assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM "WholesaleCustomerPriceList" WHERE "companyId"='company-b'`)[0].n),1);
    assert.deepEqual((await db.$queryRaw`SELECT "id","quantity"::text AS quantity FROM "StockMovement"`),[{id:'control-stock',quantity:'42'}]);
    assert.deepEqual((await db.$queryRaw`SELECT "id","amount"::text AS amount FROM "StoreTransaction"`),[{id:'control-money',amount:'100.25'}]);
  }finally{if(api)await api.close();await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
