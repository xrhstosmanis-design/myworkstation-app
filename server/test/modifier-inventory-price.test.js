import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {z} from 'zod';
import {resolveModifierInventoryPrices,validatePreparationInventoryPrices,ensureModifierInventoryPrices} from '../src/lib/modifier-inventory-price.js';
import {restorePreparationSelection} from '../../client/src/components/store/preparation-price-selection.js';

test('inventory price refresh preserves free/fixed choices and replaces restored cart prices',async()=>{
  let price=.45;
  const db={$executeRawUnsafe:async()=>{},$queryRaw:async(strings,...args)=>{
    assert.deepEqual(args,['daily','selected',['extra','free','fixed']]);
    return [{modifierId:'extra',productId:'stock-extra',name:'Extra',sku:'DB-extra',inventoryPrice:price}];
  }};
  const original=[{id:'extra',description:'Extra',price:.2},{id:'free',price:0},{id:'fixed',price:.1}];
  let items=await resolveModifierInventoryPrices(db,'daily','selected',original);
  assert.deepEqual(items.map(x=>x.price),[.45,0,.1]);
  price=.65;items=await resolveModifierInventoryPrices(db,'daily','selected',original);
  const groups=[{id:'group',items}],selected=restorePreparationSelection(groups,original);
  assert.equal(selected.group[0].price,.65);assert.equal(items[0].fixedPrice,.2);
  assert.equal(2.25+Object.values(selected).flat().reduce((sum,x)=>sum+x.price,0),3);
  const unchanged=await resolveModifierInventoryPrices({...db,$queryRaw:async()=>[]},'daily','another',original);
  assert.deepEqual(unchanged,original);assert.deepEqual(original.map(x=>x.price),[.2,0,.1]);
  assert.deepEqual(restorePreparationSelection(groups,[{id:'foreign',price:9},{id:'synthetic-ice',price:0}]),{});
});

test('invalid links fail closed in POS and remain repairable in management',async()=>{
  for(const inventoryPrice of [null,undefined,-1,NaN]){
    const db={$executeRawUnsafe:async()=>{},$queryRaw:async()=>[{modifierId:'extra',productId:'removed',inventoryPrice}]};
    await assert.rejects(resolveModifierInventoryPrices(db,'daily','store',[{id:'extra',price:.2}]),e=>e.status===409);
    const [item]=await resolveModifierInventoryPrices(db,'daily','store',[{id:'extra',price:.2}],{strict:false});
    assert.equal(item.inventoryUnavailable,true);assert.equal(item.price,null);assert.equal(item.inventoryProductId,'removed');
  }
  await assert.rejects(resolveModifierInventoryPrices({},'daily','',[]),e=>e.status===400);
});

test('production rejects changed/tampered linked prices and accepts exact current charge',async()=>{
  const db={$executeRawUnsafe:async()=>{},$queryRaw:async()=>[{modifierId:'extra',inventoryPrice:.65}]};
  for(const price of [.2,0,.66])await assert.rejects(validatePreparationInventoryPrices(db,'daily','store',[{modifiers:[{id:'extra',price}]}]),e=>e.status===409);
  await validatePreparationInventoryPrices(db,'daily','store',[{modifiers:[{id:'extra',price:.65},{id:'free',price:0}]}]);
});

