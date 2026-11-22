import crypto from "crypto";
import {Router} from "express";
import {parseKioskPaymentFile,verifyKioskPreview,stripKioskPaymentText as strip} from "../lib/kiosk-payment-workbook.js";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireStaffAction} from "../services/backoffice-staff-access.js";

const router=Router();
const allowedRoles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const bodySchema=z.object({
  storeId:z.string().trim().min(1),
  filename:z.string().trim().min(1).max(180),
  dataBase64:z.string().min(20).max(11500000),
  previewReceipt:z.string().max(100).optional()
});

let schemaPromise;
async function ensureSchema(){
  if(!schemaPromise){
    schemaPromise=(async()=>{
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreTransaction" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "storeId" TEXT NOT NULL,
        "sessionId" TEXT,
        "type" TEXT NOT NULL,
        "amount" NUMERIC(14,2) NOT NULL,
        "description" TEXT,
        "supplierId" TEXT,
        "supplierName" TEXT,
        "attachmentData" TEXT,
        "attachmentMimeType" TEXT,
        "attachmentFilename" TEXT,
        "attachmentChecksum" TEXT,
        "subtractFromShift" BOOLEAN NOT NULL DEFAULT false,
        "actorId" TEXT NOT NULL,
        "actorName" TEXT NOT NULL,
        "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "reversedAt" TIMESTAMPTZ,
        "reversedBy" TEXT,
        "reversedByName" TEXT,
        "reversalReason" TEXT
      )`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "sourceType" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "sourceRef" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "sourceHash" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "importedAt" TIMESTAMPTZ`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "StoreTransaction_kiosk_import_hash_key" ON "StoreTransaction" ("companyId","storeId","sourceType","sourceHash") WHERE "sourceHash" IS NOT NULL`);
    })().catch(error=>{schemaPromise=undefined;throw error});
  }
  return schemaPromise;
}

router.post("/import-kiosk",async(req,res,next)=>{
  try{
    if(req.user?.staffAccess!==true&&(req.user?.tokenType==="STORE_OPERATOR"||!allowedRoles.has(req.user?.role)))return res.status(403).json({error:"Η εισαγωγή Kiosk επιτρέπεται μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
    const body=bodySchema.parse(req.body||{});
    await requireStaffAction(prisma,req,body.storeId,"payments.import-kiosk");
    if(!/\.(xlsx|xls|csv)$/i.test(body.filename))return res.status(400).json({error:"Επίλεξε αρχείο Excel (.xlsx/.xls) ή CSV."});
    const store=await prisma.store.findFirst({where:{id:body.storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το επιλεγμένο κατάστημα."});
    if(!verifyKioskPreview({companyId:req.user.companyId,storeId:store.id,actorId:req.user.id},body,body.previewReceipt)){
      return res.status(409).json({error:"Η προεπισκόπηση έληξε ή το αρχείο ή το κατάστημα άλλαξε. Κάνε νέα προεπισκόπηση."});
    }
    const parsed=parseKioskPaymentFile(body.filename,body.dataBase64);
    await ensureSchema();
    const suppliers=await prisma.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "companyId"=${req.user.companyId} AND "active"=true`;
    const supplierMap=new Map(suppliers.map(row=>[strip(row.name),row]));
    let inserted=0,duplicates=0;
    await prisma.$transaction(async tx=>{
      await requireStaffAction(tx,req,store.id,"payments.import-kiosk");
      for(const row of parsed.rows){
        const supplier=supplierMap.get(strip(row.supplierName))||null;
        const fingerprint=crypto.createHash("sha256").update([req.user.companyId,store.id,row.occurredAt.toISOString().slice(0,10),row.type,row.amount.toFixed(2),strip(row.supplierName),strip(row.description),strip(row.sourceRef)].join("|")).digest("hex");
        const result=await tx.$queryRaw`
          INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","supplierId","supplierName","subtractFromShift","actorId","actorName","occurredAt","sourceType","sourceRef","sourceHash","importedAt")
          VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},NULL,${row.type},${row.amount},${row.description},${supplier?.id||null},${row.supplierName||null},false,${req.user.id},${req.user.fullName||"Χρήστης"},${row.occurredAt},'KIOSK_IMPORT',${row.sourceRef||body.filename},${fingerprint},NOW())
          ON CONFLICT DO NOTHING RETURNING "id"
        `;
        if(result[0])inserted++;else duplicates++;
      }
    });
    res.status(201).json({ok:true,store,filename:body.filename,sheet:parsed.sheet,headerRow:parsed.headerRow+1,found:parsed.rows.length,inserted,duplicates,skipped:parsed.skipped,message:`Εισήχθησαν ${inserted} πραγματικές κινήσεις Kiosk στο ${store.name}.`});
  }catch(error){next(error)}
});

export default router;
