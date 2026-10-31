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
  const modules=modulesForCapability(capability);
  for(const moduleKey of modules){
    const override=(await db.$queryRaw`SELECT "active","startsAt","endsAt" FROM "StorePaidModule" WHERE "storeId"=${storeId} AND "moduleKey"=${moduleKey} LIMIT 1`)[0];
    if(!effectiveModuleEnabled(license.activeModules.includes(moduleKey),override?{...override,configured:true}:{configured:false}))throw staffError(403,'MODULE_DISABLED','Η λειτουργία δεν είναι ενεργή στο κατάστημα.');
  }
  if(!capability.endsWith('.read'))await assertLifecycleMutation(db,{companyId:user.companyId,storeId},lifecycleContext()[storeId]??'0');
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
  const path=String(req.originalUrl||'').split('?')[0],capability=staffRequestCapability(req.method,path,req.body||{});
  if(!capability)throw staffError();
  req.user={...user,staffAccess:true};
  res.setHeader('Cache-Control','private, no-store');
  if(capability==='SESSION')return true;
  if(capability==='LIFECYCLE'){
    const storeId=path.split('/').at(-1);
    const row=(await db.$queryRaw`SELECT "capabilities" FROM "BackofficeStaffGrant" WHERE "userId"=${user.id} AND "companyId"=${user.companyId} AND "storeId"=${storeId} AND "active"=true LIMIT 1`)[0];
    const reads=Array.isArray(row?.capabilities)?row.capabilities.filter(c=>['inventory.read','cash.read','products.read','sales.read','invoices.read'].includes(c)):[];
    let disabled;
    for(const read of reads){
      try{await requireStaffGrant(db,user,storeId,read);req.user={...req.user,storeId};return true}
      catch(error){if(error.code!=='MODULE_DISABLED')throw error;disabled=error}
    }
    throw disabled||staffError();
  }
  const storeId=req.get('x-backoffice-store-id');
  if(!storeId||req.query?.storeId&&req.query.storeId!==storeId||req.body?.storeId&&req.body.storeId!==storeId)throw staffError();
  const sales=path.match(/^\/api\/(?:transactions|cash|store-pos)\/stores\/([^/]+)(?:\/|$)/);
  if(sales&&sales[1]!==storeId)throw staffError();
  const {grant}=await requireStaffGrant(db,user,storeId,capability);
  const order=path.match(/^\/api\/(?:commerce\/)?purchase-orders\/([^/]+)(?:\/|$)/);
  if(order&&order[1]!=='report'){
    const rows=await db.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id"=${order[1]} AND "companyId"=${user.companyId} AND "storeId"=${storeId} LIMIT 1`;
    if(!rows[0])throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Δεν βρέθηκε στο επιλεγμένο κατάστημα.');
  }
  const close=path.match(/^\/api\/cash\/sessions\/([^/]+)\/close$/);
  if(close){
    const rows=await db.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "id"=${close[1]} AND "companyId"=${user.companyId} AND "storeId"=${storeId} LIMIT 1`;
    if(!rows[0])throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Δεν βρέθηκε στο επιλεγμένο κατάστημα.');
  }
  const paymentContext=path.match(/^\/api\/backoffice-staff\/payments\/stores\/([^/]+)$/);
  if(paymentContext&&paymentContext[1]!==storeId)throw staffError();
  const terminals=path.match(/^\/api\/backoffice-staff\/sales\/stores\/([^/]+)\/terminals$/);
  if(terminals&&terminals[1]!==storeId)throw staffError();
  if(capability==='invoices.approve'&&Object.keys(req.body||{}).some(key=>!['status','expectedReopenVersion'].includes(key)))throw staffError();
  if(capability.startsWith('payments.')&&(req.body?.paymentSource==='CASH_SHIFT'||req.body?.paymentMethod==='CASH_SHIFT'||req.body?.subtractFromShift===true))await requireStaffGrant(db,user,storeId,'payments.cash');
  const invoice=path.match(/^\/api\/commerce\/documents\/inbox\/([^/]+)\/file$/);
  if(invoice){
    const rows=await db.$queryRaw`SELECT "id" FROM "DocumentInbox" WHERE "id"=${invoice[1]} AND "companyId"=${user.companyId} AND "storeId"=${storeId} LIMIT 1`;
    if(!rows[0])throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Δεν βρέθηκε στο επιλεγμένο κατάστημα.');
  }
  const cash=path.match(/^\/api\/backoffice-staff\/cash\/stores\/([^/]+)$/);
  if(cash&&cash[1]!==storeId)throw staffError();
  const inventory=path.match(/^\/api\/backoffice-staff\/inventory\/stores\/([^/]+)\/stocktakes(?:\/([^/]+))?$/);
  if(inventory&&inventory[1]!==storeId)throw staffError();
  const stocktake=path.match(/^\/api\/inventory-v2\/stocktakes\/([^/]+)/);
  if(stocktake){
    const rows=await db.$queryRaw`SELECT "id" FROM "Stocktake" WHERE "id"=${stocktake[1]} AND "companyId"=${user.companyId} AND "storeId"=${storeId} LIMIT 1`;
    if(!rows[0])throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Δεν βρέθηκε στο επιλεγμένο κατάστημα.');
  }
  req.staffGrant={...grant,capability};
  req.user={...req.user,storeId,permissions:modulesForCapability(capability)};
  return true;
}
function modulesForCapability(capability){
  return capability==='cash.read'?['CASH_CONTROL','STORE_CHAT','AI_READER']:capability.startsWith('sales.')||capability.startsWith('payments.')||capability==='shifts.close'?['STORE_MODE','CASH_CONTROL']:capability==='invoices.read'?['DOCUMENTS']:capability.startsWith('invoices.')?['DOCUMENTS','INVENTORY']:['INVENTORY'];
}

// Must run inside each canonical writer transaction, before writes or replay.
// It locks the live account/session/grant until that transaction commits.
export async function requireStaffAction(db,req,storeId,capability){
  if(req.user?.staffAccess!==true)return;
  if(req.user.storeId!==storeId||req.staffGrant?.capability!==capability)throw staffError();
  if(['sales.cancel','shifts.close'].includes(capability)||capability.startsWith('payments.')&&(req.body?.paymentSource==='CASH_SHIFT'||req.body?.paymentMethod==='CASH_SHIFT')){
    if(!String(req.get('x-mws-terminal-pos')||'').trim())throw staffError(400,'STAFF_TERMINAL_REQUIRED','Επίλεξε ταμείο πριν συνεχίσεις.');
  }
  await requireStaffGrant(db,req.user,storeId,capability);
  if(capability==='payments.expense'){
    const body=req.body||{};
    if(body.type!=='OTHER_EXPENSE'||Number(body.amount)<=0||body.deferredInvoice||!body.idempotencyKey||!['DOCUMENT','NO_DOCUMENT'].includes(body.evidenceMode)||!['CASH_SHIFT','EXTERNAL'].includes(body.paymentSource)||!['CASH_SHIFT','CORPORATE_CARD','BANK_TRANSFER','EMPLOYEE_REIMBURSEMENT'].includes(body.paymentMethod)||(body.paymentSource==='CASH_SHIFT')!==(body.paymentMethod==='CASH_SHIFT'))throw staffError(400,'STAFF_PAYMENT_INVALID','Έλεγξε το είδος και τον τρόπο πληρωμής.');
    if(body.evidenceMode==='NO_DOCUMENT'&&body.responsibilityAcknowledged!==true)throw staffError(400,'STAFF_PAYMENT_DECLARATION','Επιβεβαίωσε τη δήλωση χωρίς παραστατικό.');
  }
  if(capability.startsWith('payments.')&&(req.body?.paymentSource==='CASH_SHIFT'||req.body?.paymentMethod==='CASH_SHIFT'||req.body?.subtractFromShift===true))await requireStaffGrant(db,req.user,storeId,'payments.cash');
}
export async function requireStaffOrderAction(db,req,orderId,capability){
  if(req.user?.staffAccess!==true)return;
  const rows=await db.$queryRaw`SELECT "storeId","status" FROM "PurchaseOrder" WHERE "id"=${orderId} AND "companyId"=${req.user.companyId} AND "storeId"=${req.user.storeId} FOR UPDATE`;
  if(!rows[0])throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Δεν βρέθηκε στο επιλεγμένο κατάστημα.');
  await requireStaffAction(db,req,rows[0].storeId,capability);
  if(capability==='invoices.edit'&&rows[0].status!=='NEW')throw staffError(409,'STAFF_DRAFT_CLOSED','Επιτρέπεται επεξεργασία μόνο ανοικτού πρόχειρου.');
  if(capability==='invoices.edit'&&req.body?.productId){
    const products=await db.$queryRaw`SELECT p."id" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" WHERE p."id"=${req.body.productId} AND p."companyId"=${req.user.companyId} AND sp."storeId"=${req.user.storeId} AND sp."active"=true AND p."active"=true LIMIT 1 FOR SHARE OF p,sp`;
    if(!products[0])throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Το είδος δεν είναι διαθέσιμο στο επιλεγμένο κατάστημα.');
  }
}
