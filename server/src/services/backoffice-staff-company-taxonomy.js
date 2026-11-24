import {randomUUID} from "node:crypto";
import {z} from "zod";
import {companyCategoryManageCapability as capability,companyCategoryManageRoute} from "../../../shared/backoffice-staff-company.mjs";
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
