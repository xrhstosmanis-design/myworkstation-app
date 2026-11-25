import {ensureMyDataBranchSchema,hasMyDataBranchMappings,readMyDataBranchForStore} from "../services/mydata-store-branch.js";
import {readMyDataPdfDraftReadiness} from '../lib/mydata-pdf-draft-readiness.js';
import {greeceDateInput,greeceExportRows} from "../../../shared/greece-time.mjs";
import {requireStaffAction,requireStaffGrant} from '../services/backoffice-staff-access.js';
import {assertCustomerDemoOutboundAllowed,isCustomerDemoTenant} from "../customer-demo-runtime.js";
import {backgroundDrain} from "../server-shutdown.js";
import crypto from "crypto";
import * as XLSX from "xlsx";
import {z} from "zod";
import {Router} from "express";
import {prisma} from "../prisma.js";
import {companyModuleState,requireCompanyModule} from "../middleware/module-access.js";
import {decryptStoreIntegrationCredentials,ensureStoreIntegrationSchema} from "./platform-store-integrations.js";
import {invoiceNodes,invoiceRecipientBranch,invoiceSummary,myDataError,nextPage,unwrapMyDataXml} from "../mydata-xml.js";
import {myDataHttpError} from "../mydata-http-error.js";
import {archiveQuery,archiveExportRows,archiveReportHtml} from "../invoice-archive.js";
import {linkStoredPosInvoicePhotos} from "../lib/pos-unlinked-mydata.js";
import {acquireOriginal,fetchStaffMyDataInboxOriginal,prefillStoredMyDataDraft,providerOriginalRecoveryLinkPattern} from "../mydata-original.js";
import {lifecycleContext,withLifecycleContext} from '../services/store-lifecycle-context.js';
import {assertLifecycleMutation,readLifecycleGeneration,lifecycleMyDataLockKey} from '../services/store-lifecycle-generation.js';

import {myDataReceivingScope,readMyDataReceivingContinuation,saveMyDataReceivingContinuation} from "../services/mydata-receiving-continuation.js";

const router=Router();
let schemaPromise;

function canSync(req){return req.user?.tokenType!=="STORE_OPERATOR"&&["SUPER_ADMIN","OWNER","ADMIN","MANAGER"].includes(req.user?.role)}
async function ensureSchema(){
  if(!schemaPromise)schemaPromise=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "MyDataInboundDocument" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"inboxId" TEXT NOT NULL,
      "mark" TEXT NOT NULL,"uid" TEXT,"issuerVat" TEXT,"counterpartVat" TEXT,"series" TEXT,"documentNumber" TEXT,
      "issueDate" DATE,"invoiceType" TEXT,"currency" TEXT,"totalNet" DECIMAL(14,4) NOT NULL DEFAULT 0,
      "totalVat" DECIMAL(14,4) NOT NULL DEFAULT 0,"totalGross" DECIMAL(14,4) NOT NULL DEFAULT 0,
      "rawPayload" JSONB NOT NULL,"fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("companyId","mark"), UNIQUE ("inboxId"))`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MyDataInboundDocument_store_date_idx" ON "MyDataInboundDocument" ("storeId","issueDate" DESC)`);
  })().catch(error=>{schemaPromise=undefined;throw error});
  return schemaPromise;
}
const endpoint=environment=>environment==="SANDBOX"?"https://mydataapidev.aade.gr/RequestDocs":"https://mydatapi.aade.gr/myDATA/RequestDocs";
function syncError(message,status=502){const error=new Error(message);error.status=status;return error}

router.post("/documents/inbox/:inboxId/provider-original",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{try{
  const capability="invoices.fetch-original";
  const {storeId}=z.object({storeId:z.string().min(1).max(160)}).strict().parse(req.body);
  const {companyId,id:actorId}=req.user,inboxId=req.params.inboxId;
  if(req.user.staffAccess!==true||req.user.storeId!==storeId||req.staffGrant?.capability!==capability||!inboxId||inboxId.length>160)
    throw syncError("Δεν επιτρέπεται λήψη πρωτοτύπου σε αυτό το κατάστημα.",403);
  await ensureSchema();
  const result=await fetchStaffMyDataInboxOriginal(prisma,{companyId,storeId,inboxId,actorId},
    db=>requireStaffAction(db,req,storeId,capability));
  res.json(result);
}catch(error){next(error)}});

router.post("/documents/inbox/:inboxId/original",requireCompanyModule("DOCUMENTS"),requireCompanyModule("AI_READER"),requireCompanyModule("INVENTORY"),async(req,res,next)=>{try{
  if(!canSync(req))return res.status(403).json({error:"Ο έλεγχος επιτρέπεται μόνο σε εξουσιοδοτημένο χρήστη BackOffice."});
  const store=await prisma.store.findFirst({where:{id:String(req.body?.storeId||""),companyId:req.user.companyId},select:{id:true}});
  if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  await ensureSchema();
  const result=await acquireOriginal(prisma,req.user.companyId,store.id,req.params.inboxId,req.user.id,true);
  const pdfReadiness=await readMyDataPdfDraftReadiness(prisma,{companyId:req.user.companyId,storeId:store.id,inboxId:req.params.inboxId,orderId:result.reconciliationRequired?null:result.purchaseOrderId});
  res.json({...result,pdfReadiness});
}catch(error){next(error)}});

router.post("/documents/mydata/orders/:orderId/prefill",requireCompanyModule("DOCUMENTS"),requireCompanyModule("AI_READER"),requireCompanyModule("INVENTORY"),async(req,res,next)=>{try{
  if(req.user.staffAccess===true){
    const storeId=req.body?.storeId;
    if(typeof storeId!=="string"||!storeId||storeId.length>160)throw syncError("Επίλεξε κατάστημα.",400);
    if(req.user.storeId!==storeId||req.staffGrant?.capability!=="invoices.mydata-prefill")throw syncError("Δεν επιτρέπεται η συμπλήρωση σε αυτό το κατάστημα.",403);
    const {companyId,id:actorId}=req.user,orderId=req.params.orderId;
    return res.json(await prefillStoredMyDataDraft(prisma,{companyId,storeId,orderId,actorId},
      tx=>requireStaffAction(tx,req,storeId,"invoices.mydata-prefill")));
  }
  if(!canSync(req))return res.status(403).json({error:"Η συμπλήρωση επιτρέπεται μόνο σε εξουσιοδοτημένο χρήστη BackOffice."});
  const companyId=req.user.companyId,storeId=String(req.body?.storeId||""),orderId=req.params.orderId;
  await ensureSchema();
  const rows=await prisma.$queryRaw`
    SELECT m."inboxId" FROM "MyDataInboundDocument" m
    JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
    JOIN "PurchaseOrder" o ON o."id"=m."rawPayload"->>'mydataDraftOrderId' AND o."companyId"=m."companyId" AND o."storeId"=m."storeId"
    WHERE m."companyId"=${companyId} AND m."storeId"=${storeId} AND o."id"=${orderId}
      AND o."status"='NEW' AND i."status"='IN_REVIEW' AND i."attachmentId" IS NOT NULL
    LIMIT 2`;
  if(rows.length!==1)return res.status(409).json({error:"Δεν βρέθηκε μοναδικό ανοιχτό πρόχειρο myDATA με συνημμένο πρωτότυπο."});
  const result=await acquireOriginal(prisma,companyId,storeId,rows[0].inboxId,req.user.id,true,async()=>{
    throw syncError("Το συνημμένο πρωτότυπο δεν είναι πλέον διαθέσιμο.",409);
  });
  if(result.reconciliationRequired||result.purchaseOrderId!==orderId)return res.json({reconciliationRequired:true});
  const counts=await prisma.$queryRaw`SELECT COUNT(*)::int AS "lineCount" FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" o ON o."id"=l."orderId" WHERE o."id"=${orderId} AND o."companyId"=${companyId} AND o."storeId"=${storeId}`;
  res.json({lineCount:counts[0].lineCount});
}catch(error){next(error)}});

