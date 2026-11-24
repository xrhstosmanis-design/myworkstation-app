import {z} from "zod";
import {staffDelegatableReadKeys,staffReadDelegationCapability,validStaffCapabilities} from "../../../shared/backoffice-staff.mjs";
import {requireStaffAction,requireStaffGrant,staffError} from "./backoffice-staff-access.js";
import {auditStaffGrantChange,revokeStaffSessions} from "./backoffice-staff-accounts.js";
import {decodeStoredStaffCapabilities,encodeStoredStaffCapabilities} from "./staff-pos-permission-ceiling.js";

const changeInput=z.object({
  key:z.enum(staffDelegatableReadKeys),
  enabled:z.boolean(),
  expectedRevision:z.number().int().positive()
}).strict();
const readOnlyCapabilities=capabilities=>staffDelegatableReadKeys.filter(key=>capabilities.includes(key));
const allowedKeys=grant=>staffDelegatableReadKeys.filter(key=>
  grant.capabilities.includes(key)&&grant.backofficeReadDelegationCeiling.includes(key));

async function authorize(db,req,storeId){
  if(req.user?.staffAccess!==true||req.user.storeId!==storeId)throw staffError();
  return requireStaffAction(db,req,storeId,staffReadDelegationCapability);
}

export async function listDelegatedStaffReads(db,req,storeId){
  const {id,companyId}=req.user;
  return db.$transaction(async tx=>{
    const editableKeys=allowedKeys(await authorize(tx,req,storeId));
    if(!editableKeys.length)return {storeId,editableKeys,items:[]};
    const rows=await tx.$queryRaw`
      SELECT g."userId",g."revision",g."capabilities",u."fullName"
      FROM "BackofficeStaffGrant" g
      JOIN "BackofficeStaffAccount" a ON a."userId"=g."userId" AND a."companyId"=g."companyId"
      JOIN "User" u ON u."id"=a."userId" AND u."companyId"=a."companyId"
      WHERE g."companyId"=${companyId} AND g."storeId"=${storeId} AND g."userId"<>${id}
        AND g."active"=true AND a."active"=true AND u."role"::text='EMPLOYEE'
      ORDER BY u."fullName",g."userId" LIMIT 501`;
    if(rows.length>500)throw staffError(503,"STAFF_LIMIT");
    const items=rows.flatMap(({userId,revision,capabilities,fullName})=>{
      const decoded=decodeStoredStaffCapabilities(capabilities);
      return validStaffCapabilities(decoded.capabilities)?[{userId,revision,fullName,capabilities:readOnlyCapabilities(decoded.capabilities)}]:[];
    });
    return {storeId,editableKeys,items};
  });
}

export async function changeDelegatedStaffRead(db,req,storeId,targetUserId){
  if(req.user?.staffAccess!==true||req.user.storeId!==storeId||req.user.id===targetUserId)throw staffError();
  const {key,enabled,expectedRevision}=changeInput.parse(req.body);
  const actor=req.user,{companyId}=actor;
  return db.$transaction(async tx=>{
    // Two delegates may target each other, including across stores. Serialize
    // these writer transactions before taking either account's row locks.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"staff-read-delegation:"+companyId},0))`;
    const grant=await authorize(tx,req,storeId);
    if(!allowedKeys(grant).includes(key))throw staffError(403,"STAFF_READ_DELEGATION_CEILING","Η συγκεκριμένη προβολή δεν έχει εκχωρηθεί για ανάθεση στο κατάστημα.");
    await requireStaffGrant(tx,actor,storeId,key);
    const [account]=await tx.$queryRaw`SELECT a."revision" FROM "BackofficeStaffAccount" a
      WHERE a."userId"=${targetUserId} AND a."companyId"=${companyId} AND a."active"=true FOR UPDATE`;
    const [target]=account?await tx.$queryRaw`
      SELECT g."revision",g."capabilities" FROM "BackofficeStaffGrant" g
      JOIN "User" u ON u."id"=g."userId" AND u."companyId"=g."companyId"
      WHERE g."userId"=${targetUserId} AND g."companyId"=${companyId} AND g."storeId"=${storeId}
        AND g."active"=true AND u."role"::text='EMPLOYEE' FOR UPDATE OF g,u`:[];
    if(!target)throw staffError(404,"STAFF_OBJECT_NOT_FOUND","Δεν βρέθηκε ενεργός υπάλληλος στο επιλεγμένο κατάστημα.");
    if(target.revision!==expectedRevision)throw staffError(409,"STAFF_STALE","Η εκχώρηση άλλαξε. Ανανέωσε τη λίστα.");
    const current=decodeStoredStaffCapabilities(target.capabilities);
    if(!validStaffCapabilities(current.capabilities))throw staffError(409,"STAFF_POLICY_DATA_INVALID","Η εκχώρηση χρειάζεται έλεγχο από τον Ιδιοκτήτη.");
    const before=current.capabilities.includes(key);
    if(before===enabled)return {storeId,userId:targetUserId,revision:target.revision,capabilities:readOnlyCapabilities(current.capabilities)};
    const next=enabled?[...current.capabilities,key]:current.capabilities.filter(item=>item!==key);
    if(!validStaffCapabilities(next))throw staffError(409,"STAFF_READ_DELEGATION_DEPENDENCY","Η προβολή απαιτείται από άλλο ενεργό δικαίωμα. Ζήτησε αλλαγή από τον Ιδιοκτήτη.");
    const stored=encodeStoredStaffCapabilities(next,current.posPermissionCeiling,current.backofficeReadDelegationCeiling);
    const revision=target.revision+1;
    await tx.$executeRaw`
      UPDATE "BackofficeStaffGrant" SET "capabilities"=${JSON.stringify(stored)}::jsonb,"revision"="revision"+1,"updatedAt"=NOW()
      WHERE "userId"=${targetUserId} AND "companyId"=${companyId} AND "storeId"=${storeId} AND "active"=true`;
    await tx.$executeRaw`UPDATE "BackofficeStaffAccount" SET "revision"="revision"+1,"updatedAt"=NOW()
      WHERE "userId"=${targetUserId} AND "companyId"=${companyId}`;
    await revokeStaffSessions(tx,targetUserId);
    await auditStaffGrantChange(tx,actor,targetUserId,"BACKOFFICE_READ_DELEGATED",{storeId,key,before,enabled,revision});
    return {storeId,userId:targetUserId,revision,capabilities:readOnlyCapabilities(next)};
  });
}
