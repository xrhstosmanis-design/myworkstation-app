import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
let readyPromise;
const money=value=>Number(value||0);
const actorName=req=>req.user?.fullName||req.user?.email||"Χρήστης";

export async function ensurePosSaleActionSchema(){
  if(!readyPromise){
    readyPromise=(async()=>{
      const statements=[
        `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "transactionMode" TEXT NOT NULL DEFAULT 'NORMAL'`,
        `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "delayedReason" TEXT`,
        `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "delayedRecordedAt" TIMESTAMPTZ`,
        `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "originalSaleId" TEXT`,
        `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "reversalKind" TEXT`,
        `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "reversalState" TEXT`,
        `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMPTZ`,
        `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "reversedBy" TEXT`,
        `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "reversedByName" TEXT`,
        `CREATE INDEX IF NOT EXISTS "Sale_originalSaleId_idx" ON "Sale"("originalSaleId")`,
        `CREATE INDEX IF NOT EXISTS "Sale_store_transactionMode_idx" ON "Sale"("storeId","transactionMode","occurredAt" DESC)`,
        `CREATE TABLE IF NOT EXISTS "PosSaleActionAudit" (
          "id" TEXT PRIMARY KEY,
          "companyId" TEXT NOT NULL,
          "storeId" TEXT NOT NULL,
          "saleId" TEXT,
          "relatedSaleId" TEXT,
          "actionType" TEXT NOT NULL,
          "reason" TEXT,
          "actorId" TEXT,
          "actorName" TEXT,
          "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS "PosSaleActionAudit_store_created_idx" ON "PosSaleActionAudit"("storeId","createdAt" DESC)`,
        `CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`
      ];
      for(const sql of statements)await prisma.$executeRawUnsafe(sql);
    })().catch(error=>{readyPromise=undefined;throw error});
  }
  return readyPromise;
}

