import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();

router.get("/catalog",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=req.user?.companyId||null;
    if(!company)return res.status(403).json({error:"Δεν υπάρχει ενεργή εταιρεία."});
    const q=String(req.query.q||"").trim();
    const like=`%${q}%`;
    const rows=await prisma.$queryRaw`
      SELECT p."id",p."sku",p."name",p."description",p."unit",p."salePrice",p."costPrice",p."vatRate",p."vatVerified",p."trackStock",p."active",p."masterProductId",
             c."name" AS "categoryName",
             COALESCE((SELECT json_agg(jsonb_build_object('barcode',pb."barcode",'unitMultiplier',pb."unitMultiplier") ORDER BY pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS barcodes,
             COALESCE(json_agg(DISTINCT jsonb_build_object('storeId',s."id",'storeName',s."name",'salePrice',sp."salePrice",'active',sp."active",'currentStock',sp."currentStock",'minStock',sp."minStock")) FILTER (WHERE s."id" IS NOT NULL),'[]') AS stores
      FROM "Product" p
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id"
      LEFT JOIN "Store" s ON s."id"=sp."storeId" AND s."companyId"=${company}
      WHERE p."companyId"=${company} AND p."active"=true AND (${q===""} OR p."name" ILIKE ${like} OR p."sku" ILIKE ${like})
      GROUP BY p."id",c."name" ORDER BY p."name" LIMIT 500`;
    res.json(rows);
  }catch(error){next(error)}
});

export default router;
