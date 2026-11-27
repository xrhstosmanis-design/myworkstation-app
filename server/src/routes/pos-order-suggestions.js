import {supplierMinimumKey,supplierMinimumSection} from '../lib/proposal-supplier-minimum.js';
import {randomUUID} from 'node:crypto';
import {applyProposalQuantities} from '../../../shared/order-proposal-quantities.mjs';
import {Router} from 'express';
import {z} from 'zod';
import {prisma as defaultPrisma} from '../prisma.js';
import {requireStoreModule,isPlatformSuperAdmin} from '../middleware/module-access.js';
import {readPosOrderProposal,readPosProposalSuppliers,parsePosProposalOptions,createPosProposalSnapshots} from '../services/pos-order-proposal.js';
import {sendEmail} from '../services/mail.js';
import {reportRecipientListSchema,normalizeReportRecipients} from '../services/report-recipients.js';
import {renderPosOrderProposal} from '../../../shared/pos-order-proposal-report.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function requirePosOrderSuggestion(db,user,storeId){
 if(user?.staffAccess===true)throw fail(403,'Απαιτείται σύνδεση χειριστή POS.');
 if(user?.tokenType!=='STORE_OPERATOR'){
  if(!isPlatformSuperAdmin(user)&&!['OWNER','ADMIN'].includes(user?.role))throw fail(403,'Δεν επιτρέπεται πρόσβαση.');
  return;
 }
 if(user.storeId!==storeId)throw fail(403,'Η πρόταση αφορά μόνο το κατάστημα του POS.');
 const [row]=await db.$queryRaw`SELECT p."permissions",p."posAccess" FROM "StoreOperatorCredential" c JOIN "Employee" e ON e."id"=c."employeeId" AND e."storeId"=c."storeId" LEFT JOIN "StoreOperatorProfile" p ON p."companyId"=c."companyId" AND p."storeId"=c."storeId" AND p."employeeId"=c."employeeId" WHERE c."id"=${user.operatorId||user.id} AND c."companyId"=${user.companyId} AND c."storeId"=${storeId} AND c."active"=TRUE AND e."active"=TRUE`;
 if(!row||row.posAccess===false||row.permissions?.orderSuggestionsPos!==true)throw fail(403,'Δεν έχεις δικαίωμα «Πρόταση παραγγελίας στο POS».');
}
export function createPosOrderSuggestionsRouter({db=defaultPrisma,read=readPosOrderProposal,suppliers=readPosProposalSuppliers,sendMail=sendEmail,snapshots=createPosProposalSnapshots(),clock=()=>new Date()}={}){
 const router=Router(),moduleGuard=requireStoreModule('ORDER_SUGGESTIONS');
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');next()});
 const admission=async(req,res,next)=>{try{if((req.body?.storeId!==undefined&&req.body.storeId!==req.params.storeId)||(req.query?.storeId!==undefined&&req.query.storeId!==req.params.storeId))throw fail(400,'Το κατάστημα της αίτησης δεν συμφωνεί με το επιλεγμένο POS.');await requirePosOrderSuggestion(db,req.user,req.params.storeId);req.user={...req.user,permissions:[...(req.user.permissions||[]),'ORDER_SUGGESTIONS']};next()}catch(error){next(error)}};
 const recheck=async req=>{
  await requirePosOrderSuggestion(db,req.user,req.params.storeId);
  let admitted=false,status=403;
  await moduleGuard(req,{status(value){status=value;return this},json(body){throw fail(status,body.error||'Δεν επιτρέπεται πρόσβαση.')}},error=>{if(error)throw error;admitted=true});
  if(!admitted||!await db.store.findFirst({where:{id:req.params.storeId,companyId:req.targetStore.companyId,active:true},select:{id:true}}))throw fail(403,'Δεν επιτρέπεται πρόσβαση στο κατάστημα.');
 };
 const handler=fn=>async(req,res,next)=>{try{
  req.posProposalStore=await db.store.findFirst({where:{id:req.targetStore.id,companyId:req.targetStore.companyId,active:true},select:{id:true,name:true}});
  if(!req.posProposalStore)throw fail(404,'Δεν βρέθηκε ενεργό κατάστημα.');
  await fn(req,res);
 }catch(error){if(error instanceof z.ZodError)error=fail(400,'Έλεγξε ημερομηνίες, ημέρες και email.');next(error)}};
 router.get('/stores/:storeId/permission',admission,moduleGuard,handler(async(req,res)=>res.json({storeId:req.targetStore.id,allowed:true})));
 const scope=req=>({storeId:req.targetStore.id,companyId:req.targetStore.companyId,actorId:req.user.operatorId||req.user.id});
 router.get('/stores/:storeId/suppliers',admission,moduleGuard,handler(async(req,res)=>{
  const rows=await suppliers(db,{...scope(req),includeCadence:true,now:clock()});await recheck(req);
  res.json({storeId:req.targetStore.id,suppliers:rows});
 }));
 router.get('/stores/:storeId/proposal',admission,moduleGuard,handler(async(req,res)=>{
  const now=clock(),parsed=parsePosProposalOptions(req.query,now);
  const result=await read(db,{...scope(req),...parsed,storeName:req.posProposalStore.name,now});
  await recheck(req);
  const report={...result,storeName:req.posProposalStore.name,period:parsed.period,supplier:result.supplier||null};
  const snapshot=snapshots.create(report,scope(req));res.json({...snapshot.report,reportId:snapshot.id});
 }));
 router.put('/stores/:storeId/supplier-minimum',admission,moduleGuard,handler(async(req,res)=>{
  if(req.user.tokenType==='STORE_OPERATOR'||(!isPlatformSuperAdmin(req.user)&&!['OWNER','ADMIN'].includes(req.user.role)))throw fail(403,'Απαιτείται πρόσβαση διαχειριστή.');
  const input=z.object({reportId:z.string().uuid(),productId:z.string().min(1).max(200),
   minimum:z.number().positive().max(100000000).refine(value=>Number(value.toFixed(4))===value).nullable()}).strict().parse(req.body);
  const entry=snapshots.get(input.reportId,scope(req));
  const row=entry.report.rows.find(item=>item.productId===input.productId);
  if(!row?.orderSupplierId)throw fail(422,'Επίλεξε είδος με προμηθευτή.');
  if(!entry.report.supplierMinimumAvailable)throw fail(503,'Η μόνιμη αποθήκευση ελάχιστου δεν έχει εγκατασταθεί.');
  await recheck(req);
  const key=supplierMinimumKey(row.orderSupplierId,row.productId);
  await db.$transaction(async tx=>{
   const eligible=await tx.$queryRaw`
    SELECT s."id" FROM "Supplier" s JOIN "Product" p ON p."companyId"=s."companyId"
    WHERE s."companyId"=${entry.companyId} AND s."id"=${row.orderSupplierId} AND s."active"=TRUE
     AND p."id"=${row.productId} AND p."active"=TRUE FOR SHARE OF s,p`;
   if(!eligible.length)throw fail(409,'Το είδος ή ο προμηθευτής δεν είναι ενεργός.');
   if(input.minimum===null){
    await tx.$executeRaw`UPDATE "ManagementParameters"
     SET "settings"="settings" #- ARRAY[${supplierMinimumSection},${key}]::text[], "updatedAt"=NOW()
     WHERE "companyId"=${entry.companyId}`;
   }else{
    const values=JSON.stringify({[key]:input.minimum});
    await tx.$executeRaw`INSERT INTO "ManagementParameters" ("id","companyId","settings")
     VALUES (${randomUUID()},${entry.companyId},jsonb_build_object(${supplierMinimumSection}::text,${values}::jsonb))
     ON CONFLICT ("companyId") DO UPDATE
     SET "settings"=jsonb_set("ManagementParameters"."settings",ARRAY[${supplierMinimumSection}]::text[],
      COALESCE("ManagementParameters"."settings"->${supplierMinimumSection},'{}'::jsonb)||${values}::jsonb),"updatedAt"=NOW()`;
   }
   await tx.$executeRaw`INSERT INTO "ManagementParameterAudit" ("id","companyId","section","actorId","actorName")
    VALUES (${randomUUID()},${entry.companyId},${supplierMinimumSection},${req.user.id},${req.user.fullName||req.user.email||null})`;
  });
  res.json({ok:true});
 }));
 router.post('/stores/:storeId/email',admission,moduleGuard,handler(async(req,res)=>{
  const input=z.object({reportId:z.string().uuid(),recipients:reportRecipientListSchema.refine(x=>x.length>0,'Συμπλήρωσε τουλάχιστον ένα email.'),search:z.string().trim().max(200).default(''),quantities:z.record(z.number().finite().min(0).max(100000000)).default({})}).parse(req.body);
  const entry=snapshots.get(input.reportId,scope(req));
  if(entry.state!=='ready')throw fail(409,'Υπάρχει ήδη απόπειρα αποστολής αυτής της πρότασης. Έλεγξε την κατάστασή της πριν από νέα αποστολή.');
  let report;
  try{report=applyProposalQuantities(entry.report,input.quantities)}
  catch(error){throw fail(422,error.message)}
  const rendered=renderPosOrderProposal(report,input.search);
  if(!rendered.rowCount)throw fail(422,'Δεν υπάρχουν είδη για αποστολή με αυτά τα κριτήρια.');
  const to=normalizeReportRecipients(input.recipients),auditId=`pos-proposal-email:${input.reportId}`;
  const auditContext={reportId:input.reportId,...scope(req),recipients:to,search:input.search,period:entry.report.period,supplierId:entry.report.supplier?.id||null};
  entry.state='sending';let auditStarted=false,smtpStarted=false;
  try{
   await recheck(req);
   await db.authAudit.create({data:{id:auditId,userId:req.user.id,email:req.user.email||'pos-operator',event:'POS_ORDER_PROPOSAL_EMAIL_PENDING',success:false,deviceName:JSON.stringify(auditContext),userAgent:req.headers['user-agent']||null,ipAddress:req.ip||null}});auditStarted=true;
   await recheck(req);
   smtpStarted=true;const receipt=await sendMail({to,subject:rendered.subject,text:rendered.text,html:rendered.html,companyId:entry.companyId,storeId:entry.storeId,includeDeliveryResult:true});
   entry.state='sent';const messageId=String(receipt.messageId||'').slice(0,500),accepted=receipt.accepted||to,rejected=receipt.rejected||[],status=rejected.length?'PARTIAL':'ACCEPTED';let auditWarning=false;
   try{await db.authAudit.update({where:{id:auditId},data:{event:`POS_ORDER_PROPOSAL_EMAIL_${status}`,success:status==='ACCEPTED',deviceName:JSON.stringify({...auditContext,messageId,accepted,rejected})}})}catch{auditWarning=true}
   res.json({ok:true,status,reportId:input.reportId,messageId,recipients:to,accepted,rejected,auditWarning});
  }catch(error){
   if(entry.state!=='sent')entry.state=smtpStarted?'uncertain':'failed';
   if(auditStarted)try{await db.authAudit.update({where:{id:auditId},data:{event:smtpStarted?'POS_ORDER_PROPOSAL_EMAIL_UNCONFIRMED':'POS_ORDER_PROPOSAL_EMAIL_NOT_SENT',success:false}})}catch{}
   if(smtpStarted)throw fail(502,'Η παράδοση δεν επιβεβαιώθηκε. Έλεγξε την αποστολή πριν δημιουργήσεις νέα πρόταση για αποστολή.');
   throw error.status?error:fail(503,'Η αποστολή δεν ξεκίνησε επειδή δεν καταγράφηκε στο ιστορικό. Υπολόγισε την πρόταση ξανά.');
  }
 }));
 return router;
}
export default createPosOrderSuggestionsRouter();
