import crypto from "crypto";
import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import {decryptStoreIntegrationCredentials,ensureStoreIntegrationSchema} from "./platform-store-integrations.js";
import {invoiceNodes,invoiceSummary,myDataError} from "../mydata-xml.js";

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

router.post("/documents/mydata/sync",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{try{
  if(!canSync(req))return res.status(403).json({error:"Ο συγχρονισμός myDATA επιτρέπεται μόνο σε εξουσιοδοτημένο χρήστη BackOffice."});
  await Promise.all([ensureSchema(),ensureStoreIntegrationSchema()]);const storeId=String(req.body?.storeId||"");
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId},select:{id:true,name:true}});
  if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  const rows=await prisma.$queryRaw`SELECT "environment","credentialsEnc","enabled" FROM "StoreIntegrationCredential" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "kind"='MYDATA' LIMIT 1`;
  const integration=rows[0];if(!integration?.enabled)return res.status(409).json({error:"Δεν έχει ενεργοποιηθεί σύνδεση myDATA για αυτό το κατάστημα."});
  if(integration.environment!=="SANDBOX")return res.status(409).json({error:"Η λήψη myDATA παραμένει κλειδωμένη σε LAB/SANDBOX. Δεν έγινε σύνδεση παραγωγής."});
  const credentials=decryptStoreIntegrationCredentials(integration.credentialsEnc);
  const previous=await prisma.$queryRaw`SELECT COALESCE(MAX(NULLIF("mark",'')::numeric),0)::text AS "lastMark" FROM "MyDataInboundDocument" WHERE "companyId"=${req.user.companyId}`;
  const url=new URL(endpoint(integration.environment));url.searchParams.set("mark",previous[0]?.lastMark||"0");
  const response=await fetch(url,{headers:{"aade-user-id":credentials.accountId,"Ocp-Apim-Subscription-Key":credentials.secret,"Accept":"application/xml"},signal:AbortSignal.timeout(30000)});
  const xml=await response.text();if(!response.ok)throw syncError(`Το myDATA απάντησε με σφάλμα ${response.status}. Δεν αποθηκεύτηκε παραστατικό.`);
  const remoteError=myDataError(xml);if(remoteError)throw syncError(`Το myDATA δεν ολοκλήρωσε τη λήψη: ${remoteError}`,409);
  const invoices=invoiceNodes(xml),created=[];let duplicates=0,ignored=0;
  for(const invoice of invoices){
    const doc=invoiceSummary(invoice);if(!doc.mark){ignored++;continue}
    const result=await prisma.$transaction(async tx=>{
      const existing=await tx.$queryRaw`SELECT "inboxId" FROM "MyDataInboundDocument" WHERE "companyId"=${req.user.companyId} AND "mark"=${doc.mark} LIMIT 1`;
      if(existing[0])return null;
      const supplier=doc.issuerVat?await tx.supplier.findFirst({where:{companyId:req.user.companyId,taxId:doc.issuerVat},select:{id:true,name:true}}):null;
      const inboxId=crypto.randomUUID(),recordId=crypto.randomUUID(),title=["myDATA",doc.series,doc.documentNumber].filter(Boolean).join(" ");
      const note=`${title} • MARK ${doc.mark} • ${doc.totalGross.toFixed(2)} € • Πρόχειρο — απαιτείται πρωτότυπο PDF/OCR και επιβεβαίωση πριν την αποθήκη`;
      await tx.$executeRaw`INSERT INTO "DocumentInbox" ("id","companyId","storeId","supplierId","status","note","responsibleName","createdByUserId") VALUES (${inboxId},${req.user.companyId},${store.id},${supplier?.id||null},'RECEIVED',${note},'Αυτόματη λήψη myDATA',${req.user.id})`;
      await tx.$executeRaw`INSERT INTO "MyDataInboundDocument" ("id","companyId","storeId","inboxId","mark","uid","issuerVat","counterpartVat","series","documentNumber","issueDate","invoiceType","currency","totalNet","totalVat","totalGross","rawPayload") VALUES (${recordId},${req.user.companyId},${store.id},${inboxId},${doc.mark},${doc.uid},${doc.issuerVat},${doc.counterpartVat},${doc.series},${doc.documentNumber},${doc.issueDate?new Date(`${doc.issueDate}T00:00:00Z`):null},${doc.invoiceType},${doc.currency},${doc.totalNet},${doc.totalVat},${doc.totalGross},${JSON.stringify({source:"AADE_MYDATA_SANDBOX",xml:invoice})}::jsonb)`;
      return {id:inboxId,...doc,supplierName:supplier?.name||null};
    });
    if(result)created.push(result);else duplicates++;
  }
  res.json({ok:true,environment:"SANDBOX",fetched:invoices.length,created:created.length,duplicates,ignored,documents:created,stockUpdated:false,fiscalTransmission:false,message:created.length?`${created.length} νέα παραστατικά μπήκαν στα Πρόχειρα.`:"Δεν βρέθηκαν νέα παραστατικά. Δεν δημιουργήθηκαν διπλές εγγραφές."});
}catch(error){next(error)}});

router.get("/documents/mydata/status",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{try{
  await Promise.all([ensureSchema(),ensureStoreIntegrationSchema()]);const storeId=String(req.query.storeId||"");
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId},select:{id:true}});if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  const configured=await prisma.$queryRaw`SELECT "environment","enabled" FROM "StoreIntegrationCredential" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "kind"='MYDATA' LIMIT 1`;
  const stats=await prisma.$queryRaw`SELECT COUNT(*)::int AS "documents",MAX("fetchedAt") AS "lastSyncAt" FROM "MyDataInboundDocument" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id}`;
  const row=configured[0];res.json({configured:Boolean(row),enabled:Boolean(row?.enabled),environment:row?.environment||null,labLocked:row?.environment!=="SANDBOX",documents:stats[0]?.documents||0,lastSyncAt:stats[0]?.lastSyncAt||null,automaticIntervalMinutes:10,stockUpdated:false});
}catch(error){next(error)}});

export default router;
