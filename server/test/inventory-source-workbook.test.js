import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import XLSX from "xlsx";
import {z} from "zod";
import {attachSourceWorkbook,validateSourceDepartments} from "../src/routes/inventory-source-workbook.js";
import {assertSourceCostStorage,fitsSourcePrice,ensureProductCostPrecision} from "../src/product-cost-precision.js";
import {importFullArchive} from "../src/routes/inventory-archive-full-import.js";
import {KAT_DEPARTMENTS} from "../src/routes/inventory-kat-source.js";

const definitions=[
  [1,"01.ΚΑΦΕΣ","1",13,true],[2,"02.ΕΙΔΗ 6","104",6,true],[3,"03.ΤΡΟΦΙΜΑ","7",13,true],
  [4,"04.ΕΙΔΗ 13","42",13,true],[5,"05.ΕΙΔΗ 24","15",24,true],[6,"06.ΠΑΡΟΧΗ ΥΠΗΡΕΣΙΩΝ","227",24,false],
  [7,"07. ΠΕΡΙΒ. ΤΕΛΟΣ","17",24,false],[8,"08. ΕΙΣΦ.ΠΡΟΣΤ. ΠΕΡΙΒΑΛΛ","228",24,false],[9,"09. ΚΑΡΤΕΣ","45",0,true]
];
const departments=definitions.map(([cashRegisterDepartment,description,legacyVatCode,vatRate,commerce])=>({id:`department-${cashRegisterDepartment}`,cashRegisterDepartment,description,legacyVatCode,vatRate,commerce,active:true,exemptionCode:cashRegisterDepartment===9?"27":null,exemptionDescription:cashRegisterDepartment===9?"Λοιπές Εξαιρέσεις ΦΠΑ":null}));
async function hStorage(db){return (await db.$queryRaw`SELECT data_type,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='Product' AND column_name='costPrice'`)[0]}
function fixture(){
  return {
    rows:[{SKU:"VIRTUAL-IMPORT-1",Περιγραφή:"Virtual source item",Barcode:"00000001",Λιανική:2.25,Αγορά:0.7155,ΦΠΑ:13,Απόθεμα:0,"Τμήμα ΦΠΑ":"01.ΚΑΦΕΣ","Τμήμα ταμειακής":1,"Μονάδα Kiosk":"TEM"},
      {SKU:"VIRTUAL-IMPORT-2",Περιγραφή:"Virtual cards",Barcode:"",Λιανική:10,Αγορά:9,ΦΠΑ:0,Απόθεμα:0,"Τμήμα ΦΠΑ":"09. ΚΑΡΤΕΣ","Τμήμα ταμειακής":9,"Μονάδα Kiosk":"TEM"}],
    barcodes:[{SKU:"VIRTUAL-IMPORT-1",Barcode:"00000001",Ρόλος:"ΚΥΡΙΟ"},{SKU:"VIRTUAL-IMPORT-1",Barcode:"00000002",Ρόλος:"ΠΡΟΣΘΕΤΟ"}],
    definitions:departments.map(d=>({"Τμήμα ταμειακής":d.cashRegisterDepartment,"Περιγραφή Kiosk":d.description,"ΚΩΔ ΦΠΑ Kiosk":d.legacyVatCode,ΦΠΑ:d.vatRate,"Εμπορία πηγής":d.commerce?"ΝΑΙ":"ΟΧΙ",Χρήση:"ΤΜΗΜΑΤΑ ΠΡΩΤΗΣ ΕΙΣΑΓΩΓΗΣ"}))
  };
}
function file(f=fixture()){
  const w=XLSX.utils.book_new();
  for(const [name,rows] of [[f.kat?"ΚΑΤ_IMPORT":"ΠΡΟΪΟΝΤΑ_IMPORT",f.rows],["ΕΛΕΓΧΟΣ",[{SKU:"DO-NOT-IMPORT"}]],["ΕΚΤΟΣ_ΕΙΣΑΓΩΓΗΣ",[{SKU:"EXCLUDED"}]],["ΤΜΗΜΑΤΑ",f.definitions],["BARCODES_IMPORT",f.barcodes],...(f.kat?[["KAT_META",f.meta],["EXISTING_IMPORT",f.existing]]:[])])XLSX.utils.book_append_sheet(w,XLSX.utils.json_to_sheet(rows),name);
  return "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,"+XLSX.write(w,{type:"buffer",bookType:"xlsx"}).toString("base64");
}
function harness(db){
  const routes=new Map();let access;
  const router={use:fn=>{access=fn},post:(p,fn)=>routes.set(p,fn)};
  const source=fs.readFileSync(new URL("../src/routes/inventory-archive-import.js",import.meta.url),"utf8").replace(/^import .*;$/gm,"").replace(/^export /gm,"").replace("default router;","return {router,readWorkbook,normalizeRows,classify,prepareArchiveRows};");
  const functions=new Function("Router","z","crypto","XLSX","prisma","importFullArchive","ensureProductCompanySchema","ensureVatDepartmentSchema","attachSourceWorkbook","validateSourceDepartments","assertSourceCostStorage","fitsSourcePrice",source)(()=>router,z,crypto,XLSX,db,importFullArchive,async()=>{},async()=>{},attachSourceWorkbook,validateSourceDepartments,assertSourceCostStorage,fitsSourcePrice);
  return {...functions,async call(path,body,user={id:"owner",role:"OWNER",companyId:"company"}){
    const req={body,user},res={statusCode:200,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};let allowed=false,error;
    access(req,res,()=>{allowed=true});if(allowed)await routes.get(path)(req,res,e=>{error=e});
    return {...res,error,statusCode:error?.status||res.statusCode};
  }};
}
function double({savedDepartments=departments,products=[],barcodeProducts=[],snapshots=[],storage={data_type:"numeric",numeric_precision:16,numeric_scale:6}}={}){
  let writes=0;
  const db={store:{findFirst:async({where})=>where.id==="store"&&where.companyId==="company"?{id:"store",name:"Virtual store"}:null},
    $queryRaw:async(strings)=>{const q=strings.join("?");if(q.includes("information_schema.columns"))return [storage];if(q.includes('AS fingerprint'))return snapshots;if(q.includes('FROM "ManagementVatDepartment"'))return savedDepartments;if(q.includes('FROM "ProductBarcode"'))return barcodeProducts;return products},
    $executeRaw:async()=>{writes++;return 1},$executeRawUnsafe:async()=>{writes++;return 1},$transaction:async()=>{throw new Error("Unexpected transaction")}};
  return {db,get writes(){return writes}};
}

