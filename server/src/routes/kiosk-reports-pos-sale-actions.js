import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const n=value=>Number(value||0);
const dayStart=value=>{const d=value?new Date(`${String(value).slice(0,10)}T00:00:00`):new Date(Date.now()-30*86400000);return Number.isNaN(d.getTime())?new Date(Date.now()-30*86400000):d};
const dayEnd=value=>{const d=value?new Date(`${String(value).slice(0,10)}T00:00:00`):new Date();if(Number.isNaN(d.getTime()))return new Date(Date.now()+86400000);d.setDate(d.getDate()+1);return d};

router.use((req,res,next)=>{if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Το POS audit είναι διαθέσιμο μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});next()});

router.get("/pos-sale-actions",async(req,res,next)=>{try{
  const companyId=req.user.companyId,from=dayStart(req.query.from),to=dayEnd(req.query.to),storeId=String(req.query.storeId||"")||null,q=String(req.query.q||"").trim(),text=q?`%${q}%`:null;
  const rows=await prisma.$queryRaw`
    SELECT a."id",a."createdAt",a."actionType",a."reason",a."actorId",a."actorName",a."details",a."saleId",a."relatedSaleId",
      st."name" AS "storeName",
      s."source" AS "saleSource",s."total" AS "saleTotal",s."occurredAt" AS "saleOccurredAt",s."createdAt" AS "saleCreatedAt",s."transactionMode",s."reversalKind",s."originalSaleId",
      original."total" AS "originalTotal",original."occurredAt" AS "originalOccurredAt",c."name" AS "customerName"
    FROM "PosSaleActionAudit" a
    LEFT JOIN "Store" st ON st."id"=a."storeId" AND st."companyId"=a."companyId"
    LEFT JOIN "Sale" s ON s."id"=a."saleId" AND s."companyId"=a."companyId"
    LEFT JOIN "Sale" original ON original."id"=COALESCE(a."relatedSaleId",s."originalSaleId") AND original."companyId"=a."companyId"
    LEFT JOIN "Customer" c ON c."id"=COALESCE(s."customerId",original."customerId") AND c."companyId"=a."companyId"
    WHERE a."companyId"=${companyId} AND a."createdAt">=${from} AND a."createdAt"<${to}
      AND (${storeId}::text IS NULL OR a."storeId"=${storeId})
      AND (${text}::text IS NULL OR COALESCE(a."reason",'') ILIKE ${text} OR COALESCE(a."actorName",'') ILIKE ${text} OR COALESCE(c."name",'') ILIKE ${text} OR COALESCE(a."saleId",'') ILIKE ${text} OR COALESCE(a."relatedSaleId",'') ILIKE ${text})
    ORDER BY a."createdAt" DESC LIMIT 10000`;
  const items=rows.map(r=>({...r,saleTotal:n(r.saleTotal),originalTotal:n(r.originalTotal),oldOccurredAt:r.details?.oldOccurredAt||null,newOccurredAt:r.details?.newOccurredAt||null,sessionId:r.details?.sessionId||null}));
  const summary=items.reduce((a,r)=>{a.count++;if(r.actionType==="CANCEL")a.cancellations++;if(r.actionType==="RETURN")a.returns++;if(r.actionType==="DELAYED")a.delayed++;return a},{count:0,cancellations:0,returns:0,delayed:0});
  res.json({items,summary,from,to,reversalAware:true,auditSource:"PosSaleActionAudit"});
}catch(error){next(error)}});

export default router;
