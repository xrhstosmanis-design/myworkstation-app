import crypto from "crypto";
import * as XLSX from "xlsx";
import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import {decryptStoreIntegrationCredentials,ensureStoreIntegrationSchema} from "./platform-store-integrations.js";
import {invoiceNodes,invoiceSummary,myDataError,nextPage,unwrapMyDataXml} from "../mydata-xml.js";
import {archiveQuery,archiveExportRows,archiveReportHtml} from "../invoice-archive.js";

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

router.get("/documents/inbox/archive",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{try{
  if(!canSync(req))return res.status(403).json({error:"Το αρχείο επιτρέπεται μόνο σε εξουσιοδοτημένο χρήστη BackOffice."});
  const store=await prisma.store.findFirst({where:{id:String(req.query.storeId||""),companyId:req.user.companyId},select:{id:true,name:true}});
  if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  await ensureSchema();
  const format=req.query.format||"",exporting=["xlsx","pdf"].includes(format);
  if(format&&!exporting)return res.status(400).json({error:"Μη έγκυρη μορφή εξαγωγής."});
  const offset=exporting?0:Math.max(0,Math.floor(Number(req.query.offset)||0));
  const filters={q:req.query.q,supplier:req.query.supplier,date:req.query.date,id:req.query.id,limit:exporting?20001:100,offset};
  const query=archiveQuery(req.user.companyId,store.id,filters),count=archiveQuery(req.user.companyId,store.id,filters,true),all=archiveQuery(req.user.companyId,store.id,{},true);
  const [rows,counts,totals]=await Promise.all([prisma.$queryRawUnsafe(query.sql,...query.values),prisma.$queryRawUnsafe(count.sql,...count.values),prisma.$queryRawUnsafe(all.sql,...all.values)]);
  if(exporting){
    if(rows.length>20000)return res.status(409).json({error:"Η εξαγωγή ξεπερνά 20.000 εγγραφές. Περιορίστε με ημερομηνία ή προμηθευτή."});
    if(format==="pdf")return res.json({html:archiveReportHtml(rows,store.name),count:rows.length});
    const workbook=XLSX.utils.book_new(),sheet=XLSX.utils.json_to_sheet(archiveExportRows(rows));
    sheet["!cols"]=[{wch:14},{wch:42},{wch:15},{wch:14},{wch:18},{wch:22},{wch:16},{wch:12},{wch:16},{wch:12},{wch:34},{wch:25},{wch:60}];
    XLSX.utils.book_append_sheet(workbook,sheet,"Παραστατικά");
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([["Κατάστημα",store.name],["Πλήθος",rows.length],["Περιεχόμενο","Στοιχεία θυρίδας/myDATA. Δεν είναι πρωτότυπα PDF ή τελικές καταχωρίσεις."],["Φίλτρα",JSON.stringify({q:filters.q||"",supplier:filters.supplier||"",date:filters.date||""})]]),"Πληροφορίες");
    const buffer=XLSX.write(workbook,{type:"buffer",bookType:"xlsx"});
    return res.json({filename:"mydata-invoices.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",dataUrl:`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${buffer.toString("base64")}`,count:rows.length});
  }
  const suppliers=await prisma.$queryRaw`SELECT DISTINCT s."name" FROM "DocumentInbox" i JOIN "Supplier" s ON s."id"=i."supplierId" AND s."companyId"=i."companyId" WHERE i."companyId"=${req.user.companyId} AND i."storeId"=${store.id} ORDER BY s."name"`;
  res.json({items:rows,total:counts[0]?.count||0,archiveTotal:totals[0]?.count||0,offset,limit:100,suppliers:suppliers.map(s=>s.name)});
}catch(error){next(error)}});

