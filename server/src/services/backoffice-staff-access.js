import {finalPassiveStoreActions,finalPassiveStoreRequest} from '../../../shared/backoffice-staff-final-passive.mjs';
import {storeReportCapabilities,freeStoreReportCapabilities} from '../../../shared/backoffice-staff-reports.mjs';
import {expectedReceiptAction,expectedReceiptFields} from '../../../shared/supplier-expected-receipts.mjs';
import {staffCapabilities,staffProfiles,staffRequestCapability,validStaffCapabilities} from '../../../shared/backoffice-staff.mjs';
import {companyModuleState,effectiveModuleEnabled} from '../middleware/module-access.js';
import {assertLifecycleMutation} from './store-lifecycle-generation.js';
import {PERSONNEL_BASIC,PERSONNEL_PRO,PERSONNEL_PAYROLL,resolvePersonnelPackageStates} from '../personnel-packages.js';
import {lifecycleContext} from './store-lifecycle-context.js';
import {enforceStaffCompanyRequest} from './backoffice-staff-company.js';
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
export async function requireStaffGrant(db,user,storeId,capability,{additionalModules=[]}={}){
  const account=await liveStaff(db,user);
  if(account.mustChangePassword)throw staffError();
  if(typeof storeId!=='string'||!storeId||storeId.length>200||!staffCapabilities.includes(capability))throw staffError();
  const rows=await db.$queryRaw`SELECT g."profile",g."capabilities",g."revision" FROM "BackofficeStaffGrant" g JOIN "Store" s ON s."id"=g."storeId" AND s."companyId"=g."companyId" WHERE g."userId"=${user.id} AND g."companyId"=${user.companyId} AND g."storeId"=${storeId} AND g."active"=true AND s."active"=true LIMIT 1 FOR SHARE OF g,s`;
  const grant=rows[0];
  if(!grant||!staffProfiles[grant.profile]||!validStaffCapabilities(grant.capabilities)||!grant.capabilities.includes(capability))throw staffError();
  const license=await companyModuleState(user.companyId,{db});
  if(!license?.licenseAllowed)throw staffError(403,'LICENSE_INACTIVE','Η άδεια της εταιρείας δεν είναι ενεργή.');
  if(storeReportCapabilities.includes(capability)&&!freeStoreReportCapabilities.includes(capability)&&!license.activeModules?.includes('INVENTORY'))throw staffError(403,'MODULE_DISABLED','Η εταιρική λειτουργία αναφορών αποθήκης δεν είναι ενεργή.');
  if(['workforce-evaluations.read','workforce-performance.read','schedule-validation.read'].includes(capability)){const paid=await db.$queryRaw`SELECT "companyId","storeId","moduleKey","active","startsAt","endsAt" FROM "StorePaidModule" WHERE "companyId"=${user.companyId} AND "storeId"=${storeId} LIMIT 257`;if(paid.length>256||paid.some(row=>row.companyId!==user.companyId||row.storeId!==storeId)||!resolvePersonnelPackageStates(paid).states[PERSONNEL_BASIC].effectiveActive)throw staffError(403,'MODULE_DISABLED')}
  if(capability==='pending-sources.read'&&!license.activeModules?.includes('PENDING_CENTER'))throw staffError(403,'MODULE_DISABLED');
  if(['employees.read','employees.edit','schedule.read','schedule.create','schedule.edit','schedule.preview','schedule.approve','schedule.publish','schedule.approve-exception','attendance.read','attendance.clock','attendance.correct','attendance.approve-review','attendance.approve-overtime','leaves.read','leaves.create','leaves.approve','leaves.reject','leaves.cancel','payroll.read','workforce-roles.read','workforce-rules.read','workforce-rules.manage','shift-templates.read','shift-templates.manage','workforce-audit.read'].includes(capability)){
    const rows=await db.$queryRaw`SELECT "moduleKey","active","startsAt","endsAt" FROM "StorePaidModule" WHERE "storeId"=${storeId}`;
    const states=resolvePersonnelPackageStates(rows).states;
    if(!states[['attendance.read','attendance.clock','attendance.correct','attendance.approve-review','attendance.approve-overtime','workforce-rules.read','workforce-rules.manage'].includes(capability)?PERSONNEL_PRO:PERSONNEL_BASIC].effectiveActive||(capability==='payroll.read'&&!states[PERSONNEL_PAYROLL].effectiveActive))throw staffError(403,'MODULE_DISABLED','Το πακέτο προσωπικού δεν είναι ενεργό στο κατάστημα.');
  }
  if(capability==='store-reports-payroll-expenses.read'){
    const paid=await db.$queryRaw`SELECT "companyId","storeId","moduleKey","active","startsAt","endsAt" FROM "StorePaidModule" WHERE "storeId"=${storeId}`;
    if(!Array.isArray(paid)||paid.length>256||paid.some(row=>row.companyId!==user.companyId||row.storeId!==storeId))throw staffError(403,'MODULE_DISABLED');
    const states=resolvePersonnelPackageStates(paid).states;
    if(!states[PERSONNEL_BASIC].effectiveActive||!states[PERSONNEL_PAYROLL].effectiveActive)throw staffError(403,'MODULE_DISABLED');
  }
  const modules=[...new Set([...modulesForCapability(capability),...additionalModules])];
  for(const moduleKey of modules){
    const override=(await ((storeReportCapabilities.includes(capability)||finalPassiveStoreActions.some(action=>action.key===capability))?db.$queryRaw`SELECT "active","startsAt","endsAt" FROM "StorePaidModule" WHERE "storeId"=${storeId} AND "companyId"=${user.companyId} AND "moduleKey"=${moduleKey} LIMIT 1`:db.$queryRaw`SELECT "active","startsAt","endsAt" FROM "StorePaidModule" WHERE "storeId"=${storeId} AND "moduleKey"=${moduleKey} LIMIT 1`))[0];
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
  if(req.get?.('x-backoffice-company-id')!==undefined)return enforceStaffCompanyRequest(db,req);
  await liveStaff(db,user);
  const path=String(req.originalUrl||'').split('?')[0],capability=staffRequestCapability(req.method,path,req.body||{},req.query||{});
  if(!capability)throw staffError();
  req.user={...user,staffAccess:true};
  res.setHeader('Cache-Control','private, no-store');
  if(capability==='SESSION')return true;
  if(capability==='LIFECYCLE'){
    const storeId=path.split('/').at(-1);
    const row=(await db.$queryRaw`SELECT "capabilities" FROM "BackofficeStaffGrant" WHERE "userId"=${user.id} AND "companyId"=${user.companyId} AND "storeId"=${storeId} AND "active"=true LIMIT 1`)[0];
    const reads=Array.isArray(row?.capabilities)?row.capabilities.filter(c=>['inventory.read','cash.read','products.read','sales.read','shifts.read','invoices.read','supplier-price-comparison.read','low-value-products.read','order-suggestions.read','analytics.read','handover.read','employees.read','schedule.read','attendance.read','leaves.read','stock.read','payroll.read','pending.read','promotions.read','baking.read','monthly-invoice-audit.read','online-orders.read','table-service.read','stock-transfers.read','invoice-ai.read','wholesale.read','video.read','printers.read','chat.read','radio.read','approvals.read','monthly-inventory.read','workforce-roles.read','workforce-rules.read','shift-templates.read','workforce-audit.read','unsold-products.read','sales-journal.read'].includes(c)):[];
    reads.push(...(Array.isArray(row?.capabilities)?row.capabilities.filter(c=>storeReportCapabilities.includes(c)||finalPassiveStoreActions.some(action=>action.key===c)):[]));
    let disabled;
    for(const read of reads){
      try{await requireStaffGrant(db,user,storeId,read);req.user={...req.user,storeId};return true}
      catch(error){if(error.code!=='MODULE_DISABLED')throw error;disabled=error}
    }
    throw disabled||staffError();
  }
  const storeId=req.get('x-backoffice-store-id');
  const passive=finalPassiveStoreRequest(req.method,path);if(passive&&passive.storeId!==storeId)throw staffError();
  if(!storeId||req.query?.storeId&&req.query.storeId!==storeId||req.body?.storeId&&req.body.storeId!==storeId)throw staffError();
  if(storeReportCapabilities.includes(capability)&&req.query?.storeId!==storeId)throw staffError();
  if(['analytics.read','handover.read','stock.read','pending.read','promotions.read','monthly-invoice-audit.read','invoice-ai.read','wholesale.read','approvals.read','monthly-inventory.read'].includes(capability)&&req.query?.storeId!==storeId)throw staffError();
  const workforce=path.match(/^\/api\/platform\/store-modules\/companies\/([^/]+)\/stores\/([^/]+)\/workforce-v2\/(?:employees(?:\/[^/]+(?:\/details)?)?|schedules(?:\/editor-options|\/[^/]+\/(?:assignments(?:\/[^/]+)?|transition|exceptions))?|attendance(?:\/clock|\/[^/]+\/(?:correct-hours|approve-review|approve-over-8-hours))?|leaves(?:\/eligible-employees|\/[^/]+\/decision)?|roles|(?:rules|shift-templates)(?:\/[^/]+(?:\/status)?)?|audit|payroll\/(?:preview|periods(?:\/[^/]+)?))$/);
  if(workforce&&(workforce[1]!==user.companyId||workforce[2]!==storeId))throw staffError();
  const chatRead=path.match(/^\/api\/store-chat\/stores\/([^/]+)\/messages(?:\/search|\/[^/]+\/attachment)?$/);
  if(chatRead&&(chatRead[1]!==storeId||path.endsWith('/attachment')&&req.query?.download==='1'))throw staffError();
  const nativeStoreRead=path.match(/^\/api\/(?:video-admin|production-printers)\/stores\/([^/]+)$/);
  if(nativeStoreRead&&nativeStoreRead[1]!==storeId)throw staffError();
  const online=path.match(/^\/api\/public\/kat\/backoffice-managed\/stores\/([^/]+)\/orders$/);
  if(online&&online[1]!==storeId)throw staffError();
  const sales=path.match(/^\/api\/(?:transactions|cash|cash-control|store-pos)\/stores\/([^/]+)(?:\/|$)/);
  if(sales&&sales[1]!==storeId)throw staffError();
  const {grant}=await requireStaffGrant(db,user,storeId,capability,capability==='invoices.read'&&path.startsWith('/api/purchase-orders/')?{additionalModules:['INVENTORY']}:undefined);
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
  const terminals=path.match(/^\/api\/backoffice-staff\/(?:sales|shifts)\/stores\/([^/]+)\/terminals$/);
  if(terminals&&terminals[1]!==storeId)throw staffError();
  const receiptAction=expectedReceiptAction(req.method,path);
  if(capability==='invoices.approve'&&receiptAction){
    if(Object.keys(req.body||{}).some(key=>!expectedReceiptFields[receiptAction]?.includes(key)))throw staffError();
  }
  if(capability==='invoices.approve'&&!receiptAction){
    const body=req.body||{};
    const fields=['status','expectedReopenVersion'];
    if(body.status==='INVOICED')fields.push('excludeStockLineIds');
    if(body.status==='NEW'&&body.returnForCorrection===true)fields.push('returnForCorrection');
    if(Object.keys(body).some(key=>!fields.includes(key)))throw staffError();
  }
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
    // A deleted draft can have a durable operation receipt. Its exact scoped
    // writer rechecks live authority and the actor/payload-bound receipt.
    if(!rows[0]&&capability!=='inventory.delete')throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Δεν βρέθηκε στο επιλεγμένο κατάστημα.');
  }
  req.staffGrant={...grant,capability};
  req.user={...req.user,storeId,permissions:[...modulesForCapability(capability),...(receiptAction?['ORDER_SUGGESTIONS']:[])]};
  return true;
}
function modulesForCapability(capability){
 const passive=finalPassiveStoreActions.find(action=>action.key===capability);if(passive)return [...passive.modules];
 if(storeReportCapabilities.includes(capability))return freeStoreReportCapabilities.includes(capability)?[]:['INVENTORY'];
 if(capability==='unsold-products.read')return ['SALES_ANALYTICS'];
 if(['operator-profiles.manage-permissions','operator-profiles.manage-pos-access','operator-profiles.create-employee','operator-profiles.reset-pin','operator-profiles.copy-permissions'].includes(capability))return ['STORE_MODE'];
 if(capability==='payments.import-kiosk')return ['CASH_CONTROL'];
 if(capability==='invoices.upload-original')return ['DOCUMENTS'];
 if(['invoice-ai.photo-preview','invoices.mydata-prefill'].includes(capability))return ['AI_READER','DOCUMENTS','INVENTORY'];
 if(capability==='sales-journal.read')return ['STORE_MODE'];
  return capability==='chat.read'?['STORE_CHAT']:capability==='radio.read'?['STORE_MODE','ONLINE_RADIO']:['approvals.read','approvals.expense-confirm','approvals.supplier-recovery'].includes(capability)?['STORE_MODE','CASH_CONTROL']:capability==='wholesale.read'?['WHOLESALE_B2B']:capability==='video.read'?['VIDEO_EVENTS']:capability==='printers.read'?['STORE_MODE']:capability==='stock-transfers.read'?['STORE_MODE']:capability==='invoice-ai.read'?['AI_READER']:capability==='online-orders.read'?['ONLINE_ORDERING']:capability==='table-service.read'?['STORE_MODE','TABLE_SERVICE']:capability==='baking.read'?['STORE_MODE']:capability==='pending.read'?['PENDING_CENTER']:['employees.read','employees.edit','schedule.read','schedule.create','schedule.edit','schedule.preview','schedule.approve','schedule.publish','schedule.approve-exception','attendance.read','attendance.clock','attendance.correct','attendance.approve-review','attendance.approve-overtime','leaves.read','leaves.create','leaves.approve','leaves.reject','leaves.cancel','payroll.read','workforce-roles.read','workforce-rules.read','workforce-rules.manage','shift-templates.read','shift-templates.manage','workforce-audit.read'].includes(capability)?[]:capability==='handover.read'?['SHIFT_HANDOVER']:capability==='analytics.read'?['SALES_ANALYTICS','STORE_MODE','CASH_CONTROL']:capability==='order-suggestions.read'?['ORDER_SUGGESTIONS']:capability==='low-value-products.read'?['LOW_VALUE_PRODUCTS']:capability==='cash.read'?['CASH_CONTROL','STORE_CHAT','AI_READER']:capability.startsWith('sales.')||capability.startsWith('payments.')||capability.startsWith('shifts.')?['STORE_MODE','CASH_CONTROL']:capability==='invoices.read'?['DOCUMENTS']:capability.startsWith('invoices.')?['DOCUMENTS','INVENTORY']:['INVENTORY'];
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
    if(body.supplierId||body.supplierName||body.invoiceDocumentNumber||body.type!=='OTHER_EXPENSE'||Number(body.amount)<=0||body.deferredInvoice||!body.idempotencyKey||!['DOCUMENT','NO_DOCUMENT'].includes(body.evidenceMode)||!['CASH_SHIFT','EXTERNAL'].includes(body.paymentSource)||!['CASH_SHIFT','CORPORATE_CARD','BANK_TRANSFER','EMPLOYEE_REIMBURSEMENT'].includes(body.paymentMethod)||(body.paymentSource==='CASH_SHIFT')!==(body.paymentMethod==='CASH_SHIFT'))throw staffError(400,'STAFF_PAYMENT_INVALID','Έλεγξε το είδος και τον τρόπο πληρωμής.');
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
