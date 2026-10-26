import {posNewProductAllowed} from '../src/lib/pos-new-product-card.js';
import {readLifecycleGeneration} from '../src/services/store-lifecycle-generation.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {z} from 'zod';
import {registerPermanentPriceRoutes} from '../src/lib/pos-permanent-price.js';
import {createPosScanCatalog} from '../../client/src/utils/pos-scanner.js';

// Register the actual catalog handlers and their store/operator middleware.
function handlers(prisma){
  const routes=new Map(),middleware=[];
  const Router=()=>({get:(path,...fns)=>routes.set(path,fns),post(){},put(){},delete(){},use:(path,fn)=>middleware.push(fn)});
  const source=fs.readFileSync(new URL('../src/routes/store-pos-catalog.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replace('export default router;','');
  // Isolate legacy catalogue routes; real new-product registration is covered by its mounted/native tests.
  new Function('Router','prisma','z','crypto','registerPermanentPriceRoutes','registerPosNewProductRoutes','posNewProductAllowed','readLifecycleGeneration',source)(Router,prisma,z,crypto,registerPermanentPriceRoutes,()=>{},posNewProductAllowed,readLifecycleGeneration);
  const older=fs.readFileSync(new URL('../src/routes/store-pos.js',import.meta.url),'utf8');
  const start=older.indexOf('router.get("/stores/:storeId",');
  const end=older.indexOf('\n',start);
  const guards=older.split('\n').filter(line=>line.startsWith('function assertStore(')||line.startsWith('async function storeFor(')).join('\n');
  new Function('router','prisma','hasTableService','capDriverV1WriterState','requestTerminal','readLifecycleGeneration',`const money=value=>Number(value||0);${guards}\n${older.slice(start,end)}`)(
    {get:(_,fn)=>routes.set('older',[fn])},prisma,async()=>false,async()=>({online:false,configured:false}),async()=>"MAIN",readLifecycleGeneration);
  return async(kind,user={id:'owner',role:'OWNER',companyId:'company'},storeId='store')=>{
    const req={user,params:{storeId},method:'GET',path:'/stores/'+storeId},res={statusCode:200,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};
    for(const fn of [...(kind==='older'?[]:middleware),...routes.get(kind)]){
      let next=false,error;await fn(req,res,e=>{next=true;error=e});if(error)throw error;if(!next)break;
    }
    return res.body;
  };
}
const kinds=['/stores/:storeId','/stores/:storeId/legacy-full','older'];
const layout={catalogCompanyId:'company',categories:[{id:'beer',productCodes:['p26656','p00001']}],quickKeys:[{productCodes:['p26656']}]};
const fixture=Array.from({length:26656},(_,i)=>({id:'p'+String(i+1).padStart(5,'0'),sku:String(i+1),name:String(i+1).padStart(5,'0'),salePrice:'1.25',vatRate:'24',currentStock:'-2.5',barcodes:i===26655?['5201004022158']:[],masterBarcodes:[],barcodeOptions:i===26655?[{barcode:'5201004022158',salePrice:'1.75'}]:[]}));

for(const kind of kinds)test('actual '+kind+' returns/scans the end of a 26656-product catalog without writes',async()=>{
  const prisma={store:{findFirst:async({where})=>where.id==='store'&&where.companyId==='company'?{id:'store',companyId:'company'}:null},
    $queryRawUnsafe:async sql=>sql.includes('current_schema')?[{schema:'fixture',fence:null}]:[{layoutJson:layout,version:7}],
    $queryRaw:async(parts,...values)=>{
      const sql=parts.join('?');if(!sql.includes('FROM "StoreProduct" sp'))return [];
      assert.match(sql,/p\."companyId"=\?/);assert.match(sql,/sp\."storeId"=\?/);assert.match(sql,/sp\."active"=true AND p\."active"=true/);
      assert.ok(values.includes('company')&&values.includes('store'));
      // Emulate SQL cardinality only; real PostgreSQL below verifies eligibility/joins.
      const limit=sql.match(/ORDER BY c\."name" NULLS LAST,p\."name" LIMIT (\d+|\?)/);
      return fixture.slice(0,limit?(limit[1]==='?'?values.at(-1):Number(limit[1])):undefined);
    }};
  const run=handlers(prisma),result=await run(kind);
  assert.equal(result.products.length,26656);assert.equal(result.lifecycle.generation,"0");assert.deepEqual(result.layout,layout);assert.equal(result.layoutVersion,7);
  const found=createPosScanCatalog(result.products).exact('5201004022158',{complete:true});
  assert.equal(found.id,'p26656');assert.equal(found.salePrice,1.25);assert.equal(found.vatRate,24);assert.equal(found.currentStock,-2.5);
  if(kind==='older')assert.equal(found.barcodeOptions[0].salePrice,1.75);
  await assert.rejects(run(kind,{companyId:'other'}),e=>e.status===404);
  await assert.rejects(run(kind,{companyId:'company',tokenType:'STORE_OPERATOR',storeId:'control'}),e=>e.status===403);
});

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('actual catalog SQL in isolated PostgreSQL preserves complete membership, aliases/prices/layout and zero writes',{skip:!isolated(),timeout:60000},async()=>{
  const {PrismaClient}=await import('@prisma/client'),db=new PrismaClient();
  try{await db.$transaction(async tx=>{
    for(const sql of [
      'CREATE TEMP TABLE "Product"("id" text PRIMARY KEY,"companyId" text,"sku" text,"name" text,"vatRate" numeric,"salePrice" numeric,"active" boolean,"categoryId" text,"masterProductId" text,"freeSalePrice" boolean,"negativeStockWarning" boolean,"isSet" boolean,"isRecipe" boolean) ON COMMIT DROP',
      'CREATE TEMP TABLE "StoreProduct"("storeId" text,"productId" text,"active" boolean,"salePrice" numeric,"currentStock" numeric,PRIMARY KEY("storeId","productId")) ON COMMIT DROP',
      'CREATE TEMP TABLE "ProductCategory"("id" text PRIMARY KEY,"name" text) ON COMMIT DROP',
      'CREATE TEMP TABLE "ProductBarcode"("productId" text,"barcode" text,"salePrice" numeric,PRIMARY KEY("productId","barcode")) ON COMMIT DROP',
      'CREATE TEMP TABLE "MasterProduct"("id" text PRIMARY KEY,"sourceCode" text,"name" text,"active" boolean) ON COMMIT DROP',
      'CREATE TEMP TABLE "MasterProductBarcode"("masterProductId" text,"barcode" text) ON COMMIT DROP',
      'CREATE TEMP TABLE "ProductSetItem"("companyId" text,"productId" text,"relatedProductId" text,"quantity" numeric,"salePrice" numeric) ON COMMIT DROP',
      'CREATE TEMP TABLE "StoreBakedBalance"("companyId" text,"storeId" text,"productId" text,"bakedQuantity" numeric,"enabled" boolean) ON COMMIT DROP',
      'CREATE TEMP TABLE "OnlineOrderingConfig"("storeId" text,"enabled" boolean,"deliveryEnabled" boolean) ON COMMIT DROP',
      'CREATE TEMP TABLE "StorePosLayout"("storeId" text,"layoutJson" jsonb,"version" int,"publishedAt" timestamptz) ON COMMIT DROP'
    ])await tx.$executeRawUnsafe(sql);
    await tx.$executeRawUnsafe(`INSERT INTO "Product" SELECT 'p'||lpad(i::text,5,'0'),'company',i::text,lpad(i::text,5,'0'),24,1.1,true,NULL,NULL,false,true,false,false FROM generate_series(1,26656) i`);
    await tx.$executeRawUnsafe(`INSERT INTO "StoreProduct" SELECT 'store',"id",true,1.25,-2.5 FROM "Product"`);
    for(const [id,company,active,store,storeActive] of [['foreign','other',true,'store',true],['inactive','company',false,'store',true],['disabled','company',true,'store',false],['controlonly','company',true,'control',true]]){
      await tx.$executeRaw`INSERT INTO "Product"("id","companyId","sku","name","vatRate","salePrice","active") VALUES (${id},${company},${id},${id},13,8,${active})`;
      await tx.$executeRaw`INSERT INTO "StoreProduct" VALUES (${store},${id},${storeActive},9,99)`;
    }
    await tx.$executeRaw`INSERT INTO "ProductBarcode" VALUES ('p26656','5201004022158',1.75),('p00001','5201004022160',NULL)`;
    await tx.$executeRaw`INSERT INTO "MasterProduct" VALUES ('master','M-CODE','Master',true)`;
    await tx.$executeRaw`UPDATE "Product" SET "masterProductId"='master' WHERE "id"='p26656'`;
    await tx.$executeRaw`INSERT INTO "MasterProductBarcode" VALUES ('master','5201004022158'),('master','5201004022159'),('master','5201004022160')`;
    await tx.$executeRaw`INSERT INTO "StorePosLayout" VALUES ('store',${JSON.stringify(layout)}::jsonb,7,NOW())`;
    const before=await tx.$queryRawUnsafe('SELECT * FROM "StoreProduct" ORDER BY "storeId","productId"');
    const prisma={$queryRaw:tx.$queryRaw.bind(tx),$queryRawUnsafe:tx.$queryRawUnsafe.bind(tx),store:{findFirst:async({where})=>where.companyId==='company'&&['store','control'].includes(where.id)?{id:where.id,companyId:'company'}:null}};
    const run=handlers(prisma);
    for(const kind of kinds){
      const result=await run(kind);assert.equal(result.products.length,26656);assert.equal(result.lifecycle.generation,"0");assert.deepEqual(result.layout,layout);
      assert.equal(new Set(result.products.map(p=>p.id)).size,26656);assert.equal(result.products[0].id,'p00001');assert.equal(result.products.at(-1).id,'p26656');
      const index=createPosScanCatalog(result.products),target=index.exact('5201004022158',{complete:true});assert.equal(target.id,'p26656');assert.equal(target.salePrice,1.25);assert.equal(target.vatRate,24);assert.equal(target.currentStock,-2.5);
      assert.equal(index.exact('5201004022160',{complete:true}).id,'p00001');
      if(kind!=='older'){
        assert.equal(target.sourceCode,'M-CODE');assert.ok(target.barcodes.includes('5201004022159'));
        // Legacy resolution also links p00001 through its claimed master barcode.
        // Keep the existing ambiguity rejection instead of choosing either item.
        if(kind.endsWith('/legacy-full'))assert.equal(index.exact('5201004022159',{complete:true}),null);
        else assert.equal(index.exact('5201004022159',{complete:true}).id,'p26656');
      }
      else assert.equal(target.barcodeOptions[0].salePrice,1.75);
      const control=await run(kind,{companyId:'company'},'control');assert.deepEqual(control.products.map(p=>p.id),['controlonly']);
      await assert.rejects(run(kind,{companyId:'other'}),e=>e.status===404);
      await assert.rejects(run(kind,{companyId:'company',tokenType:'STORE_OPERATOR',storeId:'control'}),e=>e.status===403);
    }
    assert.deepEqual(await tx.$queryRawUnsafe('SELECT * FROM "StoreProduct" ORDER BY "storeId","productId"'),before);
  },{timeout:45000})}finally{await db.$disconnect()}
});

