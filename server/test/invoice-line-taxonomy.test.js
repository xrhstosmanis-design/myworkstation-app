import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installInvoiceLineTaxonomy} from '../../client/src/components/commerce/invoiceLineTaxonomy.js';
import {saveInvoiceStoreTaxonomy} from '../src/lib/invoice-line-taxonomy.js';

test('taxonomy editor loads current identity, filters dependent subcategories and ignores a stale selection without writes',async()=>{
 const dom=new JSDOM('<form></form>');const previous=globalThis.document;globalThis.document=dom.window.document;
 try{
  const form=document.querySelector('form'),calls=[];let release;
  const options={categories:[{id:'A',name:'A'},{id:'B',name:'B'}],subcategories:[{id:'a1',categoryId:'A',name:'A1'},{id:'b1',categoryId:'B',name:'B1'}],vatDepartments:[{id:'vat13',description:'Foods'}]};
  const api=async path=>{calls.push(path);if(path.includes('productId=slow'))await new Promise(r=>release=r);return {...options,product:{categoryId:'A',subcategoryId:'a1',vatDepartmentId:'vat13'}}};
  const editor=installInvoiceLineTaxonomy({form,order:{id:'order',storeId:'store-A'},line:{id:'line',productId:'old'},api,esc:String});
  assert.equal(await editor.values(),undefined,'opening does not persist metadata');
  assert.equal(form.elements.categoryId.value,'A');assert.equal(form.elements.subcategoryId.value,'a1');assert.equal(form.elements.subcategoryId.options.length,2);
  form.elements.categoryId.value='B';form.elements.categoryId.dispatchEvent(new dom.window.Event('change'));
  assert.deepEqual(await editor.values(),{categoryId:'B',subcategoryId:null,vatDepartmentId:'vat13'});
  assert.equal(form.elements.subcategoryId.options[1].value,'b1');
  const slow=editor.selectProduct('slow');await editor.selectProduct('fast');release();await slow;
  assert.equal(await editor.values(),undefined);assert.equal(form.elements.categoryId.value,'A');
  assert.ok(calls.every(path=>path.includes('storeId=store-A')));
 }finally{globalThis.document=previous;dom.window.close()}
});

test('store taxonomy rejects foreign/dependent identities before writing and changes only the selected store overrides',async()=>{
 const valid={categoryId:'cat',subcategoryId:'sub',vatDepartmentId:'vat'},writes=[];
 const db={$queryRaw:async(sql,...values)=>{
  const text=sql.join('?');
  if(text.includes('FROM "ProductSubcategory"'))return values[0]==='sub'&&values[1]==='cat'&&values[2]==='co'?[{id:'sub'}]:[];
  if(text.includes('FROM "ProductCategory"'))return values[0]==='cat'&&values[1]==='co'?[{id:'cat'}]:[];
  if(text.includes('FROM "ManagementVatDepartment"'))return values[0]==='vat'&&values[1]==='co'?[{id:'vat'}]:[];
  return values.includes('store-A')&&values.includes('p')?[{categoryIdOverride:null}]:[];
 },$executeRaw:async(sql,...values)=>writes.push({sql:sql.join('?'),values})};
 const run=values=>saveInvoiceStoreTaxonomy(db,{companyId:'co',storeId:'store-A',productId:'p',values});
 for(const values of [{...valid,categoryId:'foreign'},{...valid,subcategoryId:'wrong'},{...valid,vatDepartmentId:'foreign'}])await assert.rejects(()=>run(values),e=>e.status===400);
 assert.equal(writes.length,0);
 const saved=await run(valid);assert.deepEqual(saved.after,valid);assert.equal(writes.length,1);
 assert.match(writes[0].sql,/UPDATE "StoreProduct"/);assert.match(writes[0].sql,/WHERE "productId"=\? AND "storeId"=\?/);
 assert.deepEqual(writes[0].values.slice(-2),['p','store-A']);assert.doesNotMatch(writes[0].sql,/salePrice|currentStock|UPDATE "Product"/);
 await assert.rejects(()=>saveInvoiceStoreTaxonomy(db,{companyId:'co',storeId:'other',productId:'p',values:valid}),e=>e.status===404);
 assert.equal(writes.length,1);
});

