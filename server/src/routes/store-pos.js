import {Router} from "express";
import crypto from "crypto";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";

const router=Router();
router.use(auth);

function assertStore(req,storeId){
  if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==storeId){
    const error=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");error.status=403;throw error;
  }
}
async function storeFor(req,storeId){
  const row=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true,companyId:true}});
  if(!row){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  return row;
}
const money=v=>Number(v||0);

router.get("/stores/:storeId",async(req,res,next)=>{
  try{
    assertStore(req,req.params.storeId);
    const store=await storeFor(req,req.params.storeId);
    const layoutRows=await prisma.$queryRawUnsafe(`SELECT "layoutJson","version","publishedAt" FROM "StorePosLayout" WHERE "storeId"=$1 LIMIT 1`,store.id).catch(()=>[]);
    const products=await prisma.$queryRaw`
      SELECT p."id",p."sku",p."name",p."vatRate",COALESCE(sp."salePrice",p."salePrice") AS "salePrice",
             COALESCE(sp."currentStock",0) AS "currentStock",c."name" AS "categoryName",
             COALESCE((SELECT json_agg(pb."barcode" ORDER BY pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS "barcodes"
      FROM "StoreProduct" sp
      JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${req.user.companyId}
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      WHERE sp."storeId"=${store.id} AND sp."active"=true AND p."active"=true
      ORDER BY c."name" NULLS LAST,p."name"
      LIMIT 5000
    `;
    res.json({
      store,
      layout:layoutRows[0]?.layoutJson||null,
      layoutVersion:Number(layoutRows[0]?.version||0),
      publishedAt:layoutRows[0]?.publishedAt||null,
      products:products.map(row=>({...row,salePrice:money(row.salePrice),currentStock:money(row.currentStock),vatRate:money(row.vatRate)}))
    });
  }catch(error){next(error)}
});

const paymentMethodSchema=z.enum(["CASH","CARD","IRIS"]);
const checkoutSchema=z.object({
  items:z.array(z.object({productId:z.string().min(1),quantity:z.coerce.number().positive().max(999)})).min(1).max(200),
  paymentMethod:z.enum(["CASH","CARD","IRIS","MIXED"]).optional(),
  payments:z.array(z.object({method:paymentMethodSchema,amount:z.coerce.number().positive()})).min(2).max(3).optional()
}).superRefine((value,ctx)=>{
  if(value.paymentMethod==="MIXED"&&!value.payments){ctx.addIssue({code:z.ZodIssueCode.custom,path:["payments"],message:"Η μικτή πληρωμή χρειάζεται ανάλυση ποσών."})}
  if(value.payments&&value.paymentMethod!=="MIXED"){ctx.addIssue({code:z.ZodIssueCode.custom,path:["paymentMethod"],message:"Η ανάλυση πληρωμών χρησιμοποιείται μόνο στη μικτή πληρωμή."})}
  if(!value.paymentMethod){ctx.addIssue({code:z.ZodIssueCode.custom,path:["paymentMethod"],message:"Επιλέξτε τρόπο πληρωμής."})}
});

router.post("/stores/:storeId/checkout",async(req,res,next)=>{
  try{
    assertStore(req,req.params.storeId);
    const store=await storeFor(req,req.params.storeId);
    const body=checkoutSchema.parse(req.body||{});
    const ids=[...new Set(body.items.map(x=>x.productId))];
    const rows=await prisma.$queryRaw`
      SELECT p."id",p."name",p."vatRate",COALESCE(sp."salePrice",p."salePrice") AS "salePrice"
      FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId"
      WHERE sp."storeId"=${store.id} AND p."companyId"=${req.user.companyId} AND sp."active"=true AND p."active"=true AND p."id"=ANY(${ids}::text[])
    `;
    if(rows.length!==ids.length)return res.status(400).json({error:"Ένα ή περισσότερα προϊόντα δεν είναι ενεργά στο κατάστημα."});
    const byId=new Map(rows.map(row=>[row.id,row]));
    const items=body.items.map(item=>{const product=byId.get(item.productId);const unitPrice=money(product.salePrice);return {...item,name:product.name,vatRate:money(product.vatRate),unitPrice,lineTotal:Number((unitPrice*item.quantity).toFixed(2))}});
    const total=Number(items.reduce((sum,item)=>sum+item.lineTotal,0).toFixed(2));
    const payments=body.paymentMethod==="MIXED"?body.payments:[{method:body.paymentMethod,amount:total}];
    const paid=Number(payments.reduce((sum,payment)=>sum+money(payment.amount),0).toFixed(2));
    if(Math.abs(paid-total)>0.009)return res.status(400).json({error:`Η ανάλυση πληρωμών (${paid.toFixed(2)} €) πρέπει να ισούται με το σύνολο (${total.toFixed(2)} €).`});

    const saleId=crypto.randomUUID();
    const ledgerId=crypto.randomUUID();
    const actorId=req.user.id;
    const actorName=req.user.fullName||"Πωλητής";
    const employeeId=req.user.employeeId||null;
    const cashAmount=payments.filter(x=>x.method==="CASH").reduce((sum,x)=>sum+money(x.amount),0);
    const nonCashAmount=Number((total-cashAmount).toFixed(2));

    await prisma.$transaction(async tx=>{
      const open=await tx.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1 FOR KEY SHARE`;
      if(!open[0]){const error=new Error("Δεν υπάρχει ανοιχτή βάρδια. Άνοιξε πρώτα βάρδια.");error.status=409;throw error}
      await tx.$executeRaw`INSERT INTO "Sale" ("id","companyId","storeId","operatorEmployeeId","fiscalStatus","subtotal","discount","total","status","source") VALUES (${saleId},${req.user.companyId},${store.id},${employeeId},'NON_FISCAL',${total},0,${total},'COMPLETED','POS')`;
      for(const item of items){
        await tx.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","description","quantity","unitPrice","discount","vatRate","lineTotal") VALUES (${crypto.randomUUID()},${saleId},${item.productId},${item.name},${item.quantity},${item.unitPrice},0,${item.vatRate},${item.lineTotal})`;
      }
      for(const payment of payments){
        await tx.$executeRaw`INSERT INTO "Payment" ("id","saleId","method","amount") VALUES (${crypto.randomUUID()},${saleId},${payment.method},${money(payment.amount)})`;
      }
      const description=`POS πώληση ${saleId} · ${body.paymentMethod}${body.paymentMethod==="MIXED"?` · ΜΕΤΡΗΤΑ ${cashAmount.toFixed(2)} / ΗΛΕΚΤΡΟΝΙΚΑ ${nonCashAmount.toFixed(2)}`:""}`;
      await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName") VALUES (${ledgerId},${req.user.companyId},${store.id},${open[0].id},${cashAmount===total?"SALE_CASH":"SALE_CARD"},${total},${description},${actorId},${actorName})`;
    });
    res.status(201).json({saleId,total,paymentMethod:body.paymentMethod,payments,fiscalStatus:"NON_FISCAL"});
  }catch(error){
    if(error?.name==="ZodError")return res.status(400).json({error:"Ελέγξτε τα προϊόντα και τον τρόπο πληρωμής.",details:error.issues});
    next(error);
  }
});

export default router;
