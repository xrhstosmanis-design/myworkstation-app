import {randomUUID} from "node:crypto";
import {z} from "zod";
import {staffAccountStatusCapability as capability,staffAccountStatusTarget} from "../../../shared/backoffice-staff-company.mjs";
import {requireStaffCompanyGrant} from "./backoffice-staff-company.js";
import {staffError} from "./backoffice-staff-access.js";
import {revokeStaffSessions} from "./backoffice-staff-accounts.js";

const schema=z.object({active:z.boolean(),expectedRevision:z.number().int().positive().max(2147483646)}).strict();

export async function saveStaffAccountStatus(db,req){
  const id=staffAccountStatusTarget(req.method,req.originalUrl||"");
  const {user,staffCompanyGrant:admitted}=req;
  const companyId=user?.companyId;
  if(!id||!companyId||id===user.id||user.staffAccess!==true||user.storeId||
    admitted?.capability!==capability||admitted.companyId!==companyId||
    req.get("x-backoffice-company-id")!==companyId||req.get("x-backoffice-store-id")!==undefined||Object.keys(req.query||{}).length)throw staffError();
  const body=schema.safeParse(req.body);
  if(!body.success)throw staffError(400,"STAFF_STATUS_INVALID","Η κατάσταση ή η έκδοση του λογαριασμού δεν είναι έγκυρη.");
  const {active,expectedRevision}=body.data;
  return db.$transaction(async tx=>{
    // Share the rename lock before acquiring either account's row locks.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"staff-display-name:"+companyId}))`;
    const live=await requireStaffCompanyGrant(tx,user,capability);
    if(live.revision!==admitted.revision)throw staffError();
    const [target]=await tx.$queryRaw`
      SELECT a."active",a."revision" FROM "BackofficeStaffAccount" a
      JOIN "User" u ON u."id"=a."userId" AND u."companyId"=a."companyId"
      WHERE a."companyId"=${companyId} AND a."userId"=${id} AND u."role"::text='EMPLOYEE'
      FOR UPDATE OF a,u
    `;
    if(!target)throw staffError(404,"STAFF_NOT_FOUND","Δεν βρέθηκε ο χειριστής της εταιρείας.");
    if(target.revision!==expectedRevision)throw staffError(409,"STAFF_STALE","Ο λογαριασμός άλλαξε. Ανανέωσε τον κατάλογο.");
    if(target.active===active)return {ok:true,companyId,id,active,revision:expectedRevision};
    await tx.$executeRaw`
      UPDATE "BackofficeStaffAccount" SET "active"=${active},"revision"="revision"+1,"updatedAt"=NOW()
      WHERE "companyId"=${companyId} AND "userId"=${id}
    `;
    await revokeStaffSessions(tx,id);
    await tx.$executeRaw`
      INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
      VALUES (${randomUUID()},${companyId},${user.id},${id},${active?"ACCOUNT_ACTIVATED":"ACCOUNT_DEACTIVATED"},
        ${JSON.stringify({before:target.active,after:active,previousRevision:expectedRevision})}::jsonb)
    `;
    return {ok:true,companyId,id,active,revision:expectedRevision+1};
  });
}
