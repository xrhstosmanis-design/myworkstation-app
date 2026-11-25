import {randomUUID} from "node:crypto";
import {z} from "zod";
import {companyVatManageCapability as capability,companyVatManageRoute,companyVatActivateCapability,companyVatActivateRoute} from "../../../shared/backoffice-staff-company.mjs";
import {requireStaffCompanyGrant} from "./backoffice-staff-company.js";
import {staffError} from "./backoffice-staff-access.js";

const description=z.string().trim().min(1).max(160).refine(value=>!/[\u0000-\u001f\u007f]/.test(value));
const createSchema=z.object({description}).strict();
const renameSchema=z.object({description,expectedDescription:z.string().min(1).max(160)}).strict();

export async function saveStaffCompanyVatDepartment(db,req){
  const {user,staffCompanyGrant:initial}=req;
  const route=companyVatManageRoute(req.method,String(req.originalUrl||"").split("?")[0]);
  if(!route||user?.staffAccess!==true||user.storeId||initial?.capability!==capability||initial.companyId!==user.companyId||
    req.get("x-backoffice-company-id")!==user.companyId||req.get("x-backoffice-store-id")!==undefined||Object.keys(req.query||{}).length)throw staffError();
  const companyId=user.companyId,rename=Boolean(route.id),id=route.id||randomUUID();
  const parsed=(rename?renameSchema:createSchema).safeParse(req.body);
  if(!parsed.success)throw staffError(400,"STAFF_VAT_LABEL_INVALID","Έλεγξε την περιγραφή του τμήματος ΦΠΑ.");
  const body=parsed.data;
  return db.$transaction(async tx=>{
    const live=await requireStaffCompanyGrant(tx,user,capability);
    if(live.revision!==initial.revision)throw staffError();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"staff-company-vat-label:"+companyId}))`;
    const [current]=rename?await tx.$queryRaw`SELECT "description","active" FROM "ManagementVatDepartment" WHERE "id"=${id} AND "companyId"=${companyId} FOR UPDATE`:[];
    if(rename&&!current)throw staffError(404,"STAFF_VAT_LABEL_NOT_FOUND","Δεν βρέθηκε το τμήμα ΦΠΑ στην εταιρεία.");
    const result={ok:true,companyId,id,description:body.description,active:current?.active??false};
    if(rename&&current.description===body.description)return result;
    if(rename&&current.description!==body.expectedDescription)throw staffError(409,"STAFF_VAT_LABEL_CHANGED","Η περιγραφή άλλαξε. Ανανέωσε την προβολή.");
    const [duplicate]=await tx.$queryRaw`SELECT "id" FROM "ManagementVatDepartment"
      WHERE "companyId"=${companyId} AND "id"<>${id} AND LOWER("description")=LOWER(${body.description}) LIMIT 1`;
    if(duplicate)throw staffError(409,"STAFF_VAT_LABEL_DUPLICATE","Υπάρχει ήδη τμήμα ΦΠΑ με αυτή την περιγραφή.");
    if(rename){
      await tx.$executeRaw`UPDATE "ManagementVatDepartment" SET "description"=${body.description},"updatedAt"=NOW() WHERE "id"=${id} AND "companyId"=${companyId}`;
    }else{
      // Fiscal fields require Owner configuration before this draft is activated.
      await tx.$executeRaw`INSERT INTO "ManagementVatDepartment" ("id","companyId","description","active","commerce")
        VALUES (${id},${companyId},${body.description},false,false)`;
    }
    await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
      VALUES (${randomUUID()},${companyId},${user.id},${user.id},${rename?"VAT_DEPARTMENT_LABEL_RENAMED":"VAT_DEPARTMENT_DRAFT_CREATED"},
        ${JSON.stringify({id,before:current?.description??null,after:body.description})}::jsonb)`;
    return result;
  });
}

const activateVatSchema=z.object({
  expectedDescription:z.string().min(1).max(160),
  vatRate:z.number().finite().min(0.001).max(100).refine(rate=>Math.abs(Math.round(rate*1000)-rate*1000)<0.0001),
  confirm:z.literal(true)
}).strict();

export async function activateStaffCompanyVatDraft(db,req){
  const {user,staffCompanyGrant:initial}=req,capability=companyVatActivateCapability;
  const route=companyVatActivateRoute(req.method,String(req.originalUrl||"").split("?")[0]);
  if(!route||user?.staffAccess!==true||user.storeId||initial?.capability!==capability||initial.companyId!==user.companyId||
    req.get("x-backoffice-company-id")!==user.companyId||req.get("x-backoffice-store-id")!==undefined||Object.keys(req.query||{}).length)throw staffError();
  const parsed=activateVatSchema.safeParse(req.body);
  if(!parsed.success)throw staffError(400,"STAFF_VAT_ACTIVATION_INVALID","Επιβεβαίωσε νέο τμήμα ΦΠΑ με θετικό συντελεστή.");
  const {vatRate,expectedDescription}=parsed.data,companyId=user.companyId,{id}=route;
  return db.$transaction(async tx=>{
    const live=await requireStaffCompanyGrant(tx,user,capability);
    if(live.revision!==initial.revision)throw staffError();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"staff-company-vat-label:"+companyId}))`;
    const [current]=await tx.$queryRaw`SELECT "active","description","vatRate","commerce","cashRegisterDepartment","legacyVatCode","exemptionCode","exemptionDescription"
      FROM "ManagementVatDepartment" WHERE "id"=${id} AND "companyId"=${companyId} FOR UPDATE`;
    if(!current)throw staffError(404,"STAFF_VAT_LABEL_NOT_FOUND","Δεν βρέθηκε το τμήμα ΦΠΑ στην εταιρεία.");
    if(current.description!==expectedDescription)throw staffError(409,"STAFF_VAT_LABEL_CHANGED","Η περιγραφή άλλαξε. Ανανέωσε την προβολή.");
    if(current.active||current.commerce||Number(current.vatRate)!==0||
       [current.cashRegisterDepartment,current.legacyVatCode,current.exemptionCode,current.exemptionDescription].some(value=>value!==null)){
      throw staffError(409,"STAFF_VAT_ACTIVATION_NOT_DRAFT","Η ενέργεια αφορά νέο, ανενεργό τμήμα ΦΠΑ χωρίς φορολογική αντιστοίχιση.");
    }
    const [references]=await tx.$queryRaw`SELECT EXISTS(SELECT 1 FROM "Product" p WHERE p."companyId"=${companyId} AND p."vatDepartmentId"=${id})
      OR EXISTS(SELECT 1 FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId}
        WHERE sp."vatDepartmentIdOverride"=${id}) AS "used"`;
    if(references?.used!==false)throw staffError(409,"STAFF_VAT_ACTIVATION_REFERENCED","Το τμήμα ΦΠΑ χρησιμοποιείται ήδη σε είδος.");
    await tx.$executeRaw`UPDATE "ManagementVatDepartment" SET "vatRate"=${vatRate},"active"=true,"updatedAt"=NOW()
      WHERE "id"=${id} AND "companyId"=${companyId}`;
    await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
      VALUES (${randomUUID()},${companyId},${user.id},${user.id},'VAT_DEPARTMENT_DRAFT_ACTIVATED',
        ${JSON.stringify({id,description:current.description,vatRate})}::jsonb)`;
    return {ok:true,companyId,id,description:current.description,vatRate,active:true};
  });
}