test("source workbook preserves all primary/additional barcodes and ignores held sheets",async()=>{
  const h=harness(double().db),raw=h.readWorkbook(file()),rows=h.normalizeRows(raw);
  assert.equal(rows.length,2);assert.deepEqual(rows[0].barcodes,["00000001","00000002"]);assert.deepEqual(rows[1].barcodes,[]);
  assert.equal(rows[0].costPrice,0.7155);assert.equal(rows[1].vatRate,0);assert.ok(rows.every(r=>r.stock===0&&r.errors.length===0));
  assert.equal(raw.sourceProfile.barcodeCount,2);
});
test("actual preview validates saved source departments without writing",async()=>{
  const d=double(),r=await harness(d.db).call("/import-preview",{storeId:"store",dataUrl:file()});
  assert.equal(r.error,undefined);assert.deepEqual(r.body.summary,{total:2,create:2,update:0,invalid:0,barcodes:2,sourceProfile:"DAILY_BITE_V2"});assert.equal(d.writes,0);
});
test("malformed source definitions, barcode links and primary discrepancies fail closed",()=>{
  const changes=[f=>{f.definitions[0].ΦΠΑ=24},f=>{f.barcodes[1].SKU="DO-NOT-IMPORT"},f=>{f.barcodes[1].Barcode="00000001"},f=>{f.rows[0].Barcode="99999999"},f=>{f.barcodes[0].Barcode=12345678},f=>{f.barcodes[0].Ρόλος="UNKNOWN"}];
  for(const change of changes){const f=fixture();change(f);assert.throws(()=>harness(double().db).readWorkbook(file(f)),e=>e.status===400);}
});
test("five/six decimal costs remain exact in preview",async()=>{
  const f=fixture();f.rows[0].Αγορά=0.719037;f.rows[1].Αγορά=0.64602;
  const r=await harness(double().db).call("/import-preview",{storeId:"store",dataUrl:file(f)});
  assert.equal(r.body.summary.invalid,0);assert.equal(r.body.rows[0].costPrice,0.719037);assert.equal(r.body.rows[1].costPrice,0.64602);
});
test("old, narrow, missing or nonnumeric storage rejects source preview and final import without writes",async()=>{
  for(const storage of [{data_type:"numeric",numeric_precision:14,numeric_scale:4},{data_type:"numeric",numeric_precision:12,numeric_scale:6},{data_type:"double precision"},undefined]){
    const d=double({storage:storage??{}}),h=harness(d.db),body={storeId:"store",dataUrl:file()};
    assert.equal((await h.call("/import-preview",body)).statusCode,409);assert.equal((await h.call("/import",body)).statusCode,409);assert.equal(d.writes,0);
  }
});
test("wrong register, VAT, unit or nonzero stock is invalid before import",async()=>{
  for(const [key,value] of [["Τμήμα ταμειακής",4],["ΦΠΑ",24],["Απόθεμα",1],["Μονάδα Kiosk","KG"],["Αγορά",0.6460201]]){
    const f=fixture();f.rows[0][key]=value;const d=double(),h=harness(d.db),body={storeId:"store",dataUrl:file(f)};
    const r=await h.call("/import-preview",body);assert.equal(r.body.summary.invalid,1,key);assert.equal((await h.call("/import",body)).statusCode,409);assert.equal(d.writes,0);
  }
});
test("source workbook refuses existing-stock overwrite even when explicitly selected",async()=>{
  const d=double();assert.equal((await harness(d.db).call("/import",{storeId:"store",dataUrl:file(),applyStock:true})).statusCode,400);assert.equal(d.writes,0);
});
test("missing, duplicate, wrong-commerce or wrong-exemption departments block preview without writes",async()=>{
  for(const change of [d=>d.pop(),d=>d.push({...d[0]}),d=>{d[5].commerce=true},d=>{d[8].exemptionCode="7"},d=>{d[8].active=false}]){
    const saved=structuredClone(departments);change(saved);const d=double({savedDepartments:saved});const r=await harness(d.db).call("/import-preview",{storeId:"store",dataUrl:file()});assert.equal(r.statusCode,400);assert.equal(d.writes,0);
  }
});
test("additional-barcode collisions and existing SKU/replay cannot update existing items",async()=>{
  for(const data of [{products:[{id:"existing",sku:"VIRTUAL-IMPORT-1",name:"Existing"}]},{barcodeProducts:[{id:"existing",sku:"OTHER",barcode:"00000002"}]},{barcodeProducts:[{id:"existing",sku:"VIRTUAL-IMPORT-1",barcode:"00000002"}]}]){
    const d=double(data),h=harness(d.db),body={storeId:"store",dataUrl:file()};const p=await h.call("/import-preview",body);assert.equal(p.body.summary.invalid,1);assert.equal((await h.call("/import",body)).statusCode,409);assert.equal(d.writes,0);
  }
});
test("operator and foreign-store requests fail without reads or writes",async()=>{
  const d=double(),h=harness(d.db),body={storeId:"store",dataUrl:file()};
  assert.equal((await h.call("/import",body,{role:"OWNER",tokenType:"STORE_OPERATOR",companyId:"company"})).statusCode,403);
  assert.equal((await h.call("/import-preview",body,{role:"OWNER",companyId:"foreign"})).statusCode,404);assert.equal(d.writes,0);
});
test("legacy Diadochou normalization and single-barcode CSV behavior are retained",()=>{
  const h=harness(double().db),rows=h.normalizeRows([{SKU:"LEGACY",Περιγραφή:"Legacy",Barcode:"00000001","Τμήμα ΦΠΑ":"ΕΙΔΗ 24","ΚΩΔ. ΦΠΑ":"15",ΦΠΑ:24}]);
  assert.equal(rows[0].vatRate,24);assert.deepEqual(rows[0].errors,[]);assert.deepEqual(rows[0].barcodes,["00000001"]);
});