router.post("/documents/mydata/sync",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{try{
  if(!canSync(req))return res.status(403).json({error:"Ο συγχρονισμός myDATA επιτρέπεται μόνο σε εξουσιοδοτημένο χρήστη BackOffice."});
  await Promise.all([ensureSchema(),ensureStoreIntegrationSchema()]);const storeId=String(req.body?.storeId||"");
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId},select:{id:true,name:true,company:{select:{taxId:true}}}});
  if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  const companyVat=String(store.company?.taxId||"").replace(/\s/g,"");
  if(!/^\d{9}$/.test(companyVat))return res.status(409).json({error:"Πρέπει πρώτα να οριστεί το εννεαψήφιο ΑΦΜ της εταιρείας για ασφαλή λήψη myDATA."});
  const rows=await prisma.$queryRaw`SELECT "environment","credentialsEnc","enabled" FROM "StoreIntegrationCredential" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "kind"='MYDATA' LIMIT 1`;
  const integration=rows[0];if(!integration?.enabled)return res.status(409).json({error:"Δεν έχει ενεργοποιηθεί σύνδεση myDATA για αυτό το κατάστημα."});
  if(!["SANDBOX","PRODUCTION"].includes(integration.environment))return res.status(409).json({error:"Μη έγκυρο περιβάλλον myDATA."});
  const credentials=decryptStoreIntegrationCredentials(integration.credentialsEnc);
  // The cursor belongs to this store AND environment. Never reuse a sandbox MARK in production.
  const source=`AADE_MYDATA_${integration.environment}`;
  const previous=await prisma.$queryRaw`SELECT COALESCE(MAX(NULLIF("mark",'')::numeric),0)::text AS "lastMark" FROM "MyDataInboundDocument" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "rawPayload"->>'source'=${source}`;
  const mark=previous[0]?.lastMark||"0",created=[];let duplicates=0,ignored=0,ignoredVat=0,missingMark=0,fetched=0,page=null;
  const pages=new Set();
  do{
    const url=new URL(endpoint(integration.environment));url.searchParams.set("mark",mark);
    if(page){url.searchParams.set("nextPartitionKey",page.partition);url.searchParams.set("nextRowKey",page.row)}
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
      await tx.$executeRaw`INSERT INTO "MyDataInboundDocument" ("id","companyId","storeId","inboxId","mark","uid","issuerVat","counterpartVat","series","documentNumber","issueDate","invoiceType","currency","totalNet","totalVat","totalGross","rawPayload") VALUES (${recordId},${req.user.companyId},${store.id},${inboxId},${doc.mark},${doc.uid},${doc.issuerVat},${doc.counterpartVat},${doc.series},${doc.documentNumber},${doc.issueDate?new Date(`${doc.issueDate}T00:00:00Z`):null},${doc.invoiceType},${doc.currency},${doc.totalNet},${doc.totalVat},${doc.totalGross},${JSON.stringify({source,xml:invoice})}::jsonb)`;
      return {id:inboxId,...doc,supplierName:supplier?.name||null};
    });
    if(result)created.push(result);else duplicates++;
  }
    page=nextPage(xml);
    if(page){const key=`${page.partition}:${page.row}`;if(pages.has(key))throw syncError("Η σελιδοποίηση myDATA επανέλαβε την ίδια σελίδα.");pages.add(key)}
    if(pages.size>=100)throw syncError("Η λήψη σταμάτησε στο όριο 100 σελίδων. Επαναλάβετε τον συγχρονισμό.");
  }while(page);
  const message=created.length?`${created.length} νέα παραστατικά μπήκαν στα Πρόχειρα.`:fetched===0?"Η ΑΑΔΕ δεν επέστρεψε εισερχόμενα παραστατικά για αυτή τη σύνδεση και αυτό το διάστημα ΜΑΡΚ.":`Η ΑΑΔΕ επέστρεψε ${fetched} παραστατικά: ${duplicates} υπήρχαν ήδη, ${ignoredVat} δεν ταίριαξαν με το ΑΦΜ εταιρείας, ${missingMark} δεν είχαν ΜΑΡΚ. Δεν δημιουργήθηκε πρόχειρο.`;
  res.json({ok:true,environment:integration.environment,fetched,created:created.length,duplicates,ignored,ignoredVat,missingMark,documents:created,stockUpdated:false,fiscalTransmission:false,message});
}catch(error){next(error)}});

router.get("/documents/mydata/status",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{try{
  await Promise.all([ensureSchema(),ensureStoreIntegrationSchema()]);const storeId=String(req.query.storeId||"");
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId},select:{id:true}});if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  const configured=await prisma.$queryRaw`SELECT "environment","enabled" FROM "StoreIntegrationCredential" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "kind"='MYDATA' LIMIT 1`;
  const stats=await prisma.$queryRaw`SELECT COUNT(*)::int AS "documents",MAX("fetchedAt") AS "lastSyncAt" FROM "MyDataInboundDocument" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id}`;
  const row=configured[0];res.json({configured:Boolean(row),enabled:Boolean(row?.enabled),environment:row?.environment||null,labLocked:!["SANDBOX","PRODUCTION"].includes(row?.environment),documents:stats[0]?.documents||0,lastSyncAt:stats[0]?.lastSyncAt||null,automaticIntervalMinutes:10,stockUpdated:false});
}catch(error){next(error)}});

export default router;