router.get("/documents/inbox/archive",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{try{
  if(!canSync(req)&&!(req.user.staffAccess===true&&req.staffGrant?.capability==='invoices.read'))return res.status(403).json({error:"Το αρχείο επιτρέπεται μόνο σε εξουσιοδοτημένο χρήστη BackOffice."});
  const store=await prisma.store.findFirst({where:{id:String(req.query.storeId||""),companyId:req.user.companyId},select:{id:true,name:true}});
  if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  await ensureSchema();
  const format=req.query.format||"",exporting=["xlsx","pdf"].includes(format);
  if(format&&!exporting)return res.status(400).json({error:"Μη έγκυρη μορφή εξαγωγής."});
  const offset=exporting?0:Math.max(0,Math.floor(Number(req.query.offset)||0));
  const filters={processing:req.query.processing,q:req.query.q,supplier:req.query.supplier,date:req.query.date,dateFrom:req.query.dateFrom,dateTo:req.query.dateTo,receivedToday:req.query.receivedToday==="true",receivedBeforeToday:req.query.receivedBeforeToday==="true",id:req.query.id,limit:exporting?20001:100,offset};
  const [paymentSchema]=await prisma.$queryRaw`SELECT to_regclass('"SupplierPaymentAllocation"') IS NOT NULL AND to_regclass('"SupplierPaymentSettlement"') IS NOT NULL AS available`;
  const query=archiveQuery(req.user.companyId,store.id,filters,false,paymentSchema?.available===true),count=archiveQuery(req.user.companyId,store.id,filters,true),all=archiveQuery(req.user.companyId,store.id,{processing:filters.processing,receivedToday:filters.receivedToday,receivedBeforeToday:filters.receivedBeforeToday},true);
  const [rows,counts,totals]=await Promise.all([prisma.$queryRawUnsafe(query.sql,...query.values),prisma.$queryRawUnsafe(count.sql,...count.values),prisma.$queryRawUnsafe(all.sql,...all.values)]);
  if(req.user.staffAccess===true)await requireStaffGrant(prisma,req.user,store.id,'invoices.read');
  if(exporting){
    if(rows.length>20000)return res.status(409).json({error:"Η εξαγωγή ξεπερνά 20.000 εγγραφές. Περιορίστε με ημερομηνία ή προμηθευτή."});
    if(format==="pdf")return res.json({html:archiveReportHtml(rows,store.name),count:rows.length});
    const workbook=XLSX.utils.book_new(),sheet=XLSX.utils.json_to_sheet(greeceExportRows(archiveExportRows(rows)));
    sheet["!cols"]=[{wch:14},{wch:25},{wch:42},{wch:15},{wch:14},{wch:18},{wch:22},{wch:16},{wch:12},{wch:16},{wch:12},{wch:34},{wch:25},{wch:60}];
    XLSX.utils.book_append_sheet(workbook,sheet,"Παραστατικά");
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([["Κατάστημα",store.name],["Πλήθος",rows.length],["Περιεχόμενο","Στοιχεία θυρίδας/myDATA. Δεν είναι πρωτότυπα PDF ή τελικές καταχωρίσεις."],["Φίλτρα",JSON.stringify({processing:filters.processing||"ALL",q:filters.q||"",supplier:filters.supplier||"",date:filters.date||"",dateFrom:filters.dateFrom||"",dateTo:filters.dateTo||"",receivedToday:filters.receivedToday,receivedBeforeToday:filters.receivedBeforeToday})]]),"Πληροφορίες");
    const buffer=XLSX.write(workbook,{type:"buffer",bookType:"xlsx"});
    return res.json({filename:"mydata-invoices.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",dataUrl:`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${buffer.toString("base64")}`,count:rows.length});
  }
  const suppliers=await prisma.$queryRaw`SELECT DISTINCT s."name" FROM "DocumentInbox" i JOIN "Supplier" s ON s."id"=i."supplierId" AND s."companyId"=i."companyId" WHERE i."companyId"=${req.user.companyId} AND i."storeId"=${store.id} ORDER BY s."name"`;
  if(req.user.staffAccess===true)await requireStaffGrant(prisma,req.user,store.id,'invoices.read');
  res.json({items:rows,total:counts[0]?.count||0,archiveTotal:totals[0]?.count||0,offset,limit:100,suppliers:suppliers.map(s=>s.name)});
}catch(error){next(error)}});