test('native PostgreSQL preserves another store and rolls taxonomy back with the line transaction',{skip:!(()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}})()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),db=new PrismaClient();
 try{await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('CREATE TEMP TABLE "ProductCategory"("id" text,"companyId" text,"active" bool) ON COMMIT DROP');
  await tx.$executeRawUnsafe('CREATE TEMP TABLE "ProductSubcategory"("id" text,"categoryId" text,"companyId" text,"active" bool) ON COMMIT DROP');
  await tx.$executeRawUnsafe('CREATE TEMP TABLE "ManagementVatDepartment"("id" text,"companyId" text,"active" bool) ON COMMIT DROP');
  await tx.$executeRawUnsafe('CREATE TEMP TABLE "Product"("id" text,"companyId" text,"active" bool,"salePrice" numeric) ON COMMIT DROP');
  await tx.$executeRawUnsafe('CREATE TEMP TABLE "StoreProduct"("storeId" text,"productId" text,"active" bool,"categoryIdOverride" text,"subcategoryIdOverride" text,"vatDepartmentIdOverride" text,"updatedAt" timestamptz,"salePrice" numeric,"currentStock" numeric) ON COMMIT DROP');
  await tx.$executeRaw`INSERT INTO "ProductCategory" VALUES('cat','co',true),('foreign','else',true)`;
  await tx.$executeRaw`INSERT INTO "ProductSubcategory" VALUES('sub','cat','co',true),('wrong','other','co',true)`;
  await tx.$executeRaw`INSERT INTO "ManagementVatDepartment" VALUES('vat','co',true),('foreign','else',true)`;
  await tx.$executeRaw`INSERT INTO "Product" VALUES('p','co',true,2)`;
  await tx.$executeRaw`INSERT INTO "StoreProduct" VALUES('A','p',true,null,null,null,null,3,17),('B','p',true,null,null,null,null,4,99)`;
  const before=await tx.$queryRaw`SELECT * FROM "StoreProduct" ORDER BY "storeId"`,values={categoryId:'cat',subcategoryId:'sub',vatDepartmentId:'vat'};
  await saveInvoiceStoreTaxonomy(tx,{companyId:'co',storeId:'A',productId:'p',values});
  const after=await tx.$queryRaw`SELECT * FROM "StoreProduct" ORDER BY "storeId"`;
  assert.deepEqual(after[1],before[1]);assert.equal(Number(after[0].salePrice),3);assert.equal(Number(after[0].currentStock),17);assert.equal(after[0].categoryIdOverride,'cat');
  for(const invalid of [{...values,categoryId:'foreign'},{...values,subcategoryId:'wrong'},{...values,vatDepartmentId:'foreign'}])await assert.rejects(()=>saveInvoiceStoreTaxonomy(tx,{companyId:'co',storeId:'A',productId:'p',values:invalid}));
  assert.deepEqual(await tx.$queryRaw`SELECT * FROM "StoreProduct" ORDER BY "storeId"`,after);
  await tx.$executeRawUnsafe('SAVEPOINT line_save');
  await saveInvoiceStoreTaxonomy(tx,{companyId:'co',storeId:'A',productId:'p',values:{...values,subcategoryId:null}});
  await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT line_save');
  assert.deepEqual(await tx.$queryRaw`SELECT * FROM "StoreProduct" ORDER BY "storeId"`,after);
  assert.equal(Number((await tx.$queryRaw`SELECT "salePrice" FROM "Product" WHERE "id"='p'`)[0].salePrice),2);
 })}finally{await db.$disconnect()}
});
