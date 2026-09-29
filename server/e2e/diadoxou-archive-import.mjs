import assert from "node:assert/strict";
import crypto from "node:crypto";
import {prisma} from "../src/prisma.js";
import {ensureCommercialSchema} from "../src/commercial-bootstrap.js";
import {ensureOwnerProductSchema} from "../src/owner-product-bootstrap.js";
import {ensureProductCompanySchema} from "../src/routes/management-product-companies.js";
import {ensureVatDepartmentSchema} from "../src/routes/management-vat-departments.js";
import {importFullArchive} from "../src/routes/inventory-archive-full-import.js";

const companyId=crypto.randomUUID(),storeId=crypto.randomUUID();
try{
  await ensureCommercialSchema();await ensureOwnerProductSchema();await ensureProductCompanySchema();await ensureVatDepartmentSchema();
  await prisma.$executeRaw`INSERT INTO "Company" ("id","name","updatedAt") VALUES (${companyId},'Archive import E2E',CURRENT_TIMESTAMP)`;
  await prisma.$executeRaw`INSERT INTO "Store" ("id","companyId","name","updatedAt") VALUES (${storeId},${companyId},'Archive import E2E',CURRENT_TIMESTAMP)`;
  const row={row:2,action:"CREATE",productId:null,sku:"TEST-ARCHIVE-1",barcode:"9999999999001",name:"ΔΟΚΙΜΗ ΕΙΔΟΥΣ",categoryName:"ΨΙΛΙΚΑ",subcategoryName:"ΔΟΚΙΜΕΣ",supplierName:"ΔΟΚΙΜΗ ΠΡΟΜΗΘΕΥΤΗ",supplierCode:"SUP-1",brandName:"ΔΟΚΙΜΗ ΕΤΑΙΡΕΙΑΣ",sourceDepartment:"ΕΙΔΗ 24",vatRate:24,salePrice:2,costPrice:1,staffPrice:1.5,minStock:5,discountA:2,discountB:3,discountC:0,active:true};
  const first=await prisma.$transaction(tx=>importFullArchive(tx,companyId,storeId,[row]),{timeout:300000});
  assert.deepEqual(first,{created:1,updated:0});
  const [saved]=await prisma.$queryRaw`SELECT p."id",p."sku",p."staffPrice",p."discountA",p."discountB",p."vatRate",p."vatDepartmentId",p."productCompanyId",p."subcategoryId",sp."currentStock",sp."minStock",sp."salePrice",s."name" AS "supplierName",l."supplierCode",b."barcode"
    FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId}
    JOIN "ProductBarcode" b ON b."productId"=p."id" JOIN "SupplierProductLink" l ON l."productId"=p."id" JOIN "Supplier" s ON s."id"=l."supplierId"
    WHERE p."companyId"=${companyId} AND p."sku"='TEST-ARCHIVE-1'`;
  assert.ok(saved);assert.equal(saved.barcode,row.barcode);assert.equal(saved.supplierCode,row.supplierCode);
  assert.equal(saved.supplierName,row.supplierName);assert.ok(saved.vatDepartmentId&&saved.productCompanyId&&saved.subcategoryId);
  assert.equal(Number(saved.staffPrice),1.5);assert.equal(Number(saved.minStock),5);assert.equal(Number(saved.currentStock),0);
  assert.equal(Number(saved.discountA),2);assert.equal(Number(saved.discountB),3);
  await prisma.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=7 WHERE "storeId"=${storeId} AND "productId"=${saved.id}`;
  const second=await prisma.$transaction(tx=>importFullArchive(tx,companyId,storeId,[{...row,action:"UPDATE",productId:saved.id,salePrice:3}]),{timeout:300000});
  assert.deepEqual(second,{created:0,updated:1});
  const [after]=await prisma.$queryRaw`SELECT "currentStock","salePrice" FROM "StoreProduct" WHERE "storeId"=${storeId} AND "productId"=${saved.id}`;
  assert.equal(Number(after.currentStock),7);assert.equal(Number(after.salePrice),3);
  console.log("Diadochou archive import isolated PostgreSQL readback PASS");
}finally{await prisma.$disconnect()}
