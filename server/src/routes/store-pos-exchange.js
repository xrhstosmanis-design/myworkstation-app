import {Router} from "express";
import crypto from "crypto";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";

const router=Router();
router.use(auth);
const money=value=>Number(value||0);
const round2=value=>Number(Number(value||0).toFixed(2));

function assertStore(req,storeId){
  if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==storeId){
    const error=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");
    error.status=403;
    throw error;
  }
}

async function storeFor(req,storeId){
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true}});
  if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  return store;
}

async function openShift(req,storeId){
  const rows=await prisma.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${req.user.companyId} AND "storeId"=${storeId} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1`;
  if(!rows[0]){const error=new Error("Δεν υπάρχει ανοιχτή βάρδια. Άνοιξε πρώτα βάρδια.");error.status=409;throw error}
  return rows[0];
}

async function ensureAudit(){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PosSaleActionAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"saleId" TEXT,"relatedSaleId" TEXT,"actionType" TEXT NOT NULL,"reason" TEXT,"actorId" TEXT,"actorName" TEXT,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}

const paymentSchema=z.object({method:z.enum(["CASH","CARD","IRIS"]),amount:z.coerce.number()});
const schema=z.object({
  items:z.array(z.object({
    productId:z.string().min(1),
    quantity:z.coerce.number().positive().max(999),
    direction:z.enum(["SALE","RETURN"]),
    unitPrice:z.coerce.number().min(0).max(999999),
  })).min(2).max(200),
  paymentMethod:z.enum(["CASH","CARD","IRIS","MIXED"]),
  payments:z.array(paymentSchema).max(3).optional(),
  customerId:z.string().optional().nullable(),
  reason:z.string().trim().min(2).max(500).default("Αλλαγή είδους"),
});

router.post("/stores/:storeId/exchange",async(req,res,next)=>{
  try{
    assertStore(req,req.params.storeId);
    const store=await storeFor(req,req.params.storeId);
    const shift=await openShift(req,store.id);
    const body=schema.parse(req.body||{});
    const ids=[...new Set(body.items.map(item=>item.productId))];
    const rows=await prisma.$queryRaw`SELECT p."id",p."name",p."sku",p."vatRate" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${store.id} AND sp."active"=true WHERE p."companyId"=${req.user.companyId} AND p."active"=true AND p."id"=ANY(${ids}::text[])`;
    if(rows.length!==ids.length)return res.status(400).json({error:"Ένα ή περισσότερα είδη της αλλαγής δεν είναι ενεργά στο κατάστημα."});
    const byId=new Map(rows.map(row=>[row.id,row]));
    const items=body.items.map(item=>{
      const product=byId.get(item.productId);
      const signedQuantity=item.direction==="RETURN"?-money(item.quantity):money(item.quantity);
      return {productId:item.productId,name:product.name,sku:product.sku,vatRate:money(product.vatRate),direction:item.direction,quantity:signedQuantity,unitPrice:money(item.unitPrice),lineTotal:round2(signedQuantity*money(item.unitPrice))};
    });
    if(!items.some(item=>item.direction==="RETURN")||!items.some(item=>item.direction==="SALE"))return res.status(400).json({error:"Η αλλαγή είδους χρειάζεται τουλάχιστον ένα επιστρεφόμενο και ένα νέο προϊόν."});
    const total=round2(items.reduce((sum,item)=>sum+item.lineTotal,0));
    let payments=body.paymentMethod==="MIXED"?(body.payments||[]): [{method:body.paymentMethod,amount:total}];
    if(body.paymentMethod==="MIXED"&&!payments.length)return res.status(400).json({error:"Η μικτή πληρωμή χρειάζεται ανάλυση ποσών."});
    const paid=round2(payments.reduce((sum,payment)=>sum+money(payment.amount),0));
    if(Math.abs(paid-total)>.009)return res.status(400).json({error:`Η πληρωμή της διαφοράς (${paid.toFixed(2)} €) πρέπει να ισούται με τη διαφορά ειδών (${total.toFixed(2)} €).`});
    const saleId=crypto.randomUUID();
    const actor=req.user.fullName||"Πωλητής";
    const subtotal=round2(items.filter(item=>item.lineTotal>0).reduce((sum,item)=>sum+item.lineTotal,0));
    await ensureAudit();
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO "Sale" ("id","companyId","storeId","customerId","operatorEmployeeId","fiscalStatus","subtotal","discount","total","status","source") VALUES (${saleId},${req.user.companyId},${store.id},${body.customerId||null},${req.user.employeeId||null},'NON_FISCAL',${subtotal},0,${total},'COMPLETED','EXCHANGE')`;
      for(const item of items){
        await tx.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","description","quantity","unitPrice","discount","vatRate","lineTotal") VALUES (${crypto.randomUUID()},${saleId},${item.productId},${item.direction==="RETURN"?`ΕΠΙΣΤΡΟΦΗ: ${item.name}`:item.name},${item.quantity},${item.unitPrice},0,${item.vatRate},${item.lineTotal})`;
        await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=COALESCE("currentStock",0)-${item.quantity} WHERE "storeId"=${store.id} AND "productId"=${item.productId}`;
      }
      for(const payment of payments){
        await tx.$executeRaw`INSERT INTO "Payment" ("id","saleId","method","amount") VALUES (${crypto.randomUUID()},${saleId},${payment.method},${money(payment.amount)})`;
        const type=payment.method==="CASH"?'SALE_CASH':'SALE_CARD';
        await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName") VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${shift.id},${type},${money(payment.amount)},${`ΑΛΛΑΓΗ ΕΙΔΟΥΣ ${saleId} · ${payment.method} · ΔΙΑΦΟΡΑ ${total.toFixed(2)} €`},${req.user.id},${actor})`;
      }
      await tx.$executeRaw`INSERT INTO "PosSaleActionAudit" ("id","companyId","storeId","saleId","actionType","reason","actorId","actorName","details") VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${saleId},'ITEM_EXCHANGE_COMPLETED',${body.reason},${req.user.id},${actor},${JSON.stringify({items,total,paymentMethod:body.paymentMethod,payments})}::jsonb)`;
    });
    res.status(201).json({ok:true,saleId,total,paymentMethod:body.paymentMethod,payments,items,fiscalStatus:"NON_FISCAL",exchange:true});
  }catch(error){
    if(error?.name==="ZodError")return res.status(400).json({error:"Ελέγξτε τα είδη και την πληρωμή της αλλαγής.",details:error.issues});
    next(error);
  }
});

export default router;