function assertStore(req,storeId){
  if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==storeId){
    const error=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");
    error.status=403;throw error;
  }
}
async function ownedStore(req,storeId){
  assertStore(req,storeId);
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true}});
  if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  return store;
}
async function insertAudit(db,{req,storeId,saleId=null,relatedSaleId=null,actionType,reason=null,details={}}){
  await db.$executeRaw`INSERT INTO "PosSaleActionAudit" ("id","companyId","storeId","saleId","relatedSaleId","actionType","reason","actorId","actorName","details") VALUES (${crypto.randomUUID()},${req.user.companyId},${storeId},${saleId},${relatedSaleId},${actionType},${reason},${req.user.id||null},${actorName(req)},${JSON.stringify(details||{})}::jsonb)`;
}
async function insertOperatorAudit(db,{req,storeId,eventType,details={}}){
  await db.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${req.user.companyId},${storeId},${req.user.operatorId||req.user.id},${req.user.id},${eventType},${JSON.stringify(details||{})}::jsonb)`;
}

router.use(async(req,res,next)=>{try{await ensurePosSaleActionSchema();next()}catch(error){next(error)}});

router.get("/stores/:storeId/sales/recent",async(req,res,next)=>{
  try{
    const store=await ownedStore(req,req.params.storeId);
    const rows=await prisma.$queryRaw`
      SELECT s."id",s."receiptNumber",s."total",s."subtotal",s."discount",s."occurredAt",s."createdAt",
             s."transactionMode",s."delayedReason",s."reversalState",s."fiscalStatus",c."name" AS "customerName",
             COALESCE((SELECT json_agg(json_build_object('method',p."method",'amount',p."amount") ORDER BY p."createdAt",p."id") FROM "Payment" p WHERE p."saleId"=s."id"),'[]'::json) AS "payments",
             COALESCE((SELECT json_agg(json_build_object('id',l."id",'productId',l."productId",'description',l."description",'quantity',l."quantity",'unitPrice',l."unitPrice",'lineTotal',l."lineTotal") ORDER BY l."createdAt",l."id") FROM "SaleLine" l WHERE l."saleId"=s."id"),'[]'::json) AS "lines"
      FROM "Sale" s
      LEFT JOIN "Customer" c ON c."id"=s."customerId" AND c."companyId"=s."companyId"
      WHERE s."companyId"=${req.user.companyId} AND s."storeId"=${store.id} AND s."source"='POS' AND s."status"='COMPLETED'
      ORDER BY s."createdAt" DESC LIMIT 30`;
    res.json({store,rows:rows.map(row=>({...row,total:money(row.total),subtotal:money(row.subtotal),discount:money(row.discount),payments:(row.payments||[]).map(p=>({...p,amount:money(p.amount)})),lines:(row.lines||[]).map(l=>({...l,quantity:money(l.quantity),unitPrice:money(l.unitPrice),lineTotal:money(l.lineTotal)}))}))});
  }catch(error){next(error)}
});

const delayedSchema=z.object({occurredAt:z.coerce.date(),reason:z.string().trim().min(3).max(500)});
router.post("/stores/:storeId/sales/:saleId/delayed",async(req,res,next)=>{
  try{
    const store=await ownedStore(req,req.params.storeId),body=delayedSchema.parse(req.body||{}),now=Date.now(),target=body.occurredAt.getTime();
    if(target>now+60_000)return res.status(400).json({error:"Η ετεροχρονισμένη ώρα δεν μπορεί να είναι στο μέλλον."});
    if(target<now-31*24*60*60*1000)return res.status(400).json({error:"Για λόγους ασφαλείας η ετεροχρονισμένη πώληση μπορεί να δηλωθεί έως 31 ημέρες πίσω."});
    const result=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`delay:${req.params.saleId}`})) IS NULL) AS locked`;
      const sale=(await tx.$queryRaw`SELECT * FROM "Sale" WHERE "id"=${req.params.saleId} AND "companyId"=${req.user.companyId} AND "storeId"=${store.id} FOR UPDATE`)[0];
      if(!sale){const e=new Error("Δεν βρέθηκε η πώληση.");e.status=404;throw e}
      if(sale.source!=="POS"||sale.status!=="COMPLETED"){const e=new Error("Ετεροχρονισμένη σήμανση επιτρέπεται μόνο σε ολοκληρωμένη αρχική POS πώληση.");e.status=409;throw e}
      if(sale.fiscalStatus!=="NON_FISCAL"){const e=new Error("Η λειτουργία TEST δεν μεταβάλλει φορολογικά εκδομένη συναλλαγή.");e.status=409;throw e}
      if(sale.reversalState){const e=new Error("Η πώληση έχει ήδη ακυρωθεί ή επιστραφεί.");e.status=409;throw e}
      const open=(await tx.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1 FOR KEY SHARE`)[0];
      if(!open){const e=new Error("Δεν υπάρχει ανοιχτή βάρδια.");e.status=409;throw e}
      const pattern=`%POS πώληση ${sale.id} ·%`;
      const linked=await tx.$queryRaw`SELECT "id" FROM "StoreTransaction" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "sessionId"=${open.id} AND COALESCE("description",'') LIKE ${pattern}`;
      if(!linked.length){const e=new Error("Η ετεροχρονισμένη σήμανση εφαρμόζεται μόνο στην πώληση που καταχωρήθηκε στην τρέχουσα ανοιχτή βάρδια.");e.status=409;throw e}
      const oldAt=sale.occurredAt;
      await tx.$executeRaw`UPDATE "Sale" SET "occurredAt"=${body.occurredAt},"transactionMode"='DELAYED',"delayedReason"=${body.reason},"delayedRecordedAt"=NOW() WHERE "id"=${sale.id}`;
      await tx.$executeRaw`UPDATE "StoreTransaction" SET "occurredAt"=${body.occurredAt} WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "sessionId"=${open.id} AND COALESCE("description",'') LIKE ${pattern}`;
      await insertAudit(tx,{req,storeId:store.id,saleId:sale.id,actionType:"DELAYED",reason:body.reason,details:{oldOccurredAt:oldAt,newOccurredAt:body.occurredAt,sessionId:open.id}});
      await insertOperatorAudit(tx,{req,storeId:store.id,eventType:"POS_SALE_DELAYED",details:{saleId:sale.id,oldOccurredAt:oldAt,newOccurredAt:body.occurredAt,reason:body.reason,sessionId:open.id}});
      return {saleId:sale.id,occurredAt:body.occurredAt,recordedAt:new Date(),transactionMode:"DELAYED"};
    });
    res.json(result);
  }catch(error){if(error?.name==="ZodError")return res.status(400).json({error:"Συμπλήρωσε έγκυρη ημερομηνία/ώρα και αιτιολογία.",details:error.issues});next(error)}
});

const reverseSchema=z.object({kind:z.enum(["CANCEL","RETURN"]),reason:z.string().trim().min(3).max(500)});
router.post("/stores/:storeId/sales/:saleId/reverse",async(req,res,next)=>{
  try{
    const store=await ownedStore(req,req.params.storeId),body=reverseSchema.parse(req.body||{});
    // returnItems is enforced once by store-pos-catalog from the central BackOffice operator profile.
    const result=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`reverse:${req.params.saleId}`})) IS NULL) AS locked`;
      const sale=(await tx.$queryRaw`SELECT * FROM "Sale" WHERE "id"=${req.params.saleId} AND "companyId"=${req.user.companyId} AND "storeId"=${store.id} FOR UPDATE`)[0];
      if(!sale){const e=new Error("Δεν βρέθηκε η πώληση.");e.status=404;throw e}
      if(sale.source!=="POS"||sale.status!=="COMPLETED"){const e=new Error("Ακύρωση/επιστροφή επιτρέπεται μόνο σε ολοκληρωμένη αρχική POS πώληση.");e.status=409;throw e}
      if(sale.fiscalStatus!=="NON_FISCAL"){const e=new Error("Η λειτουργία TEST δεν ακυρώνει φορολογικά εκδομένη συναλλαγή.");e.status=409;throw e}
      if(sale.reversalState){const e=new Error(`Η πώληση έχει ήδη ${sale.reversalState==="CANCEL"?"ακυρωθεί":"επιστραφεί"}.`);e.status=409;throw e}
      const open=(await tx.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1 FOR KEY SHARE`)[0];
      if(!open){const e=new Error("Δεν υπάρχει ανοιχτή βάρδια για την αντίστροφη εγγραφή.");e.status=409;throw e}
      const originalPattern=`%POS πώληση ${sale.id} ·%`;
      if(body.kind==="CANCEL"){
        const sameShift=await tx.$queryRaw`SELECT "id" FROM "StoreTransaction" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "sessionId"=${open.id} AND COALESCE("description",'') LIKE ${originalPattern} LIMIT 1`;
        if(!sameShift[0]){const e=new Error("Η Ακύρωση επιτρέπεται μόνο όσο η αρχική πώληση βρίσκεται στην τρέχουσα ανοιχτή βάρδια. Για παλιότερη πώληση χρησιμοποίησε Επιστροφή.");e.status=409;throw e}
      }
      const [lines,payments]=await Promise.all([
        tx.$queryRaw`SELECT * FROM "SaleLine" WHERE "saleId"=${sale.id} ORDER BY "createdAt","id"`,
        tx.$queryRaw`SELECT * FROM "Payment" WHERE "saleId"=${sale.id} ORDER BY "createdAt","id"`
      ]);
      if(!lines.length||!payments.length){const e=new Error("Η αρχική πώληση δεν έχει πλήρη ανάλυση γραμμών/πληρωμών.");e.status=409;throw e}
      const reversalId=crypto.randomUUID(),label=body.kind==="CANCEL"?"ΑΚΥΡΩΣΗ":"ΕΠΙΣΤΡΟΦΗ",employeeId=req.user.employeeId||null,restoredProductIds=[];
      await tx.$executeRaw`INSERT INTO "Sale" ("id","companyId","storeId","operatorEmployeeId","customerId","fiscalStatus","subtotal","discount","total","status","source","occurredAt","transactionMode","originalSaleId","reversalKind") VALUES (${reversalId},${req.user.companyId},${store.id},${employeeId},${sale.customerId||null},'NON_FISCAL',${-money(sale.subtotal)},${-money(sale.discount)},${-money(sale.total)},'COMPLETED','POS_REVERSAL',NOW(),'NORMAL',${sale.id},${body.kind})`;
      for(const line of lines){
        await tx.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","description","quantity","unitPrice","discount","vatRate","lineTotal") VALUES (${crypto.randomUUID()},${reversalId},${line.productId||null},${line.description},${-money(line.quantity)},${money(line.unitPrice)},${-money(line.discount)},${money(line.vatRate)},${-money(line.lineTotal)})`;
        if(line.productId){
          const restored=await tx.$queryRaw`UPDATE "StoreProduct" sp SET "currentStock"=COALESCE(sp."currentStock",0)+${money(line.quantity)} FROM "Product" p WHERE sp."storeId"=${store.id} AND sp."productId"=${line.productId} AND sp."active"=TRUE AND p."id"=sp."productId" AND p."companyId"=${req.user.companyId} AND p."trackStock"=TRUE RETURNING sp."productId"`;
          if(restored[0])restoredProductIds.push(restored[0].productId);
        }
      }
      for(const payment of payments)await tx.$executeRaw`INSERT INTO "Payment" ("id","saleId","method","amount") VALUES (${crypto.randomUUID()},${reversalId},${payment.method},${-money(payment.amount)})`;
      const cash=payments.filter(p=>p.method==="CASH").reduce((sum,p)=>sum+money(p.amount),0),card=payments.filter(p=>p.method==="CARD").reduce((sum,p)=>sum+money(p.amount),0),iris=payments.filter(p=>p.method==="IRIS").reduce((sum,p)=>sum+money(p.amount),0),who=actorName(req);
      if(cash>0)await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName") VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${open.id},'SALE_CASH',${-cash},${`POS ${label} ${reversalId} · αρχική ${sale.id} · ΜΕΤΡΗΤΑ`},${req.user.id},${who})`;
      if(card+iris>0)await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName") VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${open.id},'SALE_CARD',${-(card+iris)},${`POS ${label} ${reversalId} · αρχική ${sale.id} · ΚΑΡΤΑ ${card.toFixed(2)} · IRIS ${iris.toFixed(2)}`},${req.user.id},${who})`;
      await tx.$executeRaw`UPDATE "Sale" SET "reversalState"=${body.kind},"reversedAt"=NOW(),"reversedBy"=${req.user.id},"reversedByName"=${who} WHERE "id"=${sale.id}`;
      const auditDetails={originalTotal:money(sale.total),reversalTotal:-money(sale.total),sessionId:open.id,stockRestoredProductIds:restoredProductIds,payments:payments.map(p=>({method:p.method,amount:money(p.amount)})),items:lines.map(line=>({productId:line.productId,description:line.description,quantity:money(line.quantity),lineTotal:money(line.lineTotal)}))};
      await insertAudit(tx,{req,storeId:store.id,saleId:reversalId,relatedSaleId:sale.id,actionType:body.kind,reason:body.reason,details:auditDetails});
      await insertOperatorAudit(tx,{req,storeId:store.id,eventType:body.kind==="CANCEL"?"POS_SALE_CANCELLED":"POS_RETURN_COMPLETED",details:{saleId:sale.id,reversalSaleId:reversalId,reason:body.reason,...auditDetails}});
      return {saleId:sale.id,reversalSaleId:reversalId,kind:body.kind,total:money(sale.total),reversalTotal:-money(sale.total),sessionId:open.id,fiscalStatus:"NON_FISCAL"};
    });
    res.status(201).json(result);
  }catch(error){if(error?.name==="ZodError")return res.status(400).json({error:"Επίλεξε Ακύρωση ή Επιστροφή και συμπλήρωσε αιτιολογία.",details:error.issues});next(error)}
});

export default router;