function katFixture(){
  const f=fixture();f.kat=true;f.meta=[{Profile:'KAT_CATALOG_V1',CompanyId:'company',StoreId:'store'}];f.existing=[];
  f.definitions=KAT_DEPARTMENTS.map(d=>({'Τμήμα ταμειακής':d.cashRegisterDepartment,'Περιγραφή Kiosk':d.description,'ΚΩΔ ΦΠΑ Kiosk':d.legacyVatCode,ΦΠΑ:d.vatRate,'Εμπορία πηγής':d.commerce?'ΝΑΙ':'ΟΧΙ'}));
  f.rows=f.rows.map((r,i)=>({...r,SKU:'KAT-'+(i+1),Barcode:'0000009'+(i+1),'Τμήμα ΦΠΑ':i===0?'06.ΕΙΔΗ 24':'06.ΠΑΡΟΧΗ ΥΠΗΡΕΣΙΩΝ','Τμήμα ταμειακής':6,ΦΠΑ:24}));
  f.barcodes=f.rows.map(r=>({SKU:r.SKU,Barcode:r.Barcode,Ρόλος:'ΚΥΡΙΟ'}));return f;
}
const katSaved=()=>KAT_DEPARTMENTS.map((d,i)=>({...d,id:'kat-dept-'+i,active:true,description:'Existing alias '+i,exemptionCode:null}));
test('KAT profile distinguishes both register-6 departments and resolves full identities despite display aliases',async()=>{
  const f=katFixture(),d=double({savedDepartments:katSaved()}),h=harness(d.db),raw=h.readWorkbook(file(f));
  const result=await h.call('/import-preview',{storeId:'store',dataUrl:file(f)});
  assert.equal(result.error,undefined);assert.equal(result.body.summary.create,2);assert.equal(result.body.summary.invalid,0);assert.equal(d.writes,0);
  validateSourceDepartments(raw.sourceProfile,katSaved());
  assert.notEqual(raw.sourceProfile.departmentBindings['06.ΕΙΔΗ 24'],raw.sourceProfile.departmentBindings['06.ΠΑΡΟΧΗ ΥΠΗΡΕΣΙΩΝ']);
  const blank=katFixture();blank.rows[1].BARCODE='00000091';blank.rows[1].Barcode='';blank.barcodes.pop();
  const normalized=h.normalizeRows(h.readWorkbook(file(blank)));assert.equal(normalized[1].barcode,'');assert.deepEqual(normalized[1].barcodes,[]);
});
test('KAT source profile refuses altered identities, shared barcodes, missing snapshot and foreign target',async()=>{
  for(const change of [f=>f.definitions[4]['ΚΩΔ ΦΠΑ Kiosk']='15',f=>f.barcodes[1].Barcode=f.barcodes[0].Barcode,f=>f.rows[0].SKU='WRONG',f=>f.existing.push({SKU:'KAT-1',ProductId:'id',ExistingSku:'OLD',Fingerprint:'bad'})]){
    const f=katFixture();change(f);assert.throws(()=>harness(double().db).readWorkbook(file(f)));
  }
  for(const change of [d=>d.splice(4,1),d=>d.push({...d[3]}),d=>d[4].commerce=true,d=>d[3].vatRate=13,d=>d[3].active=false]){
    const saved=katSaved();change(saved);const d=double({savedDepartments:saved});assert.equal((await harness(d.db).call('/import-preview',{storeId:'store',dataUrl:file(katFixture())})).statusCode,409);assert.equal(d.writes,0);
  }
  const f=katFixture();f.meta[0].StoreId='OTHER';assert.equal((await harness(double({savedDepartments:katSaved()}).db).call('/import-preview',{storeId:'store',dataUrl:file(f)})).statusCode,409);
});
test('KAT existing identity permits rename only with exact company snapshot and rejects stale/cross-store/collision/replay',async()=>{
  const f=katFixture(),fingerprint='a'.repeat(32);f.existing=[{SKU:'KAT-2',ProductId:'existing',ExistingSku:'OLD-2',Fingerprint:fingerprint}];
  const data={savedDepartments:katSaved(),barcodeProducts:[{id:'existing',sku:'OLD-2',barcode:'00000092'}],snapshots:[{id:'existing',sku:'OLD-2',fingerprint,currentStock:-7,otherStore:false}]};
  const result=await harness(double(data).db).call('/import-preview',{storeId:'store',dataUrl:file(f)});
  assert.equal(result.body.summary.create,1);assert.equal(result.body.summary.update,1);assert.equal(result.body.summary.invalid,0);assert.equal(result.body.rows[1].expectedStock,-7);
  for(const change of [d=>d.snapshots[0].fingerprint='b'.repeat(32),d=>d.snapshots[0].otherStore=true,d=>d.snapshots[0].sku='KAT-2',d=>d.barcodeProducts[0].id='another',d=>d.snapshots=[]]){
    const copy=structuredClone(data);change(copy);const d=double(copy),h=harness(d.db),body={storeId:'store',dataUrl:file(f)};assert.equal((await h.call('/import-preview',body)).body.summary.invalid,1);assert.equal((await h.call('/import',body)).statusCode,409);assert.equal(d.writes,0);
  }
});

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test("native PostgreSQL actual import is atomic, preserves controls and rejects concurrent replay",{skip:!isolated()},async()=>{
  const {PrismaClient}=await import("@prisma/client"),admin=new PrismaClient(),schema="source_archive_"+crypto.randomUUID().replaceAll("-","");
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set("schema",schema);const db=new PrismaClient({datasourceUrl:url.toString()});
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const sql of [
      'CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text,"active" bool)',
      'CREATE TABLE "ProductCategory"("id" text primary key,"companyId" text,"name" text,unique("companyId","name"))',
      'CREATE TABLE "ProductSubcategory"("id" text primary key,"companyId" text,"categoryId" text,"name" text)',
      'CREATE TABLE "Supplier"("id" text primary key,"companyId" text,"name" text)',
      'CREATE TABLE "ManagementProductCompany"("id" text primary key,"companyId" text,"name" text,unique("companyId","name"))',
      'CREATE TABLE "ManagementVatDepartment"("id" text primary key,"companyId" text,"description" text,"vatRate" numeric,"legacyVatCode" text,"cashRegisterDepartment" int,"commerce" bool,"active" bool,"exemptionCode" text,"exemptionDescription" text)',
      'CREATE TABLE "Product"("id" text primary key,"companyId" text,"categoryId" text,"subcategoryId" text,"productCompanyId" text,"vatDepartmentId" text,"sku" text,"name" text,"unit" text,"vatRate" numeric,"vatVerified" bool,"salePrice" decimal(14,4),"costPrice" decimal(14,4),"staffPrice" numeric,"discountA" numeric,"discountB" numeric,"discountC" numeric,"trackStock" bool,"active" bool,"updatedAt" timestamp,unique("companyId","sku"))',
      'CREATE TABLE "ProductBarcode"("id" text primary key,"productId" text references "Product"("id"),"barcode" text,"unitMultiplier" numeric,unique("productId","barcode"))',
      'CREATE TABLE "StoreProduct"("id" text primary key,"storeId" text,"productId" text references "Product"("id"),"salePrice" numeric,"minStock" numeric,"currentStock" numeric,"active" bool,"updatedAt" timestamp,unique("storeId","productId"))',
      'CREATE TABLE "SupplierProductLink"("id" text primary key,"companyId" text,"supplierId" text,"productId" text,"supplierCode" text,"active" bool,"source" text,"updatedAt" timestamp,unique("companyId","supplierId","productId"))'
    ])await db.$executeRawUnsafe(sql);
    await db.$executeRaw`INSERT INTO "Store" VALUES ('store','company','Virtual source store',true),('control-store','company','Virtual control',true),('foreign-store','foreign','Foreign',true)`;
    for(const d of departments)await db.$executeRaw`INSERT INTO "ManagementVatDepartment" VALUES (${d.id},'company',${d.description},${d.vatRate},${d.legacyVatCode},${d.cashRegisterDepartment},${d.commerce},${d.active},${d.exemptionCode},${d.exemptionDescription})`;
    await db.$executeRaw`INSERT INTO "Product"("id","companyId","sku","name","salePrice","costPrice") VALUES ('control','company','CONTROL','Control',3,2),('foreign-control','foreign','FOREIGN','Foreign',4,3)`;
    await db.$executeRaw`INSERT INTO "StoreProduct"("id","storeId","productId","salePrice","currentStock") VALUES ('control-sp','control-store','control',3,7),('foreign-sp','foreign-store','foreign-control',4,-2)`;
    const observe=()=>db.$queryRaw`SELECT p."id",p."sku",p."salePrice",p."costPrice",sp."storeId",sp."currentStock" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" WHERE p."id" IN ('control','foreign-control') ORDER BY p."id"`;
    const before=await observe();
    const oldStorage=await hStorage(db);assert.equal(oldStorage.numeric_scale,4);
    const incompatible=harness({...Object.fromEntries(["$queryRaw","$executeRaw","$executeRawUnsafe","$transaction"].map(k=>[k,db[k].bind(db)])),store:{findFirst:async()=>({id:"store"})}});
    assert.equal((await incompatible.call("/import-preview",{storeId:"store",dataUrl:file()})).statusCode,409);
    assert.deepEqual(await observe(),before);
    await ensureProductCostPrecision(db);await ensureProductCostPrecision(db);
    assert.deepEqual(await observe(),before);assert.equal((await hStorage(db)).numeric_scale,6);
    const scoped={...Object.fromEntries(["$queryRaw","$executeRaw","$executeRawUnsafe","$transaction"].map(k=>[k,db[k].bind(db)])),store:{findFirst:async({where})=>(await db.$queryRaw`SELECT "id","name" FROM "Store" WHERE "id"=${where.id} AND "companyId"=${where.companyId} AND "active"=true`)[0]}};
    const high=fixture();high.rows[0].Αγορά=0.719037;high.rows[1].Αγορά=0.64602;
    const h=harness(scoped),body={storeId:"store",dataUrl:file(high)};
    assert.equal((await h.call("/import-preview",body)).body.summary.create,2);
    const results=await Promise.all([h.call("/import",body),h.call("/import",body)]);
    assert.deepEqual(results.map(r=>r.statusCode).sort(),[201,409]);
    const success=results.find(r=>r.statusCode===201);assert.deepEqual(success.body,{ok:true,created:2,updated:0,barcodes:2,verified:true,applyStock:false});
    const imported=await db.$queryRaw`SELECT p."sku",p."costPrice",p."vatDepartmentId",sp."currentStock",sp."storeId" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" WHERE p."sku" LIKE 'VIRTUAL-IMPORT-%' ORDER BY p."sku"`;
    assert.equal(imported.length,2);assert.equal(Number(imported[0].costPrice),0.719037);assert.equal(Number(imported[1].costPrice),0.64602);assert.equal(imported[1].vatDepartmentId,"department-9");assert.ok(imported.every(p=>p.storeId==="store"&&Number(p.currentStock)===0));
    assert.deepEqual((await db.$queryRaw`SELECT "barcode" FROM "ProductBarcode" ORDER BY "barcode"`).map(r=>r.barcode),["00000001","00000002"]);
    assert.deepEqual(await observe(),before);
    assert.equal((await h.call("/import",body)).statusCode,409);
    assert.equal((await h.call("/import-preview",body,{role:"OWNER",companyId:"foreign"})).statusCode,404);
    // Inject a persistence failure after product INSERT; all product/store/barcode
    // changes must roll back, including the first item of the same transaction.
    await db.$executeRaw`DELETE FROM "ProductBarcode"`;
    await db.$executeRaw`DELETE FROM "StoreProduct" WHERE "storeId"='store'`;
    await db.$executeRaw`DELETE FROM "Product" WHERE "sku" LIKE 'VIRTUAL-IMPORT-%'`;
    await db.$executeRawUnsafe('ALTER TABLE "ProductBarcode" ADD CHECK ("barcode"<>\'00000002\')');
    assert.ok((await h.call("/import",body)).error);
    assert.equal((await db.$queryRaw`SELECT "id" FROM "Product" WHERE "sku" LIKE 'VIRTUAL-IMPORT-%'`).length,0);
    assert.equal((await db.$queryRaw`SELECT "id" FROM "StoreProduct" WHERE "storeId"='store'`).length,0);
    assert.equal((await db.$queryRaw`SELECT "id" FROM "ProductBarcode"`).length,0);assert.deepEqual(await observe(),before);
    // New KAT-specific coverage: exact same register/different fiscal identity,
    // one existing product rename with stock/recipe identity preservation,
    // an injected mid-transaction failure and a concurrent repeat.
    await db.$executeRawUnsafe('ALTER TABLE "Product" ADD COLUMN "isRecipe" boolean DEFAULT false');
    await db.$executeRawUnsafe('ALTER TABLE "Product" ADD COLUMN "eDeliveryEnabled" boolean DEFAULT false');
    await db.$executeRaw`INSERT INTO "Store" VALUES ('kat-store','kat-company','Virtual KAT',true)`;
    for(const d of katSaved())await db.$executeRaw`INSERT INTO "ManagementVatDepartment" VALUES (${d.id},'kat-company',${d.description},${d.vatRate},${d.legacyVatCode},${d.cashRegisterDepartment},${d.commerce},true,NULL,NULL)`;
    await db.$executeRaw`INSERT INTO "Product"("id","companyId","sku","name","salePrice","costPrice","isRecipe","eDeliveryEnabled") VALUES ('kat-existing','kat-company','OLD-2','Existing KAT',10,9,true,true)`;
    await db.$executeRaw`INSERT INTO "StoreProduct"("id","storeId","productId","salePrice","currentStock") VALUES ('kat-sp','kat-store','kat-existing',10,-7)`;
    await db.$executeRaw`INSERT INTO "ProductBarcode" VALUES ('kat-barcode','kat-existing','00000092',1)`;
    const [snapshot]=await db.$queryRaw`SELECT md5(json_build_object('product',row_to_json(p),'barcodes',COALESCE((SELECT json_agg(b."barcode" ORDER BY b."barcode") FROM "ProductBarcode" b WHERE b."productId"=p."id"),'[]'::json))::text) AS fingerprint FROM "Product" p WHERE p."id"='kat-existing'`;
    const k=katFixture();k.meta[0]={Profile:'KAT_CATALOG_V1',CompanyId:'kat-company',StoreId:'kat-store'};k.existing=[{SKU:'KAT-2',ProductId:'kat-existing',ExistingSku:'OLD-2',Fingerprint:snapshot.fingerprint}];k.barcodes.push({SKU:'KAT-2',Barcode:'00000093',Ρόλος:'ΠΡΟΣΘΕΤΟ'});
    const kb={storeId:'kat-store',dataUrl:file(k)},ku={role:'OWNER',companyId:'kat-company'};
    const kp=await h.call('/import-preview',kb,ku);assert.equal(kp.body.summary.create,1);assert.equal(kp.body.summary.update,1);assert.equal(kp.body.summary.invalid,0);
    const katObserve=()=>db.$queryRaw`SELECT p.*,sp."currentStock" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" WHERE p."id"='kat-existing'`;
    const katBefore=await katObserve();
    let acquired,release;const ready=new Promise(r=>{acquired=r}),heldLock=new Promise(r=>{release=r});
    const blocker=db.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id"='kat-existing' FOR UPDATE`;acquired();await heldLock;},{timeout:10000});
    await ready;let busy;
    try{busy=await h.call('/import',kb,ku);}finally{release();await blocker;}
    assert.equal(busy.statusCode,409);assert.match(busy.error.message,/ενημερώνεται τώρα/);assert.deepEqual(await katObserve(),katBefore);
    await db.$executeRawUnsafe('ALTER TABLE "ProductBarcode" ADD CONSTRAINT kat_injected_failure CHECK ("barcode"<>\'00000093\')');
    assert.ok((await h.call('/import',kb,ku)).error);assert.deepEqual(await katObserve(),katBefore);assert.equal((await db.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"='kat-company' AND "sku"='KAT-1'`).length,0);
    await db.$executeRawUnsafe('ALTER TABLE "ProductBarcode" DROP CONSTRAINT kat_injected_failure');
    const kr=await Promise.all([h.call('/import',kb,ku),h.call('/import',kb,ku)]);assert.deepEqual(kr.map(r=>r.statusCode).sort(),[201,409]);
    assert.deepEqual(kr.find(r=>r.statusCode===201).body,{ok:true,created:1,updated:1,barcodes:3,verified:true,applyStock:false});
    const [ka]=await katObserve();assert.equal(ka.sku,'KAT-2');assert.equal(Number(ka.currentStock),-7);assert.equal(ka.isRecipe,true);assert.equal(ka.eDeliveryEnabled,true);assert.equal(ka.vatDepartmentId,'kat-dept-4');
    const [kn]=await db.$queryRaw`SELECT p."vatDepartmentId",sp."currentStock" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" WHERE p."companyId"='kat-company' AND p."sku"='KAT-1'`;assert.equal(kn.vatDepartmentId,'kat-dept-3');assert.equal(Number(kn.currentStock),0);
    assert.deepEqual(await observe(),before);assert.equal((await h.call('/import',kb,ku)).statusCode,409);
  }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
