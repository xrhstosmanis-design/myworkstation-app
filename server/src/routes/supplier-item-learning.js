import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import commerceAdvancedOnlineSearchRoutes from "./commerce-advanced-online-search.js";

const router=Router();
const normCode=value=>String(value||"").trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"");

router.use("/advanced-online-search",commerceAdvancedOnlineSearchRoutes);

router.post("/supplier-item-mappings/resolve",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const body=z.object({
      supplierId:z.string(),
      items:z.array(z.object({
        supplierItemCode:z.string().trim().max(120).optional().nullable(),
        barcode:z.string().trim().max(120).optional().nullable(),
        description:z.string().trim().max(250).optional().nullable()
      })).min(1).max(500)
    }).parse(req.body||{});
    const supplier=await prisma.$queryRaw`SELECT "id" FROM "Supplier" WHERE "id"=${body.supplierId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`;
    if(!supplier[0])return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
    const results=[];
    for(const item of body.items){
      const code=normCode(item.supplierItemCode);
      let match=null;
      if(code){
        const rows=await prisma.$queryRaw`
          SELECT m."productId",p."name" AS "productName",p."sku",m."supplierItemCode",m."supplierBarcode",m."unitsPerPackage",m."lastUnitCost",m."usageCount",m."lastSeenAt"
          FROM "SupplierProductMapping" m
          JOIN "Product" p ON p."id"=m."productId" AND p."companyId"=${req.user.companyId} AND p."active"=true
          WHERE m."companyId"=${req.user.companyId} AND m."supplierId"=${body.supplierId}
            AND UPPER(REGEXP_REPLACE(TRIM(m."supplierItemCode"),'\\s+','','g'))=${code}
          LIMIT 1`;
        if(rows[0])match={...rows[0],matchType:"SUPPLIER_CODE"};
      }
      if(!match&&item.barcode){
        const rows=await prisma.$queryRaw`
          SELECT p."id" AS "productId",p."name" AS "productName",p."sku",b."barcode"
          FROM "ProductBarcode" b JOIN "Product" p ON p."id"=b."productId"
          WHERE p."companyId"=${req.user.companyId} AND p."active"=true AND b."barcode"=${item.barcode}
          LIMIT 1`;
        if(rows[0])match={...rows[0],matchType:"BARCODE"};
      }
      results.push({supplierItemCode:item.supplierItemCode||null,barcode:item.barcode||null,description:item.description||null,matched:Boolean(match),match});
    }
    res.json({supplierId:body.supplierId,results});
  }catch(error){next(error)}
});

router.get("/supplier-item-mappings",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const supplierId=String(req.query.supplierId||"").trim();
    if(!supplierId)return res.status(400).json({error:"Απαιτείται προμηθευτής."});
    const rows=await prisma.$queryRaw`
      SELECT m."id",m."supplierItemCode",m."supplierBarcode",m."productId",p."name" AS "productName",p."sku",m."lastDescription",m."unitsPerPackage",m."lastUnitCost",m."usageCount",m."confirmedAt",m."lastSeenAt"
      FROM "SupplierProductMapping" m JOIN "Product" p ON p."id"=m."productId"
      WHERE m."companyId"=${req.user.companyId} AND m."supplierId"=${supplierId}
      ORDER BY m."lastSeenAt" DESC,m."supplierItemCode"`;
    res.json(rows);
  }catch(error){next(error)}
});

export default router;
