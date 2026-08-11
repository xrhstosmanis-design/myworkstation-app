import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {ensurePosStockLedgerSchema,reverseSaleStock} from "../pos-stock-ledger.js";

const router=Router();
const money=value=>Number(value||0);
const actorName=req=>req.user?.fullName||req.user?.email||"Χρήστης";

function assertStore(req,storeId){if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==storeId){const e=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");e.status=403;throw e}}
async function ownedStore(req,storeId){assertStore(req,storeId);const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true}});if(!store){const e=new Error("Δεν βρέθηκε ενεργό κατάστημα.");e.status=404;throw e}return store}
async function insertAudit(db,{req,storeId,saleId=null,relatedSaleId=null,actionType,reason=null,details={}}){await db.$executeRaw`INSERT INTO "PosSaleActionAudit" ("id","companyId","storeId","saleId","relatedSaleId","actionType","reason","actorId","actorName","details") VALUES (${crypto.randomUUID()},${req.user.companyId},${storeId},${saleId},${relatedSaleId},${actionType},${reason},${req.user.id||null},${actorName(req)},${JSON.stringify(details||{})}::jsonb)`}
router.use(async(req,res,next)=>{try{await ensurePosStockLedgerSchema();next()}catch(error){next(error)}});

const reverseSchema=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("CANCEL"),reason:z.string().trim().min(3).max(500),returnToStock:z.boolean().optional()}),
  z.object({kind:z.literal("RETURN"),reason:z.string().trim().min(3).max(500),returnToStock:z.boolean()})
]);

router.post("/stores/:storeId/sales/:saleId/reverse",async(req,res,next)=>{
  try{
    const store=await ownedStore(req,req.params.storeId),body=reverseSchema.parse(req.body||{});
    const result=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`reverse:${req.params.saleId}`})) AS locked`;
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
      const reversalId=crypto.randomUUID(),label=body.kind==="CANCEL"?"ΑΚΥΡΩΣΗ":"ΕΠΙΣΤΡΟΦΗ",employeeId=req.user.employeeId||null,returnToStock=body.kind==="CANCEL"?true:body.returnToStock;
      await tx.$executeRaw`INSERT INTO "Sale" ("id","companyId","storeId","operatorEmployeeId","customerId","fiscalStatus","subtotal","discount","total","status","source","occurredAt","transactionMode","originalSaleId","reversalKind","returnToStock") VALUES (${reversalId},${req.user.companyId},${store.id},${employeeId},${sale.customerId||null},'NON_FISCAL',${-money(sale.subtotal)},${-money(sale.discount)},${-money(sale.total)},'COMPLETED','POS_REVERSAL',NOW(),'NORMAL',${sale.id},${body.kind},${returnToStock})`;
      for(const line of lines)await tx.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","description","quantity","unitPrice","discount","vatRate","lineTotal") VALUES (${crypto.randomUUID()},${reversalId},${line.productId||null},${line.description},${-money(line.quantity)},${money(line.unitPrice)},${-money(line.discount)},${money(line.vatRate)},${-money(line.lineTotal)})`;
      for(const payment of payments)await tx.$executeRaw`INSERT INTO "Payment" ("id","saleId","method","amount","terminalRef") VALUES (${crypto.randomUUID()},${reversalId},${payment.method},${-money(payment.amount)},${payment.terminalRef||null})`;
      const cash=payments.filter(p=>p.method==="CASH").reduce((sum,p)=>sum+money(p.amount),0),card=payments.filter(p=>p.method==="CARD").reduce((sum,p)=>sum+money(p.amount),0),iris=payments.filter(p=>p.method==="IRIS").reduce((sum,p)=>sum+money(p.amount),0),who=actorName(req);
      if(cash>0)await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName") VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${open.id},'SALE_CASH',${-cash},${`POS ${label} ${reversalId} · αρχική ${sale.id} · ΜΕΤΡΗΤΑ`},${req.user.id},${who})`;
      if(card+iris>0)await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName") VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${open.id},'SALE_CARD',${-(card+iris)},${`POS ${label} ${reversalId} · αρχική ${sale.id} · ΚΑΡΤΑ ${card.toFixed(2)} · IRIS ${iris.toFixed(2)}`},${req.user.id},${who})`;
      const stock=await reverseSaleStock(tx,{companyId:req.user.companyId,storeId:store.id,originalSaleId:sale.id,reversalSaleId:reversalId,kind:body.kind,returnToStock,actorName:who});
      await tx.$executeRaw`UPDATE "Sale" SET "reversalState"=${body.kind},"reversedAt"=NOW(),"reversedBy"=${req.user.id},"reversedByName"=${who} WHERE "id"=${sale.id}`;
      await insertAudit(tx,{req,storeId:store.id,saleId:reversalId,relatedSaleId:sale.id,actionType:body.kind,reason:body.reason,details:{originalTotal:money(sale.total),reversalTotal:-money(sale.total),sessionId:open.id,payments:payments.map(p=>({method:p.method,amount:money(p.amount)})),returnToStock,stock}});
      return {saleId:sale.id,reversalSaleId:reversalId,kind:body.kind,total:money(sale.total),reversalTotal:-money(sale.total),sessionId:open.id,fiscalStatus:"NON_FISCAL",returnToStock,stock};
    });
    res.status(201).json(result);
  }catch(error){if(error?.name==="ZodError")return res.status(400).json({error:"Επίλεξε Ακύρωση ή Επιστροφή, συμπλήρωσε αιτιολογία και δήλωσε ρητά αν η Επιστροφή μπαίνει ξανά στο απόθεμα.",details:error.issues});next(error)}
});

export default router;
