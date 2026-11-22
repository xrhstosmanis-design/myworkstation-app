import {randomUUID} from 'node:crypto';
import {z} from 'zod';

const addressSchema=z.object({
 label:z.string().max(80).optional().nullable(),
 address:z.string().min(1).max(250),
 city:z.string().max(120).optional().nullable(),
 postalCode:z.string().max(20).optional().nullable(),
 phone:z.string().max(40).optional().nullable(),
 isPrimary:z.boolean().optional()
});
const unitSchema=z.object({
 name:z.string().min(1).max(120),
 code:z.string().max(60).optional().nullable(),
 email:z.string().email().optional().nullable(),
 phone:z.string().max(40).optional().nullable()
});

export function parseSupplierRelatedRecord(resource,input,{strict=false}={}){
 const schema=resource==='addresses'?addressSchema:unitSchema;
 return (strict?schema.strict():schema).parse(input??{});
}

export async function lockSupplierRelatedRecords(tx,companyId,supplierId,{activeOnly=false}={}){
 const [supplier]=await tx.$queryRaw`SELECT "id" FROM "Supplier" WHERE "id"=${supplierId} AND "companyId"=${companyId} AND (NOT ${activeOnly} OR "active"=true) FOR UPDATE`;
 if(!supplier)throw Object.assign(new Error("Δεν βρέθηκε ο προμηθευτής."),{status:404,code:'STAFF_OBJECT_NOT_FOUND'});
}

export async function createSupplierRelatedRecord(tx,{companyId,supplierId,resource},body){
 const id=randomUUID();
 if(resource==='addresses'){
  if(body.isPrimary)await tx.$executeRaw`UPDATE "SupplierAddress" SET "isPrimary"=false,"updatedAt"=NOW() WHERE "companyId"=${companyId} AND "supplierId"=${supplierId} AND "isPrimary"=true`;
  await tx.$executeRaw`INSERT INTO "SupplierAddress" ("id","companyId","supplierId","label","address","city","postalCode","phone","isPrimary") VALUES (${id},${companyId},${supplierId},${body.label||null},${body.address},${body.city||null},${body.postalCode||null},${body.phone||null},${body.isPrimary||false})`;
 }else{
  await tx.$executeRaw`INSERT INTO "SupplierBusinessUnit" ("id","companyId","supplierId","name","code","email","phone") VALUES (${id},${companyId},${supplierId},${body.name},${body.code||null},${body.email||null},${body.phone||null})`;
 }
 return id;
}

export async function removeSupplierRelatedRecord(tx,{companyId,supplierId,resource,itemId}){
 if(resource==='addresses')return tx.$executeRaw`DELETE FROM "SupplierAddress" WHERE "id"=${itemId} AND "supplierId"=${supplierId} AND "companyId"=${companyId}`;
 return tx.$executeRaw`DELETE FROM "SupplierBusinessUnit" WHERE "id"=${itemId} AND "supplierId"=${supplierId} AND "companyId"=${companyId}`;
}