const syncInFlight=new Map(),syncStatus=new Map();
const syncStatusKey=(companyId,storeId,generation)=>JSON.stringify([companyId,storeId,generation]);
const delegatedSyncCapability="invoices.sync-mydata";
export async function verifyDelegatedMyDataSync(db,req,verify=requireStaffAction){
  const {companyId,storeId}=req.user;
  if(req.user.staffAccess!==true||!companyId||!storeId||storeId!==req.body?.storeId||req.staffGrant?.capability!==delegatedSyncCapability)
    throw syncError("Δεν επιτρέπεται συγχρονισμός myDATA σε αυτό το κατάστημα.",403);
  await verify(db,req,storeId,delegatedSyncCapability);
  return resolveMyDataRecipientBranch(db,companyId,storeId,true);
}
const missingMyDataBranch=()=>syncError("Ο Ιδιοκτήτης πρέπει να αντιστοιχίσει το υποκατάστημα myDATA πριν από τη λήψη.",409);
async function resolveMyDataRecipientBranch(db,companyId,storeId,delegated){
  const branch=await readMyDataBranchForStore(db,companyId,storeId);
  if(branch!==null)return branch;
  if(await hasMyDataBranchMappings(db,companyId))throw missingMyDataBranch();
  if(!delegated)return null;
  const stores=await db.store.findMany({where:{companyId},select:{id:true},take:2});
  if(stores.length===1&&stores[0].id===storeId)return null;
  throw missingMyDataBranch();
}
export function syncMyDataStore(req,{db=prisma}={}){
  assertCustomerDemoOutboundAllowed({companyId:req.user.companyId,storeId:req.body.storeId});
  const scope={companyId:req.user.companyId,storeId:req.body.storeId};
  if(typeof scope.companyId!=='string'||!scope.companyId||typeof scope.storeId!=='string'||!scope.storeId)throw syncError('Απαιτείται συγκεκριμένη εταιρεία και κατάστημα.',400);
  const generation=lifecycleContext()[scope.storeId]??'0',key=syncStatusKey(scope.companyId,scope.storeId,generation);
  const delegated=req.user.staffAccess===true,running=syncInFlight.get(key);
  if(running)return delegated||running.delegated
    ?Promise.reject(syncError("Υπάρχει ήδη λήψη myDATA σε εξέλιξη.",409)):running.promise;
  let admitted=false;
  const run=db.$transaction(async lock=>{
    const held=await lock.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtextextended(${lifecycleMyDataLockKey(scope)},0)) AS "held"`;
    if(!held[0]?.held)throw syncError("Υπάρχει ήδη λήψη myDATA σε εξέλιξη.",409);
    assertCustomerDemoOutboundAllowed({companyId:req.user.companyId,storeId:req.body.storeId});
    if(req.user.companyId!==scope.companyId||req.body.storeId!==scope.storeId)throw syncError('Η επιλογή καταστήματος άλλαξε πριν από τη λήψη.',409);
    await assertLifecycleMutation(lock,scope,generation);
    // Keep the live grant out of the long-lived advisory lock transaction:
    // revocations must be able to take effect between receiving pages.
    await ensureMyDataBranchSchema(db);
    const branch=delegated?await verifyDelegatedMyDataSync(db,req):await resolveMyDataRecipientBranch(db,scope.companyId,scope.storeId,false);
    admitted=true;
    return performSync(req,branch);
  },{timeout:3600000,maxWait:5000}).then(result=>{syncStatus.set(key,{lastSyncAt:new Date().toISOString(),lastSyncError:null});return result},error=>{if(admitted)syncStatus.set(key,{...syncStatus.get(key),lastSyncError:error.code==='MYDATA_HTTP_ERROR'?error.message:"Ο τελευταίος έλεγχος δεν ολοκληρώθηκε."});throw error}).finally(()=>syncInFlight.delete(key));
  syncInFlight.set(key,{promise:run,delegated});return run;
}
// Opt-in historical recovery for verified provider URL formats.
const originalRecoveryVersion = "verified-provider-formats-202611-v1";
const panormouStoreId = "cmwqvuxrx001is8g4uqlyzwg2";

export async function recoverHistoricalOriginals({
  db, companyId, storeId, userId, source, excludeInboxIds = [],
  storeIds = process.env.MYDATA_ORIGINAL_RECOVERY_STORE_IDS ?? "",
  reconcileExisting = false,
  acquire = acquireOriginal,
}) {
  if (source !== "AADE_MYDATA_PRODUCTION" || !storeIds.split(",").map(id => id.trim()).includes(storeId)) {
    return {downloaded: 0, failed: 0};
  }
  const isPanormou = storeId === panormouStoreId;
  const recoveryVersion = isPanormou ? "panormou-provider-formats-from-202601-v1" : originalRecoveryVersion;
  const candidates = await db.$queryRaw`
    SELECT m."inboxId" FROM "MyDataInboundDocument" m
    JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
    WHERE m."companyId"=${companyId} AND m."storeId"=${storeId}
      AND CASE WHEN ${isPanormou} THEN m."issueDate">=DATE '2026-01-01'
        ELSE m."issueDate">=DATE '2026-11-01' AND m."issueDate"<DATE '2026-12-01' END
      AND m."rawPayload"->>'source'=${source}
      AND i."attachmentId" IS NULL AND i."status"='RECEIVED'
      AND m."rawPayload"->>'originalDownloaded' IS DISTINCT FROM 'true'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(${JSON.stringify(excludeInboxIds)}::jsonb) AS excluded("inboxId")
        WHERE excluded."inboxId"=m."inboxId"
      )
      AND m."rawPayload"->>'originalRecoveryVersion' IS DISTINCT FROM ${recoveryVersion}
      AND m."rawPayload"->>'xml' ~* CASE
        WHEN COALESCE((m."rawPayload"->>'originalAttempts')::int,0)=0
        THEN ${providerOriginalRecoveryLinkPattern({includeExistingImpact:true})}
        ELSE ${providerOriginalRecoveryLinkPattern()}
      END
    ORDER BY m."fetchedAt",m."id" LIMIT 2`;
  let downloaded = 0, failed = 0;
  for (const {inboxId} of candidates) {
    try {
      const result = await acquire(db, companyId, storeId, inboxId, userId, false, undefined, {reconcileExisting});
      if (result.downloaded) downloaded++;
    } catch {
      failed++;
      await db.$executeRaw`
        UPDATE "MyDataInboundDocument" m SET "rawPayload"=m."rawPayload"||jsonb_build_object(
          'originalRecoveryVersion',${recoveryVersion},'originalError',
          'Το πρωτότυπο δεν κατέβηκε κατά την επανάληψη. Δοκιμάστε από τη Θυρίδα.')
        WHERE m."companyId"=${companyId} AND m."storeId"=${storeId} AND m."inboxId"=${inboxId}
          AND m."rawPayload"->>'originalDownloaded' IS DISTINCT FROM 'true'
          AND m."rawPayload"->>'originalRecoveryVersion' IS DISTINCT FROM ${recoveryVersion}
          AND EXISTS (
            SELECT 1 FROM "DocumentInbox" i
            WHERE i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
              AND i."attachmentId" IS NULL AND i."status"='RECEIVED'
          )`;
    }
  }
  return {downloaded, failed};
}

async function performSync(req,branch=null){
  assertCustomerDemoOutboundAllowed({companyId:req.user.companyId,storeId:req.body.storeId});
  const delegated=req.user.staffAccess===true;
  await Promise.all([ensureSchema(),ensureStoreIntegrationSchema()]);const storeId=String(req.body?.storeId||"");
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId},select:{id:true,name:true,company:{select:{taxId:true}}}});
  if(!store)throw syncError("Δεν βρέθηκε το κατάστημα.",404);
  const companyVat=String(store.company?.taxId||"").replace(/\s/g,"");
  if(!/^\d{9}$/.test(companyVat))throw syncError("Πρέπει πρώτα να οριστεί το εννεαψήφιο ΑΦΜ της εταιρείας για ασφαλή λήψη myDATA.",409);
  const rows=await prisma.$queryRaw`SELECT "environment","credentialsEnc","enabled","metadataJson","receiveFromDate"::text AS "receiveFromDate" FROM "StoreIntegrationCredential" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "kind"='MYDATA' LIMIT 1`;
  const integration=rows[0];if(!integration?.enabled)throw syncError("Δεν έχει ενεργοποιηθεί σύνδεση myDATA για αυτό το κατάστημα.",409);
  if(!["SANDBOX","PRODUCTION"].includes(integration.environment))throw syncError("Μη έγκυρο περιβάλλον myDATA.",409);
  const credentials=decryptStoreIntegrationCredentials(integration.credentialsEnc);
  // The cursor belongs to this store AND environment. Never reuse a sandbox MARK in production.
  const source=`AADE_MYDATA_${integration.environment}`;
  const previous=branch===null?await prisma.$queryRaw`SELECT COALESCE(MAX(NULLIF("mark",'')::numeric),0)::text AS "lastMark" FROM "MyDataInboundDocument" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "rawPayload"->>'source'=${source}`
    :await prisma.$queryRaw`SELECT COALESCE(MAX(NULLIF("mark",'')::numeric),0)::text AS "lastMark" FROM "MyDataInboundDocument" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "rawPayload"->>'source'=${source} AND "rawPayload"->>'recipientBranch'=${String(branch)}`;
  const receiveFromDate=integration.environment==="PRODUCTION"?integration.receiveFromDate??null:null;
  const scope=branch===null?null:myDataReceivingScope(integration,{companyId:req.user.companyId,storeId:store.id,companyVat,branch});
  if(scope&&receiveFromDate)scope.receiveFromDate=receiveFromDate;
  const continuation=scope?readMyDataReceivingContinuation(integration,scope):null;
  const receiveThroughDate=receiveFromDate?(continuation?.receiveThroughDate??greeceDateInput()):null;
  const aadeDate=date=>date.split("-").reverse().join("/");
  const mark=continuation?.startMark||previous[0]?.lastMark||"0";
  const created=[];
  let duplicates=0,ignored=0,ignoredVat=0,ignoredBranch=0,missingMark=0,fetched=0;
  let page=continuation,processedPages=0,continuationPending=false;
  const pageKey=page=>scope?JSON.stringify([page.partition,page.row]):`${page.partition}:${page.row}`;
  const pages=new Set(page?[pageKey(page)]:[]);
  async function verifyPageWrites(tx){
    await tx.$queryRaw`SELECT 1 AS "locked" WHERE pg_advisory_xact_lock_shared(hashtextextended(${"mydata-branch-map:"+req.user.companyId},0)) IS NULL`;
    const currentBranch=delegated?await verifyDelegatedMyDataSync(tx,req):await resolveMyDataRecipientBranch(tx,req.user.companyId,store.id,false);
    if(currentBranch!==branch)throw syncError("Η αντιστοίχιση υποκαταστήματος myDATA άλλαξε. Ξεκίνα ξανά τη λήψη.",409);
    if(scope){
      const [current]=await tx.$queryRaw`
        SELECT "environment","credentialsEnc","enabled","metadataJson" FROM "StoreIntegrationCredential"
        WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "kind"='MYDATA'
        FOR UPDATE
      `;
      if(!current?.enabled||current.environment!==scope.environment||current.credentialsEnc!==integration.credentialsEnc||
         (current.metadataJson?.myDataBranchMappingRevision??null)!==scope.mappingRevision)
        throw syncError("Η σύνδεση myDATA άλλαξε. Ξεκίνα ξανά τη λήψη.",409);
    }
  }
  async function writeInvoice(tx,invoice,doc){
      const existing=await tx.$queryRaw`SELECT "inboxId" FROM "MyDataInboundDocument" WHERE "companyId"=${req.user.companyId} AND "mark"=${doc.mark} LIMIT 1`;
      if(existing[0])return null;
      const suppliers=doc.issuerVat?await tx.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "companyId"=${req.user.companyId} AND "taxId"=${doc.issuerVat} LIMIT 1`:[];
      const supplier=suppliers[0]||null;
      const inboxId=crypto.randomUUID(),recordId=crypto.randomUUID(),title=["myDATA",doc.series,doc.documentNumber].filter(Boolean).join(" ");
      const note=`${title} • MARK ${doc.mark} • ${doc.totalGross.toFixed(2)} € • Πρόχειρο — απαιτείται πρωτότυπο PDF/OCR και επιβεβαίωση πριν την αποθήκη`;
      await tx.$executeRaw`INSERT INTO "DocumentInbox" ("id","companyId","storeId","supplierId","status","note","responsibleName","createdByUserId") VALUES (${inboxId},${req.user.companyId},${store.id},${supplier?.id||null},'RECEIVED',${note},'Αυτόματη λήψη myDATA',${req.user.id})`;
      await tx.$executeRaw`INSERT INTO "MyDataInboundDocument" ("id","companyId","storeId","inboxId","mark","uid","issuerVat","counterpartVat","series","documentNumber","issueDate","invoiceType","currency","totalNet","totalVat","totalGross","rawPayload") VALUES (${recordId},${req.user.companyId},${store.id},${inboxId},${doc.mark},${doc.uid},${doc.issuerVat},${doc.counterpartVat},${doc.series},${doc.documentNumber},${doc.issueDate?new Date(`${doc.issueDate}T00:00:00Z`):null},${doc.invoiceType},${doc.currency},${doc.totalNet},${doc.totalVat},${doc.totalGross},${JSON.stringify({source,xml:invoice,originalPending:true,...(branch===null?{}:{recipientBranch:branch})})}::jsonb)`;
      return {id:inboxId,...doc,supplierName:supplier?.name||null};
  }
  function matchingInvoices(invoices){
    fetched+=invoices.length;
    const matching=[];
    for(const invoice of invoices){
      const doc=invoiceSummary(invoice);
      if(!doc.mark){ignored++;missingMark++;continue}
      if(doc.counterpartVat!==companyVat){ignored++;ignoredVat++;continue}
      if(branch!==null&&invoiceRecipientBranch(invoice)!==branch){ignored++;ignoredBranch++;continue}
      if(receiveFromDate&&(!doc.issueDate||doc.issueDate<receiveFromDate||doc.issueDate>receiveThroughDate)){ignored++;continue}
      matching.push({invoice,doc});
    }
    return matching;
  }
  function collect(result){if(result)created.push(result);else duplicates++}
  do{
    const url=new URL(endpoint(integration.environment));url.searchParams.set("mark",mark);
    // RequestDocs treats a single date parameter as an exact day.
    if(receiveFromDate){
      url.searchParams.set("dateFrom",aadeDate(receiveFromDate));
      url.searchParams.set("dateTo",aadeDate(receiveThroughDate));
    }
    if(page){url.searchParams.set("nextPartitionKey",page.partition);url.searchParams.set("nextRowKey",page.row)}
    assertCustomerDemoOutboundAllowed({companyId:req.user.companyId,storeId:store.id});
    if(delegated&&await verifyDelegatedMyDataSync(prisma,req)!==branch)
      throw syncError("Η αντιστοίχιση υποκαταστήματος myDATA άλλαξε. Ξεκίνα ξανά τη λήψη.",409);
    const response=await fetch(url,{headers:{"aade-user-id":credentials.accountId,"Ocp-Apim-Subscription-Key":credentials.secret,"Accept":"application/xml"},signal:AbortSignal.timeout(30000),...(delegated?{redirect:"error"}:{})});
    const responseXml=await response.text();if(!response.ok){
      const error=myDataHttpError({status:response.status,body:responseXml,environment:integration.environment});
      console.warn('myDATA receiving HTTP failure',error.diagnostic);
      throw error;
    }
    const xml=unwrapMyDataXml(responseXml);
    const remoteError=myDataError(xml);if(remoteError)throw syncError(`Το myDATA δεν ολοκλήρωσε τη λήψη: ${remoteError}`,409);
    const matching=matchingInvoices(invoiceNodes(xml));
    if(scope){
      const next=nextPage(xml);
      if(next&&pages.has(pageKey(next)))throw syncError("Η σελιδοποίηση myDATA επανέλαβε την ίδια σελίδα.",409);
      const results=await prisma.$transaction(async tx=>{
        await verifyPageWrites(tx);
        const written=[];
        for(const {invoice,doc} of matching)written.push(await writeInvoice(tx,invoice,doc));
        await saveMyDataReceivingContinuation(tx,receiveFromDate?{...scope,receiveThroughDate}:scope,mark,next);
        return written;
      },{timeout:30000});
      results.forEach(collect);
      page=next;
      if(page)pages.add(pageKey(page));
      if(++processedPages===100&&page){continuationPending=true;break}
    }else{
      for(const {invoice,doc} of matching){
        collect(await prisma.$transaction(async tx=>{
          await verifyPageWrites(tx);
          return writeInvoice(tx,invoice,doc);
        }));
      }
      page=nextPage(xml);
      if(page){const key=pageKey(page);if(pages.has(key))throw syncError("Η σελιδοποίηση myDATA επανέλαβε την ίδια σελίδα.");pages.add(key)}
      if(pages.size>=100)throw syncError("Η λήψη σταμάτησε στο όριο 100 σελίδων. Επαναλάβετε τον συγχρονισμό.");
    }
  }while(page);
  if(delegated||continuationPending){
    if(delegated)await verifyDelegatedMyDataSync(prisma,req);
    const message=continuationPending?"Η λήψη έφτασε τις 100 σελίδες. Θα συνεχιστεί από την επόμενη σελίδα στον επόμενο συγχρονισμό.":created.length?`${created.length} νέα παραστατικά μπήκαν στη θυρίδα.`:"Δεν βρέθηκαν νέα παραστατικά για τη θυρίδα.";
    return {ok:true,environment:integration.environment,fetched,created:created.length,duplicates,ignored,ignoredVat,ignoredBranch,missingMark,...(scope?{continuationPending}:{}),
      documents:created,originalsDownloaded:0,originalsFailed:0,existingPhotosLinked:0,stockUpdated:false,fiscalTransmission:false,message};
  }
  // Bounded retries only for records received after this feature; no historic mass ingestion.
  const panormouProduction=store.id===panormouStoreId && source==="AADE_MYDATA_PRODUCTION";
  const panormouProviderPattern=panormouProduction?providerOriginalRecoveryLinkPattern({
    includeExistingImpact:true,
    includeAdditionalVerifiedFormats:true,
  }):null;
  const pending=await prisma.$queryRaw`SELECT m."inboxId" FROM "MyDataInboundDocument" m JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId" WHERE m."companyId"=${req.user.companyId} AND m."storeId"=${store.id} AND m."rawPayload"->>'originalPending'='true' AND i."attachmentId" IS NULL AND i."status"='RECEIVED' AND COALESCE((m."rawPayload"->>'originalAttempts')::int,0)<3
    AND (${receiveFromDate}::date IS NULL OR (m."issueDate">=${receiveFromDate}::date AND m."rawPayload"->>'source'=${source}))
    AND (NOT ${panormouProduction} OR (
      m."issueDate">=DATE '2026-11-01'
      AND m."rawPayload"->>'source'=${source}
      AND m."rawPayload"->>'xml' ~* ${panormouProviderPattern}
    ))
    ORDER BY m."fetchedAt" ASC LIMIT 3`;
  let originalsDownloaded=0,originalsFailed=0;
  for(const item of pending){try{
    const result=await acquireOriginal(prisma,req.user.companyId,store.id,item.inboxId,req.user.id,Boolean(req.license?.superAdminBypass||(req.license?.activeModules?.includes("AI_READER")&&req.license?.activeModules?.includes("INVENTORY"))));
    if(result.downloaded)originalsDownloaded++;
  }catch{
    originalsFailed++;
    await prisma.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"||jsonb_build_object('originalAttempts',COALESCE(("rawPayload"->>'originalAttempts')::int,0)+1,'originalError','Το πρωτότυπο δεν κατέβηκε. Ελέγξτε τη διαθεσιμότητα και τον πάροχο.') WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "inboxId"=${item.inboxId}`;
  }}
  const canPrepareDraft=Boolean(req.license?.superAdminBypass||(req.license?.activeModules?.includes("AI_READER")&&req.license?.activeModules?.includes("INVENTORY")));
  const recovery = await recoverHistoricalOriginals({
    db: prisma, companyId: req.user.companyId, storeId: store.id, userId: req.user.id, source,
    reconcileExisting: canPrepareDraft,
    excludeInboxIds: [...pending.map(item => item.inboxId), ...created.map(item => item.id)],
  });
  originalsDownloaded += recovery.downloaded;
  originalsFailed += recovery.failed;
  const existingPhotosLinked=canPrepareDraft?await prisma.$transaction(tx=>linkStoredPosInvoicePhotos(tx,{companyId:req.user.companyId,storeId:store.id})):0;
  if(canPrepareDraft){
    const draftsToPrepare=await prisma.$queryRaw`
      SELECT m."inboxId" FROM "MyDataInboundDocument" m
      JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
      JOIN "PurchaseOrder" o ON o."id"=m."rawPayload"->>'mydataDraftOrderId' AND o."companyId"=m."companyId" AND o."storeId"=m."storeId"
      WHERE m."companyId"=${req.user.companyId} AND m."storeId"=${store.id}
        AND i."attachmentId" IS NOT NULL AND i."status"='IN_REVIEW' AND o."status"='NEW'
        AND (m."rawPayload"->>'automaticPrefillChecked' IS DISTINCT FROM 'true' OR m."rawPayload"->>'packagingPrefillChecked' IS DISTINCT FROM 'true')
        AND NOT EXISTS (SELECT 1 FROM "PurchaseOrderLine" l WHERE l."orderId"=o."id")
      ORDER BY m."fetchedAt",m."id" LIMIT 10`;
    if(panormouProduction){
      // Historical PDF recovery can leave an eligible credit in the inbox without an order.
      const storedCredits=await prisma.$queryRaw`
        SELECT m."inboxId" FROM "MyDataInboundDocument" m
        JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
        JOIN "DocumentAttachment" a ON a."id"=i."attachmentId" AND a."companyId"=i."companyId" AND a."storeId"=i."storeId"
        WHERE m."companyId"=${req.user.companyId} AND m."storeId"=${store.id}
          AND m."rawPayload"->>'source'=${source} AND m."issueDate">=DATE '2026-11-01' AND m."issueDate"<DATE '2026-12-01'
          AND m."invoiceType"='5.2' AND m."currency"='EUR' AND m."totalGross">0 AND i."status"='RECEIVED'
          AND a."mimeType"='application/pdf' AND a."documentType"='AI_READER_SOURCE'
          AND m."rawPayload"->>'originalDownloaded'='true'
          AND m."rawPayload"->>'mydataDraftOrderId' IS NULL AND m."rawPayload"->>'mydataDraftDocumentId' IS NULL
        ORDER BY m."fetchedAt",m."id" LIMIT 3`;
      draftsToPrepare.push(...storedCredits);
    }
    for(const item of draftsToPrepare){
      try{
        await acquireOriginal(prisma,req.user.companyId,store.id,item.inboxId,req.user.id,true);
      }catch{
        // A transient failure leaves the draft eligible for the next sync.
        continue;
      }
    }
  }
  const message=created.length?`${created.length} νέα παραστατικά μπήκαν στα Πρόχειρα.`:fetched===0?"Η ΑΑΔΕ δεν επέστρεψε εισερχόμενα παραστατικά για αυτή τη σύνδεση και αυτό το διάστημα ΜΑΡΚ.":`Η ΑΑΔΕ επέστρεψε ${fetched} παραστατικά: ${duplicates} υπήρχαν ήδη, ${ignoredVat} δεν ταίριαξαν με το ΑΦΜ εταιρείας, ${missingMark} δεν είχαν ΜΑΡΚ. Δεν δημιουργήθηκε πρόχειρο.`;
  return {ok:true,environment:integration.environment,fetched,created:created.length,duplicates,ignored,ignoredVat,ignoredBranch,missingMark,documents:created,originalsDownloaded,originalsFailed,existingPhotosLinked,stockUpdated:false,fiscalTransmission:false,message:message+` Πρωτότυπα PDF: ${originalsDownloaded} λήψεις, ${originalsFailed} σε αναμονή/έλεγχο.`};
}

