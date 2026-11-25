import {randomUUID} from "node:crypto";
import {z} from "zod";
import {companyCategoryManageCapability as capability,companyCategoryManageRoute,companyCategoryReactivateCapability,companyCategoryReactivateRoute} from "../../../shared/backoffice-staff-company.mjs";
import {requireStaffCompanyGrant} from "./backoffice-staff-company.js";
import {staffError} from "./backoffice-staff-access.js";

const nameField=max=>z.string().trim().min(1).max(max).refine(name=>!/[\u0000-\u001f\u007f]/.test(name));
const idField=z.string().min(1).max(160);
const duplicate=()=>staffError(409,"STAFF_TAXONOMY_DUPLICATE","Υπάρχει ήδη καταχώριση με αυτή την περιγραφή.");
const missing=()=>staffError(404,"STAFF_TAXONOMY_NOT_FOUND","Δεν βρέθηκε η κατηγορία ή υποκατηγορία της εταιρείας.");

export async function saveStaffCompanyCategory(db,req){
  const {user,staffCompanyGrant:initial}=req;
  const path=String(req.originalUrl||"").split("?")[0];
  const route=companyCategoryManageRoute(req.method,path);
  if(!route||user?.staffAccess!==true||user.storeId||initial?.capability!==capability||initial.companyId!==user.companyId||
    req.get("x-backoffice-company-id")!==user.companyId||req.get("x-backoffice-store-id")!==undefined||Object.keys(req.query||{}).length)throw staffError();
  const subcategory=route.kind==="subcategories",rename=Boolean(route.id),companyId=user.companyId;
  const name=nameField(subcategory?180:160);
  const schema=z.object({name,...(rename?{expectedName:name}:subcategory?{categoryId:idField}:{})}).strict();
  const parsed=schema.safeParse(req.body);
  if(!parsed.success)throw staffError(400,"STAFF_TAXONOMY_INVALID","Έλεγξε την περιγραφή και την επιλεγμένη κατηγορία.");
  const body=parsed.data,id=route.id||randomUUID();
  try{
    return await db.$transaction(async tx=>{
      const live=await requireStaffCompanyGrant(tx,user,capability);
      if(live.revision!==initial.revision)throw staffError();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"staff-company-taxonomy:"+companyId}))`;
      const [current]=rename?(subcategory?
        await tx.$queryRaw`SELECT "name","categoryId" FROM "ProductSubcategory" WHERE "id"=${id} AND "companyId"=${companyId} FOR UPDATE`:
        await tx.$queryRaw`SELECT "name" FROM "ProductCategory" WHERE "id"=${id} AND "companyId"=${companyId} FOR UPDATE`):[];
      if(rename&&!current)throw missing();
      const categoryId=subcategory?(current?.categoryId||body.categoryId):null;
      if(rename&&current.name===body.name)return {ok:true,companyId,id,categoryId,name:body.name};
      if(rename&&current.name!==body.expectedName)throw staffError(409,"STAFF_TAXONOMY_CHANGED","Η περιγραφή άλλαξε. Ανανέωσε την προβολή.");
      if(subcategory&&!rename){
        const [parent]=await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "id"=${categoryId} AND "companyId"=${companyId} AND "active"=true FOR SHARE`;
        if(!parent)throw missing();
      }
      const [existing]=subcategory?
        await tx.$queryRaw`SELECT "id" FROM "ProductSubcategory" WHERE "companyId"=${companyId} AND "categoryId"=${categoryId} AND "id"<>${id} AND LOWER("name")=LOWER(${body.name}) LIMIT 1`:
        await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${companyId} AND "id"<>${id} AND LOWER("name")=LOWER(${body.name}) LIMIT 1`;
      if(existing)throw duplicate();
      if(subcategory){
        if(rename)await tx.$executeRaw`UPDATE "ProductSubcategory" SET "name"=${body.name},"updatedAt"=NOW() WHERE "id"=${id} AND "companyId"=${companyId}`;
        else await tx.$executeRaw`INSERT INTO "ProductSubcategory" ("id","companyId","categoryId","name","active") VALUES (${id},${companyId},${categoryId},${body.name},true)`;
      }else if(rename){
        await tx.$executeRaw`UPDATE "ProductCategory" SET "name"=${body.name},"updatedAt"=NOW() WHERE "id"=${id} AND "companyId"=${companyId}`;
      }else{
        await tx.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name","active") VALUES (${id},${companyId},${body.name},true)`;
      }
      const detail=JSON.stringify({kind:route.kind,id,categoryId,before:current?.name??null,after:body.name});
      await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
        VALUES (${randomUUID()},${companyId},${user.id},${user.id},${rename?"PRODUCT_TAXONOMY_RENAMED":"PRODUCT_TAXONOMY_CREATED"},${detail}::jsonb)`;
      return {ok:true,companyId,id,categoryId,name:body.name};
    });
  }catch(error){
    if(error?.code==="P2002"||error?.meta?.code==="23505")throw duplicate();
    throw error;
  }
}

const reactivationSchema=z.object({expectedName:z.string().min(1).max(180),confirm:z.literal(true)}).strict();
export async function reactivateStaffCompanyCategory(db,req){
  const {user,staffCompanyGrant:initial}=req,capability=companyCategoryReactivateCapability;
  const route=companyCategoryReactivateRoute(req.method,String(req.originalUrl||"").split("?")[0]);
  if(!route||user?.staffAccess!==true||user.storeId||initial?.capability!==capability||initial.companyId!==user.companyId||
    req.get("x-backoffice-company-id")!==user.companyId||req.get("x-backoffice-store-id")!==undefined||Object.keys(req.query||{}).length)throw staffError();
  const parsed=reactivationSchema.safeParse(req.body);
  if(!parsed.success)throw staffError(400,"STAFF_TAXONOMY_CONFIRMATION_REQUIRED","Επιβεβαίωσε την επανενεργοποίηση.");
  const {id,kind}=route,companyId=user.companyId,subcategory=kind==="subcategories";
  return db.$transaction(async tx=>{
    const live=await requireStaffCompanyGrant(tx,user,capability);
    if(live.revision!==initial.revision)throw staffError();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"staff-company-taxonomy:"+companyId}))`;
    const [current]=subcategory?
      await tx.$queryRaw`SELECT sc."name",sc."active",sc."categoryId",par."active" AS "parentActive" FROM "ProductSubcategory" sc
        JOIN "ProductCategory" par ON par."id"=sc."categoryId" AND par."companyId"=sc."companyId"
        WHERE sc."id"=${id} AND sc."companyId"=${companyId} FOR UPDATE OF sc FOR SHARE OF par`:
      await tx.$queryRaw`SELECT "name","active" FROM "ProductCategory" WHERE "id"=${id} AND "companyId"=${companyId} FOR UPDATE`;
    if(!current)throw missing();
    if(current.name!==parsed.data.expectedName)throw staffError(409,"STAFF_TAXONOMY_CHANGED","Η περιγραφή άλλαξε. Ανανέωσε την προβολή.");
    if(current.active)throw staffError(409,"STAFF_TAXONOMY_ALREADY_ACTIVE","Η καταχώριση είναι ήδη ενεργή.");
    if(subcategory&&!current.parentActive)throw staffError(409,"STAFF_TAXONOMY_PARENT_INACTIVE","Ενεργοποίησε πρώτα τη γονική κατηγορία.");
    const [existing]=subcategory?
      await tx.$queryRaw`SELECT "id" FROM "ProductSubcategory" WHERE "companyId"=${companyId} AND "categoryId"=${current.categoryId}
        AND "id"<>${id} AND "active"=true AND LOWER("name")=LOWER(${current.name}) LIMIT 1`:
      await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${companyId}
        AND "id"<>${id} AND "active"=true AND LOWER("name")=LOWER(${current.name}) LIMIT 1`;
    if(existing)throw duplicate();
    const [references]=await tx.$queryRaw`
      WITH subcategories AS (
        SELECT "id" FROM "ProductSubcategory" WHERE "companyId"=${companyId}
          AND ((${subcategory} AND "id"=${id}) OR (NOT ${subcategory} AND "categoryId"=${id}))
      )
      SELECT EXISTS(SELECT 1 FROM "Product" WHERE "companyId"=${companyId}
        AND ((NOT ${subcategory} AND "categoryId"=${id}) OR "subcategoryId" IN (SELECT "id" FROM subcategories)))
      OR EXISTS(SELECT 1 FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId}
        WHERE (NOT ${subcategory} AND sp."categoryIdOverride"=${id}) OR sp."subcategoryIdOverride" IN (SELECT "id" FROM subcategories)) AS "used"`;
    if(references?.used!==false)throw staffError(409,"STAFF_TAXONOMY_REFERENCED","Η καταχώριση χρησιμοποιείται ήδη σε είδος.");
    if(subcategory){
      await tx.$executeRaw`UPDATE "ProductSubcategory" SET "active"=true,"updatedAt"=NOW() WHERE "id"=${id} AND "companyId"=${companyId}`;
    }else{
      await tx.$executeRaw`UPDATE "ProductCategory" SET "active"=true,"updatedAt"=NOW() WHERE "id"=${id} AND "companyId"=${companyId}`;
    }
    await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
      VALUES (${randomUUID()},${companyId},${user.id},${user.id},'PRODUCT_TAXONOMY_REACTIVATED',
        ${JSON.stringify({kind,id,categoryId:current.categoryId??null,name:current.name})}::jsonb)`;
    return {ok:true,companyId,id,kind,active:true};
  });
}
