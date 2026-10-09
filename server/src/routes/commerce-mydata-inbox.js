import {assertCustomerDemoOutboundAllowed,isCustomerDemoTenant} from "../customer-demo-runtime.js";
import {backgroundDrain} from "../server-shutdown.js";
import crypto from "crypto";
import * as XLSX from "xlsx";
import {Router} from "express";
import {prisma} from "../prisma.js";
import {companyModuleState,requireCompanyModule} from "../middleware/module-access.js";
import {decryptStoreIntegrationCredentials,ensureStoreIntegrationSchema} from "./platform-store-integrations.js";
import {invoiceNodes,invoiceSummary,myDataError,nextPage,unwrapMyDataXml} from "../mydata-xml.js";
import {archiveQuery,archiveExportRows,archiveReportHtml} from "../invoice-archive.js";
import {acquireOriginal} from "../mydata-original.js";

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

router.post("/documents/inbox/:inboxId/original",requireCompanyModule("DOCUMENTS"),requireCompanyModule("AI_READER"),requireCompanyModule("INVENTORY"),async(req,res,next)=>{try{
  if(!canSync(req))return res.status(403).json({error:"Ο έλεγχος επιτρέπεται μόνο σε εξουσιοδοτημένο χρήστη BackOffice."});
  const store=await prisma.store.findFirst({where:{id:String(req.body?.storeId||""),companyId:req.user.companyId},select:{id:true}});
  if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  await ensureSchema();
  res.json(await acquireOriginal(prisma,req.user.companyId,store.id,req.params.inboxId,req.user.id,true));
}catch(error){next(error)}});

router.get("/documents/inbox/archive",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{try{
  if(!canSync(req))return res.status(403).json({error:"Το αρχείο επιτρέπεται μόνο σε εξουσιοδοτημένο χρήστη BackOffice."});
  const store=await prisma.store.findFirst({where:{id:String(req.query.storeId||""),companyId:req.user.companyId},select:{id:true,name:true}});
  if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  await ensureSchema();
  const format=req.query.format||"",exporting=["xlsx","pdf"].includes(format);
  if(format&&!exporting)return res.status(400).json({error:"Μη έγκυρη μορφή εξαγωγής."});
  const offset=exporting?0:Math.max(0,Math.floor(Number(req.query.offset)||0));
  const filters={q:req.query.q,supplier:req.query.supplier,date:req.query.date,dateFrom:req.query.dateFrom,dateTo:req.query.dateTo,receivedToday:req.query.receivedToday==="true",id:req.query.id,limit:exporting?20001:100,offset};
  const query=archiveQuery(req.user.companyId,store.id,filters),count=archiveQuery(req.user.companyId,store.id,filters,true),all=archiveQuery(req.user.companyId,store.id,{},true);
  const [rows,counts,totals]=await Promise.all([prisma.$queryRawUnsafe(query.sql,...query.values),prisma.$queryRawUnsafe(count.sql,...count.values),prisma.$queryRawUnsafe(all.sql,...all.values)]);
  if(exporting){
    if(rows.length>20000)return res.status(409).json({error:"Η εξαγωγή ξεπερνά 20.000 εγγραφές. Περιορίστε με ημερομηνία ή προμηθευτή."});
    if(format==="pdf")return res.json({html:archiveReportHtml(rows,store.name),count:rows.length});
    const workbook=XLSX.utils.book_new(),sheet=XLSX.utils.json_to_sheet(archiveExportRows(rows));
    sheet["!cols"]=[{wch:14},{wch:25},{wch:42},{wch:15},{wch:14},{wch:18},{wch:22},{wch:16},{wch:12},{wch:16},{wch:12},{wch:34},{wch:25},{wch:60}];
    XLSX.utils.book_append_sheet(workbook,sheet,"Παραστατικά");
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([["Κατάστημα",store.name],["Πλήθος",rows.length],["Περιεχόμενο","Στοιχεία θυρίδας/myDATA. Δεν είναι πρωτότυπα PDF ή τελικές καταχωρίσεις."],["Φίλτρα",JSON.stringify({q:filters.q||"",supplier:filters.supplier||"",date:filters.date||"",dateFrom:filters.dateFrom||"",dateTo:filters.dateTo||"",receivedToday:filters.receivedToday})]]),"Πληροφορίες");
    const buffer=XLSX.write(workbook,{type:"buffer",bookType:"xlsx"});
    return res.json({filename:"mydata-invoices.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",dataUrl:`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${buffer.toString("base64")}`,count:rows.length});
  }
  const suppliers=await prisma.$queryRaw`SELECT DISTINCT s."name" FROM "DocumentInbox" i JOIN "Supplier" s ON s."id"=i."supplierId" AND s."companyId"=i."companyId" WHERE i."companyId"=${req.user.companyId} AND i."storeId"=${store.id} ORDER BY s."name"`;
  res.json({items:rows,total:counts[0]?.count||0,archiveTotal:totals[0]?.count||0,offset,limit:100,suppliers:suppliers.map(s=>s.name)});
}catch(error){next(error)}});

