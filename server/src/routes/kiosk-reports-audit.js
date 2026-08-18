import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {ensureKioskReportAuditSchema,insertKioskAuditEvent} from "../kiosk-report-audit.js";

const router=Router();
const managementRoles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const n=value=>Number(value||0);
const dayStart=value=>{const d=value?new Date(`${String(value).slice(0,10)}T00:00:00`):new Date(Date.now()-30*86400000);return Number.isNaN(d.getTime())?new Date(Date.now()-30*86400000):d};
const dayEndExclusive=value=>{const d=value?new Date(`${String(value).slice(0,10)}T00:00:00`):new Date();if(Number.isNaN(d.getTime()))return new Date(Date.now()+86400000);d.setDate(d.getDate()+1);return d};
const filters=req=>({companyId:req.user.companyId,from:dayStart(req.query.from),to:dayEndExclusive(req.query.to),storeId:String(req.query.storeId||"")||null,q:String(req.query.q||"").trim()||null});

function requireManagement(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!managementRoles.has(req.user?.role))return res.status(403).json({error:"Η αναφορά είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}

router.use(async(req,res,next)=>{try{await ensureKioskReportAuditSchema();next()}catch(error){next(error)}});

router.post("/sale-list-deletions",async(req,res,next)=>{
  try{
    const body=z.object({
      storeId:z.string().min(1),
      action:z.enum(["ITEM_REMOVE","CLEAR_CART"]),
      reason:z.string().trim().max(300).optional().nullable(),
      shiftId:z.string().max(120).optional().nullable(),
      items:z.array(z.object({
        productId:z.string().optional().nullable(),name:z.string().trim().min(1).max(250),sku:z.string().max(100).optional().nullable(),
        quantity:z.coerce.number().positive().max(100000),unitPrice:z.coerce.number().min(0).max(999999999)
      })).min(1).max(250)
    }).parse(req.body||{});
    const store=await prisma.store.findFirst({where:{id:body.storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&String(req.user.storeId||"")!==store.id)return res.status(403).json({error:"Η καταγραφή επιτρέπεται μόνο για το ενεργό κατάστημα του χειριστή."});
    const actorId=req.user.operatorId||req.user.id||null,actorName=req.user.fullName||req.user.name||req.user.email||"Χρήστης";
    const eventType=body.action==="CLEAR_CART"?"SALE_LIST_CLEAR":"SALE_LIST_DELETE";
    await prisma.$transaction(async tx=>{
      for(const item of body.items)await insertKioskAuditEvent({
        companyId:req.user.companyId,storeId:store.id,eventType,productId:item.productId||null,productName:item.name,sku:item.sku||null,
        quantity:item.quantity,unitPrice:item.unitPrice,reason:body.reason||null,shiftId:body.shiftId||null,actorId,actorName,
        sourceType:"MYWORKSTATION_POS",details:{action:body.action,lineTotal:item.quantity*item.unitPrice,storeName:store.name}
      },tx);
    });
    res.status(201).json({ok:true,recorded:body.items.length});
  }catch(error){next(error)}
});

router.get("/sale-deletions",requireManagement,async(req,res,next)=>{
  try{
    const {companyId,from,to,storeId,q}=filters(req),text=q?`%${q}%`:null;
    const rows=await prisma.$queryRaw`
      SELECT a."id",a."createdAt",a."eventType",a."productId",a."productName",a."sku",a."quantity",a."unitPrice",a."reason",a."shiftId",a."actorName",a."details",
        s."name" AS "storeName",p."salePrice",c."name" AS "categoryName",mp."subcategoryName"
      FROM "KioskAuditEvent" a
      LEFT JOIN "Store" s ON s."id"=a."storeId" AND s."companyId"=a."companyId"
      LEFT JOIN "Product" p ON p."id"=a."productId" AND p."companyId"=a."companyId"
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
      WHERE a."companyId"=${companyId} AND a."eventType" IN ('SALE_LIST_DELETE','SALE_LIST_CLEAR')
        AND a."createdAt">=${from} AND a."createdAt"<${to}
        AND (${storeId}::text IS NULL OR a."storeId"=${storeId})
        AND (${text}::text IS NULL OR COALESCE(a."productName",'') ILIKE ${text} OR COALESCE(a."sku",'') ILIKE ${text})
      ORDER BY a."createdAt" DESC LIMIT 10000`;
    const items=rows.map(r=>({...r,quantity:n(r.quantity),unitPrice:n(r.unitPrice),salePrice:n(r.salePrice),lineTotal:n(r.quantity)*n(r.unitPrice)}));
    res.json({items,count:items.length,totalValue:items.reduce((a,r)=>a+r.lineTotal,0),auditFromNow:true});
  }catch(error){next(error)}
});

router.get("/deactivations",requireManagement,async(req,res,next)=>{
  try{
    const {companyId,from,to,storeId,q}=filters(req),text=q?`%${q}%`:null;
    const rows=await prisma.$queryRaw`
      SELECT a."id",a."createdAt",a."productId",a."productName",a."sku",a."oldActive",a."newActive",a."reason",a."sourceType",a."actorName",
        s."name" AS "storeName",p."salePrice",COALESCE(sp."currentStock",0) AS "currentStock"
      FROM "KioskAuditEvent" a
      LEFT JOIN "Store" s ON s."id"=a."storeId" AND s."companyId"=a."companyId"
      LEFT JOIN "Product" p ON p."id"=a."productId" AND p."companyId"=a."companyId"
      LEFT JOIN "StoreProduct" sp ON sp."productId"=a."productId" AND sp."storeId"=a."storeId"
      WHERE a."companyId"=${companyId} AND a."eventType"='PRODUCT_ACTIVE_CHANGE' AND a."newActive"=FALSE
        AND a."createdAt">=${from} AND a."createdAt"<${to}
        AND (${storeId}::text IS NULL OR a."storeId"=${storeId} OR a."storeId" IS NULL)
        AND (${text}::text IS NULL OR COALESCE(a."productName",'') ILIKE ${text} OR COALESCE(a."sku",'') ILIKE ${text})
      ORDER BY a."createdAt" DESC LIMIT 10000`;
    res.json({items:rows.map(r=>({...r,salePrice:n(r.salePrice),currentStock:n(r.currentStock)})),count:rows.length,auditFromNow:true});
  }catch(error){next(error)}
});

router.get("/audit-events",requireManagement,async(req,res,next)=>{
  try{
    const {companyId,from,to,storeId,q}=filters(req),text=q?`%${q}%`:null;
    const transactionRows=await prisma.$queryRaw`
      SELECT t."id",t."occurredAt" AS "createdAt",t."type" AS "eventType",t."amount",t."description",t."supplierId",t."supplierName",
        t."sessionId" AS "shiftId",t."actorId",t."actorName",t."subtractFromShift",t."reversedAt",t."reversedByName",t."reversalReason",
        s."name" AS "storeName"
      FROM "StoreTransaction" t
      LEFT JOIN "Store" s ON s."id"=t."storeId" AND s."companyId"=t."companyId"
      WHERE t."companyId"=${companyId}
        AND t."occurredAt">=${from} AND t."occurredAt"<${to}
        AND (${storeId}::text IS NULL OR t."storeId"=${storeId})
        AND (${text}::text IS NULL
          OR COALESCE(t."description",'') ILIKE ${text}
          OR COALESCE(t."supplierName",'') ILIKE ${text}
          OR COALESCE(t."actorName",'') ILIKE ${text}
          OR COALESCE(t."type",'') ILIKE ${text}
          OR COALESCE(t."id",'') ILIKE ${text})
      ORDER BY t."occurredAt" DESC LIMIT 10000`;
    const actionRows=await prisma.$queryRaw`
      SELECT a."id",a."createdAt",a."actionType",a."reason",a."actorId",a."actorName",a."saleId",a."relatedSaleId",a."details",
        s."name" AS "storeName"
      FROM "PosSaleActionAudit" a
      LEFT JOIN "Store" s ON s."id"=a."storeId" AND s."companyId"=a."companyId"
      WHERE a."companyId"=${companyId} AND a."actionType" IN ('RETURN','CANCEL','RETURN_ITEMS','SELF_CONSUMPTION','PRODUCT_DESTRUCTION')
        AND a."createdAt">=${from} AND a."createdAt"<${to}
        AND (${storeId}::text IS NULL OR a."storeId"=${storeId})
        AND (${text}::text IS NULL
          OR COALESCE(a."reason",'') ILIKE ${text}
          OR COALESCE(a."actorName",'') ILIKE ${text}
          OR COALESCE(a."actionType",'') ILIKE ${text}
          OR COALESCE(a."saleId",'') ILIKE ${text}
          OR COALESCE(a."relatedSaleId",'') ILIKE ${text})
      ORDER BY a."createdAt" DESC LIMIT 10000`;
    const transactionItems=transactionRows.map(r=>({...r,amount:n(r.amount),sourceType:"StoreTransaction",paymentSource:r.subtractFromShift?"CASH_SHIFT":"EXTERNAL"}));
    const actionItems=actionRows.map(r=>{
      const details=r.details&&typeof r.details==="object"?r.details:{};
      const isFullReturn=r.actionType==="RETURN",isPartialReturn=r.actionType==="RETURN_ITEMS",isSelfConsumption=r.actionType==="SELF_CONSUMPTION",isDestruction=r.actionType==="PRODUCT_DESTRUCTION";
      const amount=isPartialReturn?-Math.abs(n(details.refund||0)):(isSelfConsumption||isDestruction)?n(details.referenceValue||0):-Math.abs(n(details.originalTotal||details.reversalTotal||0));
      const eventType=isPartialReturn?"POS_RETURN_ITEMS":isFullReturn?"POS_RETURN":isSelfConsumption?"POS_SELF_CONSUMPTION":isDestruction?"POS_PRODUCT_DESTRUCTION":"POS_CANCEL";
      const description=isPartialReturn
        ?`ΜΕΡΙΚΗ ΕΠΙΣΤΡΟΦΗ · αρχική πώληση ${r.relatedSaleId||"—"} · επιστροφή ${r.saleId||"—"}${r.reason?` · ${r.reason}`:""}`
        :isFullReturn
          ?`ΟΛΙΚΗ ΕΠΙΣΤΡΟΦΗ · αρχική πώληση ${r.relatedSaleId||"—"} · επιστροφή ${r.saleId||"—"}${r.reason?` · ${r.reason}`:""}`
          :isSelfConsumption
            ?`ΙΔΙΑ / ΠΡΟΣΩΠΙΚΗ ΚΑΤΑΝΑΛΩΣΗ · χωρίς απόδειξη · δεν μετρά στον τζίρο · ${r.saleId||"—"}`
            :isDestruction
              ?`ΚΑΤΑΣΤΡΟΦΗ ΠΡΟΪΟΝΤΩΝ · χωρίς απόδειξη · δεν μετρά στον τζίρο · ${r.saleId||"—"}${r.reason?` · ${r.reason}`:""}`
              :`ΑΚΥΡΩΣΗ ΠΩΛΗΣΗΣ · αρχική πώληση ${r.relatedSaleId||"—"} · αντιλογισμός ${r.saleId||"—"}${r.reason?` · ${r.reason}`:""}`;
      return {
        id:r.id,createdAt:r.createdAt,eventType,amount,description,
        supplierId:null,supplierName:null,shiftId:details.sessionId||null,actorId:r.actorId,actorName:r.actorName,subtractFromShift:false,
        reversedAt:null,reversedByName:null,reversalReason:r.reason||null,storeName:r.storeName,sourceType:"PosSaleActionAudit",paymentSource:"AUDIT_EVENT"
      };
    });
    const items=[...transactionItems,...actionItems].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,10000);
    res.json({items,count:items.length,sourceOfTruth:"StoreTransaction + PosSaleActionAudit"});
  }catch(error){next(error)}
});

export default router;
