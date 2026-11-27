import {z} from 'zod';
import {delegatableCompanyReadKeys,validCompanyReadDelegationCeiling} from '../../../shared/backoffice-staff-company-delegation.mjs';
import {staffError} from './backoffice-staff-access.js';
import {authorizeStaffAdmin,auditStaffGrantChange,revokeStaffSessions} from './backoffice-staff-accounts.js';
import {isBackofficeCompanyInstalled} from './backoffice-company-profile.js';

const ceilingEvent='COMPANY_READ_DELEGATION_CEILING_CHANGED';
const input=z.object({expectedRevision:z.number().int().min(1).max(2147483646),
  capabilities:z.array(z.enum(delegatableCompanyReadKeys)).max(delegatableCompanyReadKeys.length)
    .refine(validCompanyReadDelegationCeiling)}).strict();

async function authorizeOwner(db,user){
  if((await authorizeStaffAdmin(db,user)).role!=='OWNER')throw staffError();
  if(!await isBackofficeCompanyInstalled(db))throw staffError(503,'STAFF_COMPANY_UNAVAILABLE');
}

export async function companyReadCeilingAtRevision(db,companyId,userId,revision){
  const rows=await db.$queryRaw`SELECT "detail" FROM "BackofficeStaffAudit"
    WHERE "companyId"=${companyId} AND "targetUserId"=${userId} AND "event"=${ceilingEvent}
    ORDER BY CASE WHEN jsonb_typeof("detail"->'revision')='number'
      THEN ("detail"->>'revision')::numeric END DESC NULLS FIRST LIMIT 2`;
  if(!rows.length)return [];
  const [{detail}]=rows;
  if(!Number.isSafeInteger(detail?.revision)||detail.revision<1||detail.revision>revision||
    rows[1]?.detail?.revision===detail.revision||!validCompanyReadDelegationCeiling(detail.after))throw staffError();
  return detail.after;
}

async function accountAtRevision(tx,companyId,userId){
  const [record]=await tx.$queryRaw`SELECT a."revision" FROM "BackofficeStaffAccount" a
    JOIN "User" u ON u."id"=a."userId" AND u."companyId"=a."companyId" AND u."role"::text='EMPLOYEE'
    WHERE a."companyId"=${companyId} AND a."userId"=${userId} FOR UPDATE OF a,u`;
  if(!record)throw staffError(404,'STAFF_NOT_FOUND','Δεν βρέθηκε ο λογαριασμός.');
  return record.revision;
}

export function readCompanyDelegationCeiling(db,user,userId){
  return db.$transaction(async tx=>{
    await authorizeOwner(tx,user);
    const {companyId}=user,revision=await accountAtRevision(tx,companyId,userId);
    return {companyId,userId,revision,capabilities:await companyReadCeilingAtRevision(tx,companyId,userId,revision)};
  });
}

export function saveCompanyDelegationCeiling(db,user,userId,body){
  const {expectedRevision,capabilities}=input.parse(body);
  return db.$transaction(async tx=>{
    await authorizeOwner(tx,user);
    const {companyId}=user,current=await accountAtRevision(tx,companyId,userId);
    if(current!==expectedRevision)throw staffError(409,'STAFF_STALE','Υπάρχει νεότερη αλλαγή. Ανανέωσε τη ρύθμιση.');
    const before=await companyReadCeilingAtRevision(tx,companyId,userId,current);
    if(before.length===capabilities.length&&before.every(key=>capabilities.includes(key)))return {companyId,userId,revision:current,capabilities:before};
    const revision=current+1;
    await tx.$executeRaw`UPDATE "BackofficeStaffAccount" SET "revision"=${revision},"updatedAt"=NOW()
      WHERE "companyId"=${companyId} AND "userId"=${userId}`;
    await revokeStaffSessions(tx,userId);
    await auditStaffGrantChange(tx,user,userId,ceilingEvent,{before,after:capabilities,revision});
    return {companyId,userId,revision,capabilities};
  });
}
