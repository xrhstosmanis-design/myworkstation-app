import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createInventoryCard} from '../src/lib/inventory-new-card.js';

const user={id:'owner',companyId:'company',role:'OWNER'};
const body=()=>({requestId:crypto.randomUUID(),storeId:'store',name:'Complete virtual product',sku:'',description:'Details',categoryId:'cat',subcategoryId:'sub',productCompanyId:'brand',unit:'KG',costPrice:1.2,salePrice:2.5,vatRate:13,vatVerified:true,staffPrice:2,deliveryPrice:3,minOrderQuantity:4,capacity:5,openingStock:6,active:false,trackStock:true,allowDiscount:false,allowPosPriceChange:true,freeSalePrice:true,negativeStockWarning:true,isSet:true,isRecipe:false,discountA:1,discountB:2,discountC:3,barcodes:[{barcode:'520000000001',unitMultiplier:2,salePrice:4,name:'Pack'}],supplierCodes:[{supplierId:'supplier',supplierCode:'SUP1'}]});
function adapter({invalid='',failWrite='',duplicate=false}={}){
 const writes=[],committed=[],audit=[];
 const db={$transaction:async fn=>{const start=writes.length;try{const r=await fn({store:{findFirst:async()=>invalid==='store'?null:{id:'store'}},$queryRaw:async(strings,...values)=>{const q=strings.join('?');if(q.includes('StoreOperatorAudit'))return audit;if(q.includes('MAX('))return [{next:10002}];if(q.includes('ProductBarcode'))return duplicate?[{id:'other'}]:[];if(q.includes('"sku"=?'))return [];for(const table of ['ProductCategory','ProductSubcategory','ManagementProductCompany','Supplier'])if(q.includes('FROM "'+table+'"'))return invalid===table?[]:[{id:'valid'}];throw Error(q)},$executeRaw:async(strings,...values)=>{const q=strings.join('?');if(q.includes(failWrite)&&failWrite)throw Error('forced write failure');writes.push({q,values});if(q.includes('INSERT INTO "StoreOperatorAudit"'))audit.push({details:JSON.parse(values.at(-1))});return 1}});committed.push(...writes.slice(start));return r}catch(e){writes.splice(start);audit.splice(0);throw e}}};return {db,writes,committed};
}
test('complete card persists all fields, one selected store, opening movement and identity replay once',async()=>{
 const a=adapter(),p=body(),r=await createInventoryCard(a.db,user,p);assert.equal(r.sku,'10002');
 const product=a.writes.find(x=>x.q.includes('INSERT INTO "Product"'));assert.equal(product.values[8],'KG');assert.equal(product.values[15],2);assert.equal(product.values[18],5);assert.deepEqual(product.values.slice(-3),[1,2,3]);
 assert.equal(a.writes.filter(x=>x.q.includes('INSERT INTO "StoreProduct"')).length,1);assert.equal(a.writes.find(x=>x.q.includes('INSERT INTO "StoreProduct"')).values[1],'store');
 assert.equal(a.writes.filter(x=>x.q.includes('StockMovement')).length,1);const before=a.writes.filter(x=>x.q.includes('INSERT')).length;
 assert.equal((await createInventoryCard(a.db,user,p)).id,r.id);assert.equal(a.writes.filter(x=>x.q.includes('INSERT')).length,before);
 await assert.rejects(()=>createInventoryCard(a.db,user,{...p,name:'Changed'}),e=>e.status===409);
});
for(const invalid of ['store','ProductCategory','ProductSubcategory','ManagementProductCompany','Supplier'])test('new card refuses foreign/inactive '+invalid+' before business writes',async()=>{const a=adapter({invalid});await assert.rejects(()=>createInventoryCard(a.db,user,body()));assert.equal(a.committed.filter(x=>x.q.includes('INSERT')).length,0)});
test('duplicate barcode and store-bound user cannot create',async()=>{await assert.rejects(()=>createInventoryCard(adapter({duplicate:true}).db,user,body()),e=>e.status===409);await assert.rejects(()=>createInventoryCard(adapter().db,{...user,storeId:'other'},body()),e=>e.status===403)});
test('late supplier insert failure rolls back product, barcode and stock',async()=>{const a=adapter({failWrite:'INSERT INTO "SupplierProductLink"'});await assert.rejects(()=>createInventoryCard(a.db,user,body()));assert.equal(a.committed.length,0);assert.equal(a.writes.length,0)});
test('zero initial stock creates no movement and duplicate input rows fail',async()=>{const a=adapter(),p=body();await createInventoryCard(a.db,user,{...p,openingStock:0});assert.equal(a.writes.filter(x=>x.q.includes('StockMovement')).length,0);await assert.rejects(()=>createInventoryCard(adapter().db,user,{...p,barcodes:[...p.barcodes,...p.barcodes]}));});

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native PostgreSQL full creation, replay, readback and failed insert rollback',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client');const admin=new PrismaClient(),schema='new_card_test_'+crypto.randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const tables=[
   'CREATE TABLE "Store"("id" text primary key,"companyId" text,"active" bool)',
   'CREATE TABLE "ProductCategory"("id" text,"companyId" text,"active" bool)',
   'CREATE TABLE "ProductSubcategory"("id" text,"categoryId" text,"companyId" text,"active" bool)',
   'CREATE TABLE "ManagementProductCompany"("id" text,"companyId" text,"active" bool)',
   'CREATE TABLE "Supplier"("id" text,"companyId" text,"active" bool)',
   'CREATE TABLE "Product"("id" text primary key,"companyId" text,"categoryId" text,"subcategoryId" text,"productCompanyId" text,"sku" text,"name" text,"description" text,"unit" text,"vatRate" numeric,"vatVerified" bool,"salePrice" numeric,"costPrice" numeric,"trackStock" bool,"active" bool,"staffPrice" numeric,"deliveryPrice" numeric,"minOrderQuantity" numeric,"capacity" numeric,"allowDiscount" bool,"allowPosPriceChange" bool,"freeSalePrice" bool,"negativeStockWarning" bool,"isSet" bool,"isRecipe" bool,"discountA" numeric,"discountB" numeric,"discountC" numeric,unique("companyId","sku"))',
   'CREATE TABLE "ProductBarcode"("id" text,"productId" text,"barcode" text,"unitMultiplier" numeric,"salePrice" numeric,"name" text)',
   'CREATE TABLE "SupplierProductLink"("id" text,"companyId" text,"supplierId" text,"productId" text,"supplierCode" text CHECK("supplierCode"<>\'FAIL\'),"active" bool,"source" text,"updatedBy" text,"updatedByName" text)',
   'CREATE TABLE "StoreProduct"("id" text,"storeId" text,"productId" text,"salePrice" numeric,"currentStock" numeric,"active" bool)',
   'CREATE TABLE "StockMovement"("id" text,"storeId" text,"productId" text,"movementType" text,"quantity" numeric,"unitCost" numeric,"sourceType" text,"sourceId" text,"note" text,"createdByUserId" text)',
   'CREATE TABLE "StoreOperatorAudit"("id" text,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb)'
  ];for(const sql of tables)await db.$executeRawUnsafe(sql);
  for(const [table,id] of [['Store','store'],['ProductCategory','cat'],['ManagementProductCompany','brand'],['Supplier','supplier']])await db.$executeRawUnsafe(`INSERT INTO "${table}" VALUES ($1,'company',true)`,id);
  await db.$executeRawUnsafe('INSERT INTO "ProductSubcategory" VALUES (\'sub\',\'cat\',\'company\',true)');
  const p=body(),result=await createInventoryCard(db,user,p);assert.equal(result.sku,'10001');
  const product=(await db.$queryRawUnsafe('SELECT * FROM "Product"'))[0];assert.equal(product.unit,'KG');assert.equal(product.description,'Details');assert.equal(Number(product.staffPrice),2);assert.equal(product.allowDiscount,false);assert.equal(Number(product.discountC),3);assert.equal(product.productCompanyId,'brand');
  assert.equal(Number((await db.$queryRawUnsafe('SELECT "currentStock" FROM "StoreProduct"'))[0].currentStock),6);
  assert.equal((await createInventoryCard(db,user,p)).id,result.id);
  await assert.rejects(()=>createInventoryCard(db,user,{...p,requestId:crypto.randomUUID(),barcodes:[{...p.barcodes[0],barcode:'520000000002'}],supplierCodes:[{supplierId:'supplier',supplierCode:'FAIL'}]}));
  for(const table of ['Product','StoreProduct','ProductBarcode','StockMovement','StoreOperatorAudit'])assert.equal(Number((await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${table}"`))[0].n),1,table);
  await assert.rejects(()=>createInventoryCard(db,{...user,companyId:'foreign'},{...p,requestId:crypto.randomUUID()}));
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
