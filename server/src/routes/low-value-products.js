import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireStoreModule} from "../middleware/module-access.js";
import {buildLowValueProducts} from "../lib/low-value-products.js";

const optionsSchema=z.object({historyDays:z.coerce.number().int().min(7).max(365).default(30),slowDays:z.coerce.number().int().min(1).max(730).default(90),marginPercent:z.coerce.number().min(0).max(100).default(20)});
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
export async function readLowValueProducts(db,{storeId,companyId,options,now=new Date()}){
  const from=new Date(now.getTime()-options.historyDays*86400000);
  const products=await db.$queryRaw`
    SELECT p."id" AS "productId",p."name",p."sku",p."unit",p."trackStock",sp."currentStock",
      EXISTS(SELECT 1 FROM "Recipe" r WHERE r."companyId"=${companyId} AND r."productId"=p."id" AND r."active"=TRUE)
      OR EXISTS(SELECT 1 FROM "PreparationRecipeLine" r WHERE r."companyId"=${companyId} AND r."productId"=p."id" AND r."automatic"=TRUE) AS "hasRecipe"
    FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId}
    WHERE sp."storeId"=${storeId} AND sp."active"=TRUE AND p."active"=TRUE
    ORDER BY p."name",p."id" LIMIT 10001`;
  if(products.length>10000)throw Object.assign(Error("Η αναφορά ξεπερνά τα 10.000 ενεργά είδη· χρειάζεται περιορισμός καταλόγου πριν τον πλήρη έλεγχο."),{status:422});
  const sales=await db.$queryRaw`
    SELECT l."id" AS "lineId",l."productId",l."quantity",l."lineTotal",l."vatRate",s."source",s."occurredAt",original."occurredAt" AS "originalOccurredAt",
      CASE WHEN s."total" IS NULL OR totals."amount" IS NULL THEN FALSE
        WHEN s."source"='POS_REVERSAL' THEN ABS(ABS(s."total")-ABS(totals."amount"))<=0.011
        ELSE ABS(s."total"-totals."amount")<=0.011 END AS "amountsReconciled"
    FROM "SaleLine" l JOIN "Sale" s ON s."id"=l."saleId"
    JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=${companyId} AND p."active"=TRUE
    JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"=TRUE
    LEFT JOIN LATERAL (SELECT SUM(allLine."lineTotal") AS "amount" FROM "SaleLine" allLine WHERE allLine."saleId"=s."id") totals ON TRUE
    LEFT JOIN "Sale" original ON s."source"='POS_REVERSAL' AND original."id"=s."originalSaleId"
      AND original."companyId"=${companyId} AND original."storeId"=${storeId} AND original."status"='COMPLETED' AND original."source"<>'POS_REVERSAL'
      AND EXISTS(SELECT 1 FROM "SaleLine" originalLine WHERE originalLine."saleId"=original."id" AND originalLine."productId"=l."productId" AND originalLine."quantity">0)
    WHERE s."companyId"=${companyId} AND s."storeId"=${storeId} AND s."status"='COMPLETED'
      AND COALESCE(s."source",'') NOT IN ('WASTE','SELF_CONSUMPTION','PRODUCT_DESTRUCTION')
      AND s."occurredAt">=${from} AND s."occurredAt"<=${now}
    ORDER BY s."occurredAt",s."id",l."id" LIMIT 100001`;
  const purchases=await db.$queryRaw`
    SELECT l."id" AS "lineId",l."productId",l."quantity",l."unit",l."unitsPerPackage",l."netAmount",
      d."id" AS "documentId",d."documentNumber",d."documentDate",d."createdAt" AS "documentCreatedAt",d."sourceType",
      correction."id" AS "correctionId",correction."unitCost" AS "correctedUnitCost",correction."createdAt" AS "correctionAt",
      original."baseQuantity" AS "orderBaseQuantity",original."netAmount" AS "orderNetAmount",original."invalidUnits" AS "orderInvalidUnits"
    FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
    JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=${companyId} AND p."active"=TRUE
    JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"=TRUE
    LEFT JOIN LATERAL (
      SELECT sm."id",sm."unitCost",sm."createdAt" FROM "StockMovement" sm
      WHERE d."sourceType"='PURCHASE_ORDER' AND sm."sourceType"='PURCHASE_ORDER' AND sm."sourceId"=d."id"
        AND sm."storeId"=${storeId} AND sm."productId"=p."id" AND sm."movementType"='PURCHASE_PACK_CORRECTION' AND sm."createdAt"<=${now}
      ORDER BY sm."createdAt" DESC,sm."id" DESC LIMIT 1
    ) correction ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(pl."quantity"*pl."stockUnitsPerInvoiceUnit") AS "baseQuantity",SUM(pl."netAmount"+COALESCE(pl."exciseTotal",0)) AS "netAmount",
        COUNT(*) FILTER(WHERE pl."stockUnitsPerInvoiceUnit" IS NULL OR pl."stockUnitsPerInvoiceUnit"<=0 OR pl."quantity"<=0 OR pl."netAmount"<0
          OR UPPER(TRIM(COALESCE(pl."invoiceUnit",''))) NOT IN ('PIECE','ΤΜΧ','PACKAGE'))::int AS "invalidUnits"
      FROM "PurchaseOrder" po JOIN "PurchaseOrderLine" pl ON pl."orderId"=po."id"
      WHERE po."id"=d."id" AND po."companyId"=${companyId} AND po."storeId"=${storeId} AND po."status"='FINAL' AND pl."productId"=p."id"
    ) original ON d."sourceType"='PURCHASE_ORDER'
    WHERE d."companyId"=${companyId} AND d."storeId"=${storeId} AND d."status"='APPROVED' AND d."documentType"='INVOICE' AND d."documentDate"<=${now}
    ORDER BY d."documentDate" DESC,d."createdAt" DESC,d."id",l."id" LIMIT 100001`;
  if(sales.length>100000||purchases.length>100000)throw Object.assign(Error("Υπάρχουν περισσότερες από 100.000 γραμμές· δεν εμφανίζεται ελλιπής αναφορά. Περιόρισε την περίοδο ή ζήτησε εξειδικευμένη εξαγωγή."),{status:422});
  return {storeId,generatedAt:now.toISOString(),from:from.toISOString(),to:now.toISOString(),options,rows:buildLowValueProducts(products,sales,purchases,options)};
}

const router=Router();
router.get("/low-value-products",requireStoreModule("LOW_VALUE_PRODUCTS"),async(req,res,next)=>{
  try{
    if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η αναφορά είναι διαθέσιμη μόνο σε διαχειριστικούς ρόλους.",code:"ROLE_MODULE_DENIED"});
    const parsed=optionsSchema.safeParse(req.query);
    if(!parsed.success)return res.status(400).json({error:"Έλεγξε το ιστορικό (7–365), τις ημέρες αργής κίνησης (1–730) και το όριο περιθωρίου (0–100%)."});
    res.set("Cache-Control","no-store");
    const result=await prisma.$transaction(tx=>readLowValueProducts(tx,{storeId:req.targetStore.id,companyId:req.targetStore.companyId,options:parsed.data}),{isolationLevel:"RepeatableRead",timeout:30000});
    res.json(result);
  }catch(error){next(error);}
});
export default router;
