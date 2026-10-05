import {Router} from "express";
import {z} from "zod";
import {requireStoreModule} from "../middleware/module-access.js";
import {prisma} from "../prisma.js";
import {buildOrderSuggestions} from "../lib/order-suggestions.js";

const optionsSchema=z.object({historyDays:z.coerce.number().int().min(7).max(90).default(30),coverageDays:z.coerce.number().int().min(1).max(60).default(7),leadDays:z.coerce.number().int().min(0).max(30).default(3)});
export async function readOrderSuggestions(db,{storeId,companyId,options,now=new Date()}){
  const from=new Date(now.getTime()-options.historyDays*86400000);
  const rows=await db.$queryRaw`
    SELECT p."id" AS "productId",p."name",p."sku",p."unit",sp."currentStock",sp."minStock",
      EXISTS(SELECT 1 FROM "Recipe" r WHERE r."companyId"=${companyId} AND r."productId"=p."id" AND r."active"=TRUE)
        OR EXISTS(SELECT 1 FROM "PreparationRecipeLine" r WHERE r."companyId"=${companyId} AND r."productId"=p."id" AND r."automatic"=TRUE) AS "hasRecipe",
      COALESCE(sales."soldQuantity",0) AS "soldQuantity",COALESCE(sales."returnedQuantity",0) AS "returnedQuantity"
    FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId}
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(GREATEST(l."quantity",0)) FILTER(WHERE s."source" NOT IN ('POS_REVERSAL','WASTE','SELF_CONSUMPTION','PRODUCT_DESTRUCTION')),0) AS "soldQuantity",
        COALESCE(SUM(CASE WHEN s."source"='POS_REVERSAL' THEN ABS(l."quantity") ELSE GREATEST(-l."quantity",0) END)
          FILTER(WHERE s."source" NOT IN ('WASTE','SELF_CONSUMPTION','PRODUCT_DESTRUCTION')),0) AS "returnedQuantity"
      FROM "SaleLine" l JOIN "Sale" s ON s."id"=l."saleId"
      WHERE l."productId"=p."id" AND s."companyId"=${companyId} AND s."storeId"=${storeId}
        AND s."status"='COMPLETED' AND s."occurredAt">=${from} AND s."occurredAt"<=${now}
    ) sales ON TRUE
    WHERE sp."storeId"=${storeId} AND sp."active"=TRUE AND p."active"=TRUE AND p."trackStock"=TRUE
    ORDER BY p."name",p."id"`;
  return {storeId,generatedAt:now.toISOString(),from:from.toISOString(),to:now.toISOString(),options,rows:buildOrderSuggestions(rows,options)};
}

const router=Router();
router.get("/order-suggestions",requireStoreModule("ORDER_SUGGESTIONS"),async(req,res,next)=>{
  try{
    const parsed=optionsSchema.safeParse(req.query);
    if(!parsed.success)return res.status(400).json({error:"Έλεγξε τις ημέρες ιστορικού (7–90), κάλυψης (1–60) και παράδοσης (0–30)."});
    res.set("Cache-Control","no-store");
    res.json(await readOrderSuggestions(prisma,{storeId:req.targetStore.id,companyId:req.targetStore.companyId,options:parsed.data}));
  }catch(error){next(error);}
});
export default router;
