import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const money=value=>Number(value||0);

function assertStore(req,storeId){
  if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==storeId){
    const error=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");
    error.status=403;
    throw error;
  }
}

async function ownedStore(req,storeId){
  assertStore(req,storeId);
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true}});
  if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  return store;
}

const methodLabel=method=>method==="CASH"?"ΜΕΤΡΗΤΑ":method==="CARD"?"ΚΑΡΤΑ":method==="IRIS"?"IRIS":String(method||"ΠΛΗΡΩΜΗ");
const euroPlain=value=>`${Number(value||0).toFixed(2).replace(".",",")} €`;

function normalizeSale(row){
  const payments=(row.payments||[]).map(payment=>({...payment,amount:money(payment.amount)}));
  const lines=(row.lines||[]).map(line=>({...line,quantity:money(line.quantity),unitPrice:money(line.unitPrice),lineTotal:money(line.lineTotal)}));
  const paymentSummary=payments.length>1
    ?`ΜΙΚΤΗ · ${payments.map(payment=>`${methodLabel(payment.method)} ${euroPlain(payment.amount)}`).join(" + ")}`
    :(payments[0]?`${methodLabel(payments[0].method)} ${euroPlain(payments[0].amount)}`:"ΧΩΡΙΣ ΠΛΗΡΩΜΗ");
  const productSummary=lines.length?lines.map(line=>`${Math.abs(Number(line.quantity||0))}× ${line.description}`).join(" · "):"Χωρίς προϊόντα";
  const movementType=row.source==="POS_REVERSAL"?(row.reversalKind==="RETURN"?"RETURN":"CANCEL"):row.source==="EXCHANGE"?"EXCHANGE":row.source==="WASTE"?"WASTE":"SALE";
  return {...row,total:money(row.total),subtotal:money(row.subtotal),discount:money(row.discount),payments,lines,paymentSummary,paymentMethod:`${productSummary} · ${paymentSummary}`,productSummary,movementType};
}

router.get("/stores/:storeId/sales/recent",async(req,res,next)=>{
  try{
    const store=await ownedStore(req,req.params.storeId);
    const rows=await prisma.$queryRaw`
      SELECT s."id",s."receiptNumber",s."total",s."subtotal",s."discount",s."occurredAt",s."createdAt",
             s."transactionMode",s."delayedReason",s."reversalState",s."reversalKind",s."originalSaleId",s."fiscalStatus",s."source",c."name" AS "customerName",
             COALESCE((SELECT st."sessionId" FROM "StoreTransaction" st WHERE st."companyId"=s."companyId" AND st."storeId"=s."storeId" AND COALESCE(st."description",'') LIKE ('%'||s."id"||'%') ORDER BY st."occurredAt" ASC LIMIT 1),NULL) AS "sessionId",
             COALESCE((SELECT st."actorName" FROM "StoreTransaction" st WHERE st."companyId"=s."companyId" AND st."storeId"=s."storeId" AND COALESCE(st."description",'') LIKE ('%'||s."id"||'%') ORDER BY st."occurredAt" ASC LIMIT 1),'Πωλητής') AS "actorName",
             COALESCE((SELECT json_agg(json_build_object('method',p."method",'amount',p."amount") ORDER BY p."createdAt",p."id") FROM "Payment" p WHERE p."saleId"=s."id"),'[]'::json) AS "payments",
             COALESCE((SELECT json_agg(json_build_object('id',l."id",'productId',l."productId",'description',l."description",'quantity',l."quantity",'unitPrice',l."unitPrice",'lineTotal',l."lineTotal") ORDER BY l."createdAt",l."id") FROM "SaleLine" l WHERE l."saleId"=s."id"),'[]'::json) AS "lines"
      FROM "Sale" s
      LEFT JOIN "Customer" c ON c."id"=s."customerId" AND c."companyId"=s."companyId"
      WHERE s."companyId"=${req.user.companyId} AND s."storeId"=${store.id}
        AND s."source" IN ('POS','EXCHANGE','POS_REVERSAL','WASTE') AND s."status"='COMPLETED'
      ORDER BY s."createdAt" DESC LIMIT 50`;
    res.json({store,rows:rows.map(normalizeSale)});
  }catch(error){next(error)}
});

router.get("/sales/journal",async(req,res,next)=>{
  try{
    const storeId=req.query.storeId?String(req.query.storeId):null;
    if(req.user?.tokenType==="STORE_OPERATOR"){
      if(storeId&&req.user.storeId!==storeId)return res.status(403).json({error:"Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα."});
    }
    if(storeId){const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true}});if(!store)return res.status(404).json({error:"Δεν βρέθηκε ενεργό κατάστημα."})}
    const to=req.query.to?new Date(String(req.query.to)):new Date();
    const from=req.query.from?new Date(String(req.query.from)):new Date(to.getTime()-30*86400000);
    if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to)return res.status(400).json({error:"Μη έγκυρο διάστημα ημερομηνιών."});
    const operatorStoreId=req.user?.tokenType==="STORE_OPERATOR"?req.user.storeId:null;
    const rows=await prisma.$queryRaw`
      SELECT s."id",s."receiptNumber",s."total",s."subtotal",s."discount",s."occurredAt",s."createdAt",s."status",
             s."transactionMode",s."delayedReason",s."reversalState",s."reversalKind",s."originalSaleId",s."fiscalStatus",s."source",st."name" AS "storeName",c."name" AS "customerName",
             COALESCE((SELECT tx."actorName" FROM "StoreTransaction" tx WHERE tx."companyId"=s."companyId" AND tx."storeId"=s."storeId" AND COALESCE(tx."description",'') LIKE ('%'||s."id"||'%') ORDER BY tx."occurredAt" ASC LIMIT 1),'Πωλητής') AS "actorName",
             COALESCE((SELECT json_agg(json_build_object('method',p."method",'amount',p."amount") ORDER BY p."createdAt",p."id") FROM "Payment" p WHERE p."saleId"=s."id"),'[]'::json) AS "payments",
             COALESCE((SELECT json_agg(json_build_object('id',l."id",'productId',l."productId",'description',l."description",'quantity',l."quantity",'unitPrice',l."unitPrice",'lineTotal',l."lineTotal") ORDER BY l."createdAt",l."id") FROM "SaleLine" l WHERE l."saleId"=s."id"),'[]'::json) AS "lines"
      FROM "Sale" s
      JOIN "Store" st ON st."id"=s."storeId" AND st."companyId"=s."companyId"
      LEFT JOIN "Customer" c ON c."id"=s."customerId" AND c."companyId"=s."companyId"
      WHERE s."companyId"=${req.user.companyId}
        AND (${storeId}::text IS NULL OR s."storeId"=${storeId})
        AND (${operatorStoreId}::text IS NULL OR s."storeId"=${operatorStoreId})
        AND s."occurredAt">=${from} AND s."occurredAt"<=${to}
        AND s."source" IN ('POS','EXCHANGE','POS_REVERSAL')
      ORDER BY s."occurredAt" DESC LIMIT 500`;
    res.json({from,to,rows:rows.map(normalizeSale)});
  }catch(error){next(error)}
});

export default router;