const syncInFlight=new Map(),syncStatus=new Map();
export function syncMyDataStore(req){
  assertCustomerDemoOutboundAllowed({companyId:req.user.companyId,storeId:req.body.storeId});
  const key=String(req.user.companyId)+":"+String(req.body.storeId);
  if(syncInFlight.has(key))return syncInFlight.get(key);
  const run=prisma.$transaction(async lock=>{
    const held=await lock.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtextextended(${"mydata:"+key},0)) AS "held"`;
    if(!held[0]?.held)throw syncError("Υπάρχει ήδη λήψη myDATA σε εξέλιξη.",409);
    return performSync(req);
  },{timeout:3600000,maxWait:5000}).then(result=>{syncStatus.set(key,{lastSyncAt:new Date().toISOString(),lastSyncError:null});return result},error=>{syncStatus.set(key,{...syncStatus.get(key),lastSyncError:"Ο τελευταίος έλεγχος δεν ολοκληρώθηκε."});throw error}).finally(()=>syncInFlight.delete(key));
  syncInFlight.set(key,run);return run;
}
async function performSync(req){
  assertCustomerDemoOutboundAllowed({companyId:req.user.companyId,storeId:req.body.storeId});
  await Promise.all([ensureSchema(),ensureStoreIntegrationSchema()]);const storeId=String(req.body?.storeId||"");
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId},select:{id:true,name:true,company:{select:{taxId:true}}}});
  if(!store)throw syncError("Δεν βρέθηκε το κατάστημα.",404);
  const companyVat=String(store.company?.taxId||"").replace(/\s/g,"");
  if(!/^\d{9}$/.test(companyVat))throw syncError("Πρέπει πρώτα να οριστεί το εννεαψήφιο ΑΦΜ της εταιρείας για ασφαλή λήψη myDATA.",409);
  const rows=await prisma.$queryRaw`SELECT "environment","credentialsEnc","enabled" FROM "StoreIntegrationCredential" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "kind"='MYDATA' LIMIT 1`;
  const integration=rows[0];if(!integration?.enabled)throw syncError("Δεν έχει ενεργοποιηθεί σύνδεση myDATA για αυτό το κατάστημα.",409);
  if(!["SANDBOX","PRODUCTION"].includes(integration.environment))throw syncError("Μη έγκυρο περιβάλλον myDATA.",409);
  const credentials=decryptStoreIntegrationCredentials(integration.credentialsEnc);
  // The cursor belongs to this store AND environment. Never reuse a sandbox MARK in production.
  const source=`AADE_MYDATA_${integration.environment}`;
  const previous=await prisma.$queryRaw`SELECT COALESCE(MAX(NULLIF("mark",'')::numeric),0)::text AS "lastMark" FROM "MyDataInboundDocument" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "rawPayload"->>'source'=${source}`;
  const mark=previous[0]?.lastMark||"0",created=[];let duplicates=0,ignored=0,ignoredVat=0,missingMark=0,fetched=0,page=null;
  const pages=new Set();
  do{
    const url=new URL(endpoint(integration.environment));url.searchParams.set("mark",mark);
    if(page){url.searchParams.set("nextPartitionKey",page.partition);url.searchParams.set("nextRowKey",page.row)}
    assertCustomerDemoOutboundAllowed({companyId:req.user.companyId,storeId:store.id});
    const response=await fetch(url,{headers:{"aade-user-id":credentials.accountId,"Ocp-Apim-Subscription-Key":credentials.secret,"Accept":"application/xml"},signal:AbortSignal.timeout(30000)});
    const responseXml=await response.text();if(!response.ok)throw syncError(`Το myDATA απάντησε με σφάλμα ${response.status}. Δεν αποθηκεύτηκε παραστατικό.`);
    const xml=unwrapMyDataXml(responseXml);
    const remoteError=myDataError(xml);if(remoteError)throw syncError(`Το myDATA δεν ολοκλήρωσε τη λήψη: ${remoteError}`,409);
    const invoices=invoiceNodes(xml);fetched+=invoices.length;
  for(const invoice of invoices){
    const doc=invoiceSummary(invoice);if(!doc.mark){ignored++;missingMark++;continue}
    if(doc.counterpartVat!==companyVat){ignored++;ignoredVat++;continue}
    const result=await prisma.$transaction(async tx=>{
      const existing=await tx.$queryRaw`SELECT "inboxId" FROM "MyDataInboundDocument" WHERE "companyId"=${req.user.companyId} AND "mark"=${doc.mark} LIMIT 1`;
      if(existing[0])return null;
      const suppliers=doc.issuerVat?await tx.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "companyId"=${req.user.companyId} AND "taxId"=${doc.issuerVat} LIMIT 1`:[];
      const supplier=suppliers[0]||null;
      const inboxId=crypto.randomUUID(),recordId=crypto.randomUUID(),title=["myDATA",doc.series,doc.documentNumber].filter(Boolean).join(" ");
      const note=`${title} • MARK ${doc.mark} • ${doc.totalGross.toFixed(2)} € • Πρόχειρο — απαιτείται πρωτότυπο PDF/OCR και επιβεβαίωση πριν την αποθήκη`;
      await tx.$executeRaw`INSERT INTO "DocumentInbox" ("id","companyId","storeId","supplierId","status","note","responsibleName","createdByUserId") VALUES (${inboxId},${req.user.companyId},${store.id},${supplier?.id||null},'RECEIVED',${note},'Αυτόματη λήψη myDATA',${req.user.id})`;
      await tx.$executeRaw`INSERT INTO "MyDataInboundDocument" ("id","companyId","storeId","inboxId","mark","uid","issuerVat","counterpartVat","series","documentNumber","issueDate","invoiceType","currency","totalNet","totalVat","totalGross","rawPayload") VALUES (${recordId},${req.user.companyId},${store.id},${inboxId},${doc.mark},${doc.uid},${doc.issuerVat},${doc.counterpartVat},${doc.series},${doc.documentNumber},${doc.issueDate?new Date(`${doc.issueDate}T00:00:00Z`):null},${doc.invoiceType},${doc.currency},${doc.totalNet},${doc.totalVat},${doc.totalGross},${JSON.stringify({source,xml:invoice,originalPending:true})}::jsonb)`;
      return {id:inboxId,...doc,supplierName:supplier?.name||null};
    });
    if(result)created.push(result);else duplicates++;
  }
    page=nextPage(xml);
    if(page){const key=`${page.partition}:${page.row}`;if(pages.has(key))throw syncError("Η σελιδοποίηση myDATA επανέλαβε την ίδια σελίδα.");pages.add(key)}
    if(pages.size>=100)throw syncError("Η λήψη σταμάτησε στο όριο 100 σελίδων. Επαναλάβετε τον συγχρονισμό.");
  }while(page);
  // Bounded retries only for records received after this feature; no historic mass ingestion.
  const pending=await prisma.$queryRaw`SELECT m."inboxId" FROM "MyDataInboundDocument" m JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId" WHERE m."companyId"=${req.user.companyId} AND m."storeId"=${store.id} AND m."rawPayload"->>'originalPending'='true' AND i."attachmentId" IS NULL AND i."status"='RECEIVED' AND COALESCE((m."rawPayload"->>'originalAttempts')::int,0)<3 ORDER BY m."fetchedAt" ASC LIMIT 3`;
  let originalsDownloaded=0,originalsFailed=0;
  for(const item of pending){try{
    const result=await acquireOriginal(prisma,req.user.companyId,store.id,item.inboxId,req.user.id,Boolean(req.license?.superAdminBypass||(req.license?.activeModules?.includes("AI_READER")&&req.license?.activeModules?.includes("INVENTORY"))));
    if(result.downloaded)originalsDownloaded++;
  }catch{
    originalsFailed++;
    await prisma.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"||jsonb_build_object('originalAttempts',COALESCE(("rawPayload"->>'originalAttempts')::int,0)+1,'originalError','Το πρωτότυπο δεν κατέβηκε. Ελέγξτε τη διαθεσιμότητα και τον πάροχο.') WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "inboxId"=${item.inboxId}`;
  }}
  const message=created.length?`${created.length} νέα παραστατικά μπήκαν στα Πρόχειρα.`:fetched===0?"Η ΑΑΔΕ δεν επέστρεψε εισερχόμενα παραστατικά για αυτή τη σύνδεση και αυτό το διάστημα ΜΑΡΚ.":`Η ΑΑΔΕ επέστρεψε ${fetched} παραστατικά: ${duplicates} υπήρχαν ήδη, ${ignoredVat} δεν ταίριαξαν με το ΑΦΜ εταιρείας, ${missingMark} δεν είχαν ΜΑΡΚ. Δεν δημιουργήθηκε πρόχειρο.`;
  return {ok:true,environment:integration.environment,fetched,created:created.length,duplicates,ignored,ignoredVat,missingMark,documents:created,originalsDownloaded,originalsFailed,stockUpdated:false,fiscalTransmission:false,message:message+` Πρωτότυπα PDF: ${originalsDownloaded} λήψεις, ${originalsFailed} σε αναμονή/έλεγχο.`};
}

router.post("/documents/mydata/sync",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{try{
  if(!canSync(req))return res.status(403).json({error:"Ο συγχρονισμός myDATA επιτρέπεται μόνο σε εξουσιοδοτημένο χρήστη BackOffice."});
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
        await syncMyDataStore({user:{id:owner.id,companyId:target.companyId},body:{storeId:target.storeId},license:state});
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
  const row=configured[0];res.json({configured:Boolean(row),enabled:Boolean(row?.enabled),environment:row?.environment||null,labLocked:!["SANDBOX","PRODUCTION"].includes(row?.environment),documents:stats[0]?.documents||0,lastSyncAt:syncStatus.get(req.user.companyId+":"+store.id)?.lastSyncAt||null,lastReceivedAt:stats[0]?.lastSyncAt||null,lastSyncError:syncStatus.get(req.user.companyId+":"+store.id)?.lastSyncError||null,serverAutomatic:row?.environment==="PRODUCTION",automaticIntervalMinutes:15,stockUpdated:false});
}catch(error){next(error)}});

export default router;