router.post("/documents/mydata/sync",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{try{
  if(req.user.staffAccess===true){
    const {storeId}=z.object({storeId:z.string().min(1).max(160)}).strict().parse(req.body);
    if(req.user.storeId!==storeId||req.staffGrant?.capability!==delegatedSyncCapability)
      throw syncError("Δεν επιτρέπεται συγχρονισμός myDATA σε αυτό το κατάστημα.",403);
  }else if(!canSync(req))return res.status(403).json({error:"Ο συγχρονισμός myDATA επιτρέπεται μόνο σε εξουσιοδοτημένο χρήστη BackOffice."});
  res.json(await syncMyDataStore(req));
}catch(error){next(error)}});

// Uses the same receiving service and entitlement checks; never approves or pays.
let workerStarted=false,workerBusy=false;
export async function runMyDataReceivingSweep(){
    if(backgroundDrain.stopping||workerBusy)return;workerBusy=true;
    try{
      await Promise.all([ensureSchema(),ensureStoreIntegrationSchema()]);
      const targets=await prisma.$queryRaw`SELECT c."companyId",c."storeId" FROM "StoreIntegrationCredential" c JOIN "Store" s ON s."id"=c."storeId" AND s."companyId"=c."companyId" WHERE c."kind"='MYDATA' AND c."enabled"=true AND c."environment"='PRODUCTION' AND s."active"=true AND c."companyId" NOT ILIKE 'customer-demo-%' AND c."storeId" NOT ILIKE 'customer-demo-%' ORDER BY c."companyId",c."storeId"`;
      for(const target of targets){if(backgroundDrain.stopping)break;if(isCustomerDemoTenant(target))continue;try{
        const state=await companyModuleState(target.companyId);
        if(!state?.licenseAllowed||!state.activeModules.includes("DOCUMENTS"))continue;
        const owners=await prisma.$queryRaw`SELECT u."id" FROM "User" u WHERE u."role"='OWNER' AND (u."companyId"=${target.companyId} OR EXISTS (SELECT 1 FROM "OwnerCompanyAccess" a WHERE a."ownerId"=u."id" AND a."companyId"=${target.companyId})) ORDER BY u."id" LIMIT 1`;
        const owner=owners[0];
        if(!owner)continue;
        const lifecycle=await prisma.$transaction(tx=>readLifecycleGeneration(tx,target));
        if(lifecycle.maintenance||lifecycle.retired)continue;
        // No frozen browser payload is promoted: the service reloads current
        // credentials/cursor inside its existing locked receiving transaction.
        await withLifecycleContext({[target.storeId]:lifecycle.generation},()=>syncMyDataStore({user:{id:owner.id,companyId:target.companyId},body:{storeId:target.storeId},license:state}));
      }catch{console.warn("myDATA scheduled receiving failed; review the store integration status.")}}
    }catch{console.warn("myDATA scheduled receiving unavailable.")}finally{workerBusy=false}
}
export function startMyDataReceivingWorker(){
  if(backgroundDrain.stopping||workerStarted)return;workerStarted=true;
  const timer=setInterval(()=>backgroundDrain.track(runMyDataReceivingSweep()),15*60*1000);timer.unref?.();
  backgroundDrain.onStop(()=>clearInterval(timer));
}

