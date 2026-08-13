import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const n=value=>Number(value||0);

router.get("/:productId/movements",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const companyId=req.user?.companyId;
    const productId=String(req.params.productId||"");
    const storeId=String(req.query.storeId||"");
    if(!companyId||!storeId)return res.status(400).json({error:"Δεν βρέθηκε ενεργό κατάστημα."});
    const from=req.query.from?new Date(`${req.query.from}T00:00:00`):new Date(Date.now()-30*86400000);
    const to=req.query.to?new Date(`${req.query.to}T23:59:59.999`):new Date();
    if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to)return res.status(400).json({error:"Μη έγκυρο διάστημα ημερομηνιών."});

    const productRows=await prisma.$queryRaw`
      SELECT p."id",p."name",p."sku",COALESCE(sp."currentStock",0) AS "currentStock"
      FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id"
      JOIN "Store" st ON st."id"=sp."storeId"
      WHERE p."companyId"=${companyId} AND st."companyId"=${companyId}
        AND p."id"=${productId} AND sp."storeId"=${storeId} LIMIT 1`;
    const product=productRows[0];
    if(!product)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν στο συγκεκριμένο κατάστημα."});

    const [manual,purchases,sales]=await Promise.all([
      prisma.$queryRaw`
        SELECT sm."id",sm."createdAt",sm."movementType",sm."quantity",sm."unitCost",NULL::numeric AS "salePrice",sm."note",
               COALESCE(u."fullName",'—') AS "actorName",sm."sourceType",sm."sourceId"
        FROM "StockMovement" sm LEFT JOIN "User" u ON u."id"=sm."createdByUserId"
        WHERE sm."storeId"=${storeId} AND sm."productId"=${productId}
          AND sm."createdAt">=${from} AND sm."createdAt"<=${to}
          AND COALESCE(sm."movementType",'') NOT IN ('SALE','PURCHASE')`,
      prisma.$queryRaw`
        SELECT l."id",d."documentDate" AS "createdAt",'PURCHASE'::text AS "movementType",
               CASE WHEN l."unit"='PACKAGE' THEN l."quantity"*COALESCE(NULLIF(l."unitsPerPackage",0),1) ELSE l."quantity" END AS "quantity",
               CASE WHEN l."unit"='PACKAGE' THEN l."unitCost"/COALESCE(NULLIF(l."unitsPerPackage",0),1) ELSE l."unitCost" END AS "unitCost",
               NULL::numeric AS "salePrice",
               CONCAT('Αγορά ',COALESCE(d."documentNumber",''),CASE WHEN sup."name" IS NULL THEN '' ELSE CONCAT(' · ',sup."name") END) AS "note",
               COALESCE(u."fullName",'—') AS "actorName",'PURCHASE_DOCUMENT'::text AS "sourceType",d."id" AS "sourceId"
        FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
        LEFT JOIN "Supplier" sup ON sup."id"=d."supplierId" LEFT JOIN "User" u ON u."id"=d."createdByUserId"
        WHERE d."companyId"=${companyId} AND d."storeId"=${storeId} AND d."status"='APPROVED'
          AND l."productId"=${productId} AND d."documentDate">=${from} AND d."documentDate"<=${to}`,
      prisma.$queryRaw`
        SELECT sl."id",s."occurredAt" AS "createdAt",
               CASE WHEN s."source"='POS_REVERSAL' AND s."reversalKind"='RETURN' THEN 'RETURN'
                    WHEN s."source"='POS_REVERSAL' AND s."reversalKind"='CANCEL' THEN 'CANCEL'
                    ELSE 'SALE' END::text AS "movementType",
               CASE WHEN s."source"='POS_REVERSAL' THEN ABS(sl."quantity") ELSE -ABS(sl."quantity") END AS "quantity",
               0::numeric AS "unitCost",ABS(sl."unitPrice") AS "salePrice",
               CONCAT(CASE WHEN s."source"='POS_REVERSAL' AND s."reversalKind"='RETURN' THEN 'Επιστροφή '
                           WHEN s."source"='POS_REVERSAL' AND s."reversalKind"='CANCEL' THEN 'Ακύρωση '
                           ELSE 'Πώληση ' END,COALESCE(s."receiptNumber",s."id")) AS "note",
               COALESCE(e."fullName",'POS') AS "actorName",s."source" AS "sourceType",s."id" AS "sourceId"
        FROM "SaleLine" sl JOIN "Sale" s ON s."id"=sl."saleId"
        LEFT JOIN "Employee" e ON e."id"=s."operatorEmployeeId"
        WHERE s."companyId"=${companyId} AND s."storeId"=${storeId} AND s."status"='COMPLETED'
          AND sl."productId"=${productId} AND s."occurredAt">=${from} AND s."occurredAt"<=${to}`
    ]);

    const combined=[...manual,...purchases,...sales].map(row=>({...row,quantity:n(row.quantity),unitCost:n(row.unitCost),salePrice:row.salePrice===null?null:n(row.salePrice)})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    let running=n(product.currentStock);
    const movements=combined.map(row=>{
      const delta=n(row.quantity),stockAfter=running;
      running-=delta;
      return {...row,inQty:delta>0?delta:0,outQty:delta<0?Math.abs(delta):0,stockAfter};
    });
    res.json({product:{id:product.id,name:product.name,sku:product.sku,currentStock:n(product.currentStock)},movements});
  }catch(error){next(error)}
});

export default router;
