import {staffCapabilities,staffProfiles,staffRequestCapability,validStaffCapabilities} from '../../../shared/backoffice-staff.mjs';
import {companyModuleState,effectiveModuleEnabled} from '../middleware/module-access.js';
import {assertLifecycleMutation} from './store-lifecycle-generation.js';
import {lifecycleContext} from './store-lifecycle-context.js';
export const staffError=(status=403,code='STAFF_ACCESS_DENIED',message='Δεν υπάρχει δικαίωμα για αυτή την ενέργεια.')=>Object.assign(new Error(message),{status,code});
export async function staffAccount(db,user){
  if(!user?.id)return null;
  // Older, independently hosted test runtimes legitimately have no delegated
  // schema. Existing accounts retain their issuer; reserved staff identities
  // are still refused by issueSession when no active membership exists.
  const metadata=await db.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'BackofficeStaffAccount'))::text AS "relation"`;
  if(!metadata[0]?.relation)return null;
  return (await db.$queryRaw`SELECT "userId","companyId","username","active","revision" FROM "BackofficeStaffAccount" WHERE "userId"=${user.id} LIMIT 1`)[0]||null;
}
export async function liveStaff(db,user){
  if(user?.tokenType!=='BACKOFFICE_USER'||!user.sessionId||user.supportContext||user.isSuperAdmin||user.role!=='EMPLOYEE')throw staffError(401,'STAFF_SESSION_INVALID','Η προσωπική σύνδεση δεν είναι πλέον ενεργή.');
  const rows=await db.$queryRaw`SELECT a."userId",a."companyId",a."username",a."active",a."revision",u."fullName",u."email",u."mustChangePassword" FROM "BackofficeStaffAccount" a JOIN "User" u ON u."id"=a."userId" AND u."companyId"=a."companyId" JOIN "UserSession" s ON s."userId"=u."id" JOIN "Company" c ON c."id"=u."companyId" WHERE a."userId"=${user.id} AND a."companyId"=${user.companyId} AND a."active"=true AND u."role"::text='EMPLOYEE' AND u."sessionVersion"=${user.sessionVersion} AND s."id"=${user.sessionId} AND s."revokedAt" IS NULL AND s."expiresAt">clock_timestamp() AND c."active"=true LIMIT 1 FOR SHARE OF a,u,s,c`;
  if(!rows[0])throw staffError(401,'STAFF_SESSION_INVALID','Η προσωπική σύνδεση δεν είναι πλέον ενεργή.');
  return rows[0];
}
export async function requireStaffGrant(db,user,storeId,capability){
  const account=await liveStaff(db,user);
  if(account.mustChangePassword)throw staffError();
  if(typeof storeId!=='string'||!storeId||storeId.length>200||!staffCapabilities.includes(capability))throw staffError();
  const rows=await db.$queryRaw`SELECT g."profile",g."capabilities",g."revision" FROM "BackofficeStaffGrant" g JOIN "Store" s ON s."id"=g."storeId" AND s."companyId"=g."companyId" WHERE g."userId"=${user.id} AND g."companyId"=${user.companyId} AND g."storeId"=${storeId} AND g."active"=true AND s."active"=true LIMIT 1 FOR SHARE OF g,s`;
  const grant=rows[0];
  if(!grant||!staffProfiles[grant.profile]||!validStaffCapabilities(grant.capabilities)||!grant.capabilities.includes(capability))throw staffError();
  const license=await companyModuleState(user.companyId,{db});
  if(!license?.licenseAllowed)throw staffError(403,'LICENSE_INACTIVE','Η άδεια της εταιρείας δεν είναι ενεργή.');
  const modules=capability==='cash.read'?['CASH_CONTROL','STORE_CHAT','AI_READER']:['INVENTORY'];
  for(const moduleKey of modules){
    const override=(await db.$queryRaw`SELECT "active","startsAt","endsAt" FROM "StorePaidModule" WHERE "storeId"=${storeId} AND "moduleKey"=${moduleKey} LIMIT 1`)[0];
    if(!effectiveModuleEnabled(license.activeModules.includes(moduleKey),override?{...override,configured:true}:{configured:false}))throw staffError(403,'MODULE_DISABLED','Η λειτουργία δεν είναι ενεργή στο κατάστημα.');
  }
  if(['inventory.count','products.create','products.opening-stock'].includes(capability))await assertLifecycleMutation(db,{companyId:user.companyId,storeId},lifecycleContext()[storeId]??'0');
  return {account,grant};
}
// Invoked inside the existing authentication middleware, before any legacy route.
// Deny by default even if a caller bypasses the dedicated workspace UI.
export async function enforceBackofficeStaff(db,req,res){
  const user=req.user;
  // This flag is emitted only by the shared server session issuer for newly
  // provisioned staff Users. No pre-existing User is converted into staff.
  if(user?.tokenType!=='BACKOFFICE_USER'||user.staffAccess!==true)return true;
  await liveStaff(db,user);
  const path=String(req.originalUrl||'').split('?')[0],capability=staffRequestCapability(req.method,path);
  if(!capability)throw staffError();
  req.user={...user,staffAccess:true};
  res.setHeader('Cache-Control','private, no-store');
  if(capability==='SESSION')return true;
  if(capability==='LIFECYCLE'){
    const storeId=path.split('/').at(-1);
    const row=(await db.$queryRaw`SELECT "capabilities" FROM "BackofficeStaffGrant" WHERE "userId"=${user.id} AND "companyId"=${user.companyId} AND "storeId"=${storeId} AND "active"=true LIMIT 1`)[0];
    const read=row?.capabilities?.find(c=>['inventory.read','cash.read','products.read'].includes(c));
    await requireStaffGrant(db,user,storeId,read);
    req.user={...req.user,storeId};return true;
  }
  const storeId=req.get('x-backoffice-store-id');
  if(!storeId||req.query?.storeId&&req.query.storeId!==storeId||req.body?.storeId&&req.body.storeId!==storeId)throw staffError();
  const cash=path.match(/^\/api\/backoffice-staff\/cash\/stores\/([^/]+)$/);
  if(cash&&cash[1]!==storeId)throw staffError();
  const inventory=path.match(/^\/api\/backoffice-staff\/inventory\/stores\/([^/]+)\/stocktakes(?:\/([^/]+))?$/);
  if(inventory&&inventory[1]!==storeId)throw staffError();
  const stocktake=path.match(/^\/api\/inventory-v2\/stocktakes\/([^/]+)/);
  if(stocktake){
    const rows=await db.$queryRaw`SELECT "id" FROM "Stocktake" WHERE "id"=${stocktake[1]} AND "companyId"=${user.companyId} AND "storeId"=${storeId} LIMIT 1`;
    if(!rows[0])throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Δεν βρέθηκε στο επιλεγμένο κατάστημα.');
  }
  const {grant}=await requireStaffGrant(db,user,storeId,capability);
  req.staffGrant={...grant,capability};
  req.user={...req.user,storeId,permissions:capability==='cash.read'?['CASH_CONTROL','STORE_CHAT','AI_READER']:['INVENTORY']};
  return true;
}
