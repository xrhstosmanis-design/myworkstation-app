import {randomUUID} from "node:crypto";
import {z} from "zod";
import {staffDisplayNameCapability as capability,staffDisplayNameTarget} from "../../../shared/backoffice-staff-company.mjs";
import {requireStaffCompanyGrant} from "./backoffice-staff-company.js";
import {staffError} from "./backoffice-staff-access.js";

const displayName=z.string().trim().min(2).max(180).refine(value=>!/[\u0000-\u001f\u007f]/.test(value));
const input=z.object({fullName:displayName,expectedFullName:z.string().min(1).max(180)}).strict();

export async function saveStaffDisplayName(db,req){
  const targetId=staffDisplayNameTarget(req.method,req.originalUrl||"");
  const {user,staffCompanyGrant:admitted}=req;
  const companyId=user?.companyId;
  if(!targetId||!companyId||targetId===user.id||user.staffAccess!==true||user.storeId||
    admitted?.capability!==capability||admitted.companyId!==companyId||
    req.get("x-backoffice-company-id")!==companyId||req.get("x-backoffice-store-id")!==undefined||Object.keys(req.query||{}).length){
    throw staffError();
  }
  const body=input.safeParse(req.body);
  if(!body.success)throw staffError(400,"STAFF_DISPLAY_NAME_INVALID","Συμπλήρωσε ονοματεπώνυμο από 2 έως 180 χαρακτήρες.");
  const {fullName,expectedFullName}=body.data;
  return db.$transaction(async tx=>{
    // Serialize reciprocal renames before taking the live actor's row-share locks.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"staff-display-name:"+companyId}))`;
    const live=await requireStaffCompanyGrant(tx,user,capability);
    if(live.revision!==admitted.revision)throw staffError();
    const [target]=await tx.$queryRaw`
      SELECT u."fullName" FROM "BackofficeStaffAccount" a
      JOIN "User" u ON u."id"=a."userId" AND u."companyId"=a."companyId"
      WHERE a."companyId"=${companyId} AND a."userId"=${targetId} AND u."role"::text='EMPLOYEE'
      FOR UPDATE OF u
    `;
    if(!target)throw staffError(404,"STAFF_DISPLAY_NAME_NOT_FOUND","Δεν βρέθηκε ο χειριστής της εταιρείας.");
    if(target.fullName===fullName)return {ok:true,companyId,id:targetId,fullName};
    if(target.fullName!==expectedFullName){
      throw staffError(409,"STAFF_DISPLAY_NAME_CHANGED","Το ονοματεπώνυμο άλλαξε. Ανανέωσε τον κατάλογο.");
    }
    await tx.$executeRaw`
      UPDATE "User" SET "fullName"=${fullName},"updatedAt"=NOW() WHERE "id"=${targetId} AND "companyId"=${companyId}
    `;
    await tx.$executeRaw`
      INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
      VALUES (${randomUUID()},${companyId},${user.id},${targetId},'DISPLAY_NAME_CHANGED',
        ${JSON.stringify({before:target.fullName,after:fullName})}::jsonb)
    `;
    return {ok:true,companyId,id:targetId,fullName};
  });
}