router.get("/documents/mydata/status",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{try{
  await Promise.all([ensureSchema(),ensureStoreIntegrationSchema()]);const storeId=String(req.query.storeId||"");
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId},select:{id:true}});if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  const configured=await prisma.$queryRaw`SELECT "environment","enabled" FROM "StoreIntegrationCredential" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "kind"='MYDATA' LIMIT 1`;
  const stats=await prisma.$queryRaw`SELECT COUNT(*)::int AS "documents",MAX("fetchedAt") AS "lastSyncAt" FROM "MyDataInboundDocument" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id}`;
  const lifecycle=await prisma.$transaction(tx=>readLifecycleGeneration(tx,{companyId:req.user.companyId,storeId:store.id})),status=syncStatus.get(syncStatusKey(req.user.companyId,store.id,lifecycle.generation));
  const row=configured[0];res.json({configured:Boolean(row),enabled:Boolean(row?.enabled),environment:row?.environment||null,labLocked:!["SANDBOX","PRODUCTION"].includes(row?.environment),documents:stats[0]?.documents||0,lastSyncAt:status?.lastSyncAt||null,lastReceivedAt:stats[0]?.lastSyncAt||null,lastSyncError:status?.lastSyncError||null,serverAutomatic:row?.environment==="PRODUCTION",automaticIntervalMinutes:15,stockUpdated:false});
}catch(error){next(error)}});

export default router;

