import {z} from 'zod';
import {isCompanyDelegatedReadsRequest,validStaffCompanyCapabilities} from '../../../shared/backoffice-staff-company.mjs';
import {companyCapabilitiesAfterDelegation,companyReadDelegationOptions,delegatableCompanyReadKeys} from '../../../shared/backoffice-staff-company-delegation.mjs';
import {staffError} from './backoffice-staff-access.js';
import {requireStaffCompanyGrant,readStaffCompanyPolicy} from './backoffice-staff-company.js';
import {companyReadCeilingAtRevision} from './backoffice-staff-company-delegation-ceiling.js';
import {auditStaffGrantChange,revokeStaffSessions} from './backoffice-staff-accounts.js';

const policy='staff-policy.read';
const input=z.object({userId:z.string().min(1).max(200),key:z.enum(delegatableCompanyReadKeys),
  enabled:z.boolean(),expectedRevision:z.number().int().positive().max(2147483646)}).strict();

async function authorize(db,req){
  const {user,staffCompanyGrant:initial}=req;
  if(!isCompanyDelegatedReadsRequest(req.method,req.originalUrl)||user?.staffAccess!==true||user.storeId||
    initial?.capability!==policy||initial.companyId!==user.companyId||
    req.get('x-backoffice-company-id')!==user.companyId||req.get('x-backoffice-store-id')!==undefined)throw staffError();
  const live=await requireStaffCompanyGrant(db,user,policy);
  if(live.revision!==initial.revision)throw staffError();
  const capabilities=await readStaffCompanyPolicy(db,user.id,user.companyId);
  const ceiling=await companyReadCeilingAtRevision(db,user.companyId,user.id,live.revision);
  return companyReadDelegationOptions(capabilities,ceiling);
}

export function listCompanyDelegatedReads(db,req){
  return db.$transaction(async tx=>{
    const editableKeys=await authorize(tx,req),{companyId,id}=req.user;
    if(!editableKeys.length)return {companyId,editableKeys,items:[]};
    const rows=await tx.$queryRaw`SELECT a."userId",a."revision",a."companyCapabilities",u."fullName"
      FROM "BackofficeStaffAccount" a JOIN "User" u ON u."id"=a."userId" AND u."companyId"=a."companyId"
      WHERE a."companyId"=${companyId} AND a."active"=true AND a."userId"<>${id} AND u."role"::text='EMPLOYEE'
      ORDER BY u."fullName",a."userId" LIMIT 501`;
    if(rows.length>500)throw staffError(503,'STAFF_LIMIT');
    return {companyId,editableKeys,items:rows.filter(row=>validStaffCompanyCapabilities(row.companyCapabilities))
      .map(({userId,revision,fullName,companyCapabilities})=>({userId,revision,fullName,capabilities:editableKeys.filter(key=>companyCapabilities.includes(key))}))};
  });
}

export function changeCompanyDelegatedRead(db,req){
  const {userId,key,enabled,expectedRevision}=input.parse(req.body);
  const {user}=req;
  if(user?.staffAccess!==true||!user.companyId||user.id===userId)throw staffError();
  const {companyId}=user;
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'staff-read-delegation:'+companyId},0))`;
    const editableKeys=await authorize(tx,req);
    if(!editableKeys.includes(key))throw staffError(403,'STAFF_COMPANY_DELEGATION_CEILING','Η προβολή είναι εκτός του ορίου επανεκχώρησης.');
    if(enabled)await requireStaffCompanyGrant(tx,user,key);
    const [target]=await tx.$queryRaw`SELECT a."revision",a."companyCapabilities"
      FROM "BackofficeStaffAccount" a JOIN "User" u ON u."id"=a."userId" AND u."companyId"=a."companyId"
      WHERE a."companyId"=${companyId} AND a."userId"=${userId} AND a."active"=true AND u."role"::text='EMPLOYEE' FOR UPDATE OF a,u`;
    if(!target)throw staffError(404,'STAFF_NOT_FOUND','Δεν βρέθηκε ενεργός λογαριασμός.');
    if(target.revision!==expectedRevision)throw staffError(409,'STAFF_STALE','Υπάρχει νεότερη αλλαγή. Ανανέωσε τη λίστα.');
    const next=companyCapabilitiesAfterDelegation(target.companyCapabilities,key,enabled);
    if(!next)throw staffError(409,'STAFF_COMPANY_DELEGATION_DEPENDENCY','Η αλλαγή απαιτεί άλλη εταιρική προβολή. Έλεγξε τα δικαιώματα του χειριστή.');
    const before=target.companyCapabilities.includes(key);
    const revision=before===enabled?expectedRevision:expectedRevision+1;
    if(before!==enabled){
      await tx.$executeRaw`UPDATE "BackofficeStaffAccount" SET "companyCapabilities"=${JSON.stringify(next)}::jsonb,
        "revision"=${revision},"updatedAt"=NOW() WHERE "companyId"=${companyId} AND "userId"=${userId}`;
      await revokeStaffSessions(tx,userId);
      await auditStaffGrantChange(tx,user,userId,'COMPANY_READ_DELEGATED',{key,before,enabled,revision});
    }
    return {companyId,userId,revision,capabilities:editableKeys.filter(item=>next.includes(item))};
  });
}
