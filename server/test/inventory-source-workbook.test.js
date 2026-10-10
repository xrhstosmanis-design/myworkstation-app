import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import XLSX from "xlsx";
import {z} from "zod";
import {attachSourceWorkbook,validateSourceDepartments} from "../src/routes/inventory-source-workbook.js";
import {importFullArchive} from "../src/routes/inventory-archive-full-import.js";

const definitions=[
  [1,"01.ΚΑΦΕΣ","1",13,true],[2,"02.ΕΙΔΗ 6","104",6,true],[3,"03.ΤΡΟΦΙΜΑ","7",13,true],
  [4,"04.ΕΙΔΗ 13","42",13,true],[5,"05.ΕΙΔΗ 24","15",24,true],[6,"06.ΠΑΡΟΧΗ ΥΠΗΡΕΣΙΩΝ","227",24,false],
  [7,"07. ΠΕΡΙΒ. ΤΕΛΟΣ","17",24,false],[8,"08. ΕΙΣΦ.ΠΡΟΣΤ. ΠΕΡΙΒΑΛΛ","228",24,false],[9,"09. ΚΑΡΤΕΣ","45",0,true]
];
const departments=definitions.map(([cashRegisterDepartment,description,legacyVatCode,vatRate,commerce])=>({id:`department-${cashRegisterDepartment}`,cashRegisterDepartment,description,legacyVatCode,vatRate,commerce,active:true,exemptionCode:cashRegisterDepartment===9?"27":null,exemptionDescription:cashRegisterDepartment===9?"Λοιπές Εξαιρέσεις ΦΠΑ":null}));
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
  for(const [name,rows] of [["ΠΡΟΪΟΝΤΑ_IMPORT",f.rows],["ΕΛΕΓΧΟΣ",[{SKU:"DO-NOT-IMPORT"}]],["ΕΚΤΟΣ_ΕΙΣΑΓΩΓΗΣ",[{SKU:"EXCLUDED"}]],["ΤΜΗΜΑΤΑ",f.definitions],["BARCODES_IMPORT",f.barcodes]])XLSX.utils.book_append_sheet(w,XLSX.utils.json_to_sheet(rows),name);
  return "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,"+XLSX.write(w,{type:"buffer",bookType:"xlsx"}).toString("base64");
}
function harness(db){
  const routes=new Map();let access;
  const router={use:fn=>{access=fn},post:(p,fn)=>routes.set(p,fn)};
  const source=fs.readFileSync(new URL("../src/routes/inventory-archive-import.js",import.meta.url),"utf8").replace(/^import .*;$/gm,"").replace(/^export /gm,"").replace("default router;","return {router,readWorkbook,normalizeRows,classify,prepareArchiveRows};");
  const functions=new Function("Router","z","crypto","XLSX","prisma","importFullArchive","ensureProductCompanySchema","ensureVatDepartmentSchema","attachSourceWorkbook","validateSourceDepartments",source)(()=>router,z,crypto,XLSX,db,importFullArchive,async()=>{},async()=>{},attachSourceWorkbook,validateSourceDepartments);
  return {...functions,async call(path,body,user={id:"owner",role:"OWNER",companyId:"company"}){
    const req={body,user},res={statusCode:200,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};let allowed=false,error;
    access(req,res,()=>{allowed=true});if(allowed)await routes.get(path)(req,res,e=>{error=e});
    return {...res,error,statusCode:error?.status||res.statusCode};
  }};
}
function double({savedDepartments=departments,products=[],barcodeProducts=[]}={}){
  let writes=0;
  const db={store:{findFirst:async({where})=>where.id==="store"&&where.companyId==="company"?{id:"store",name:"Virtual store"}:null},
    $queryRaw:async(strings)=>{const q=strings.join("?");if(q.includes('FROM "ManagementVatDepartment"'))return savedDepartments;if(q.includes('FROM "ProductBarcode"'))return barcodeProducts;return products},
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
test("wrong register, VAT, unit or nonzero stock is invalid before import",async()=>{
  for(const [key,value] of [["Τμήμα ταμειακής",4],["ΦΠΑ",24],["Απόθεμα",1],["Μονάδα Kiosk","KG"],["Αγορά",0.64602]]){const f=fixture();f.rows[0][key]=value;const r=await harness(double().db).call("/import-preview",{storeId:"store",dataUrl:file(f)});assert.equal(r.body.summary.invalid,1,key);}
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
    const scoped={...Object.fromEntries(["$queryRaw","$executeRaw","$executeRawUnsafe","$transaction"].map(k=>[k,db[k].bind(db)])),store:{findFirst:async({where})=>(await db.$queryRaw`SELECT "id","name" FROM "Store" WHERE "id"=${where.id} AND "companyId"=${where.companyId} AND "active"=true`)[0]}};
    const h=harness(scoped),body={storeId:"store",dataUrl:file()};
    assert.equal((await h.call("/import-preview",body)).body.summary.create,2);
    const results=await Promise.all([h.call("/import",body),h.call("/import",body)]);
    assert.deepEqual(results.map(r=>r.statusCode).sort(),[201,409]);
    const success=results.find(r=>r.statusCode===201);assert.deepEqual(success.body,{ok:true,created:2,updated:0,barcodes:2,verified:true,applyStock:false});
    const imported=await db.$queryRaw`SELECT p."sku",p."costPrice",p."vatDepartmentId",sp."currentStock",sp."storeId" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" WHERE p."sku" LIKE 'VIRTUAL-IMPORT-%' ORDER BY p."sku"`;
    assert.equal(imported.length,2);assert.equal(Number(imported[0].costPrice),0.7155);assert.equal(imported[1].vatDepartmentId,"department-9");assert.ok(imported.every(p=>p.storeId==="store"&&Number(p.currentStock)===0));
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
  }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