function management(db){
  const handlers=new Map();let access;
  const Router=()=>Object.fromEntries(['get','post','put','patch','delete','use'].map(method=>[method,(path,...args)=>{if(method==='use'){access=path;return}handlers.set(method+path,args.at(-1))}]));
  const source=fs.readFileSync(new URL('../src/routes/management-modifiers.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default router;','');
  new Function('Router','prisma','crypto','z','ensureModifierInventoryPrices','resolveModifierInventoryPrices',source)(Router,db,crypto,z,ensureModifierInventoryPrices,resolveModifierInventoryPrices);
  return async(req)=>{
    let status=200,result,error,allowed=false;
    const res={status(s){status=s;return this},json(x){result=x;return this}};
    access(req,res,()=>{allowed=true});if(allowed)await handlers.get('put/modifiers/:id/inventory-price')(req,res,e=>{error=e});
    return {status,result,error};
  };
}

test('actual linking endpoint checks role, selected store, company modifier and active product before writing',async()=>{
  let writes=0,foreignStore=false,productAvailable=true,modifierAvailable=true;
  const db={store:{findFirst:async({where})=>{assert.equal(where.companyId,'daily');return foreignStore?null:{id:where.id}}},
    $executeRawUnsafe:async()=>{},$executeRaw:async()=>{writes++},$queryRaw:async(strings,...args)=>{
      const sql=strings.join('?');
      if(sql.includes('FROM "ManagementModifier"')){assert.deepEqual(args,['modifier','daily']);return modifierAvailable?[{id:'modifier'}]:[]}
      assert.ok(sql.includes('sp."active"=true'));assert.ok(sql.includes('p."active"=true'));assert.deepEqual(args,['store','product','daily']);return productAvailable?[{id:'product'}]:[];
    }};
  const run=management(db),req={user:{companyId:'daily',role:'OWNER'},params:{id:'modifier'},body:{storeId:'store',productId:'product'}};
  assert.equal((await run({...req,user:{...req.user,tokenType:'STORE_OPERATOR'}})).status,403);assert.equal(writes,0);
  foreignStore=true;assert.equal((await run(req)).error.status,404);assert.equal(writes,0);foreignStore=false;
  productAvailable=false;assert.equal((await run(req)).status,400);assert.equal(writes,0);productAvailable=true;
  modifierAvailable=false;assert.equal((await run(req)).status,404);assert.equal(writes,0);modifierAvailable=true;
  assert.equal((await run(req)).result.ok,true);assert.equal(writes,1);
  assert.equal((await run({...req,body:{storeId:'store',productId:null}})).result.ok,true);assert.equal(writes,2);
});

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native PostgreSQL store override, zero, later change, foreign/missing/inactive product and control isolation',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client');const admin=new PrismaClient(),schema='modifier_price_'+crypto.randomUUID().replaceAll('-','');
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await db.$executeRawUnsafe('CREATE TABLE "Product"("id" text primary key,"companyId" text,"name" text,"sku" text,"salePrice" numeric(14,4),"active" boolean)');
    await db.$executeRawUnsafe('CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"salePrice" numeric(14,4),"currentStock" numeric,"active" boolean)');
    await ensureModifierInventoryPrices(db);
    await db.$executeRaw`INSERT INTO "Product" VALUES ('extra','daily','Extra','DB-extra',0.4,true),('foreign','kat','Foreign','KAT-extra',9,true)`;
    await db.$executeRaw`INSERT INTO "StoreProduct" VALUES ('store','extra',0.6500,0,true),('control','extra',0.9,17,true),('store','foreign',9,0,true)`;
    await db.$executeRaw`INSERT INTO "ModifierInventoryPrice"("companyId","storeId","modifierId","productId") VALUES ('daily','store','m','extra')`;
    const input=[{id:'m',price:.2},{id:'free',price:0}],get=()=>resolveModifierInventoryPrices(db,'daily','store',input);
    assert.equal((await get())[0].price,.65);
    assert.deepEqual(await resolveModifierInventoryPrices(db,'daily','control',input),input);
    await db.$executeRaw`UPDATE "StoreProduct" SET "salePrice"=0 WHERE "storeId"='store' AND "productId"='extra'`;assert.equal((await get())[0].price,0);
    await db.$executeRaw`UPDATE "StoreProduct" SET "salePrice"=NULL WHERE "storeId"='store' AND "productId"='extra'`;assert.equal((await get())[0].price,.4);
    await db.$executeRaw`UPDATE "Product" SET "salePrice"=.7500 WHERE "id"='extra'`;assert.equal((await get())[0].price,.75);
    for(const productId of ['foreign','missing']){await db.$executeRaw`UPDATE "ModifierInventoryPrice" SET "productId"=${productId}`;await assert.rejects(get(),e=>e.status===409)}
    await db.$executeRaw`UPDATE "ModifierInventoryPrice" SET "productId"='extra'`;
    await db.$executeRaw`UPDATE "Product" SET "active"=false WHERE "id"='extra'`;await assert.rejects(get(),e=>e.status===409);
    await db.$executeRaw`UPDATE "Product" SET "active"=true WHERE "id"='extra'`;
    await db.$executeRaw`UPDATE "StoreProduct" SET "active"=false WHERE "storeId"='store'`;await assert.rejects(get(),e=>e.status===409);
    const control=await db.$queryRaw`SELECT "salePrice","currentStock" FROM "StoreProduct" WHERE "storeId"='control'`;assert.equal(Number(control[0].salePrice),.9);assert.equal(Number(control[0].currentStock),17);
  }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
