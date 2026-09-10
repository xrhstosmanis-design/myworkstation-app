import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const norm=value=>String(value||"").trim().toUpperCase().replace(/\s+/g," ");
const aliasKey=value=>{
  const n=norm(value);
  if(["FREDDO CAP 4ΑΠΛΟΣ","FREDDO CAP 4ΠΛΟΣ","FREDDO CAPPUCCINO 4ΑΠΛΟΣ"].includes(n))return "FREDDO CAP 4ΑΠΛΟΣ";
  if(["FREDDO ESPRESO 4ΠΛΟ","FREDDO ESPRESSO 4ΠΛΟ"].includes(n))return "FREDDO ESPRESSO 4ΠΛΟ";
  return n;
};
const isDrinkName=value=>/ESPRESSO|ESPRESO|FREDDO|CAPPUCCINO|CAP\s|LATTE|AMERICANO|MACCHIATO|FLAT WHITE|CORTADO|MOCHA|ΕΛΛΗΝΙΚ|NESCAFE|ΦΡΑΠ|ΚΑΦΕΣ ΦΙΛΤΡΟΥ|ΣΟΚΟΛΑΤ|ΤΣΑΙ|ΤΣΑΪ|MATCHA|ΧΑΜΟΜΗΛ/.test(norm(value));
const priority=row=>{const sku=String(row.sku||"");if(sku.startsWith("MWS-KAT-BEV-"))return 30;if(sku.startsWith("MWS-"))return 20;return 10};

router.get("/catalog",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=req.user?.companyId||null;
    if(!company)return res.status(403).json({error:"Δεν υπάρχει ενεργή εταιρεία."});
    const q=String(req.query.q||"").trim();
    const like=`%${q}%`;
    const rows=await prisma.$queryRaw`
      SELECT p."id",p."sku",p."name",p."description",p."unit",p."salePrice",p."costPrice",p."vatRate",p."vatVerified",p."trackStock",p."active",p."masterProductId",p."categoryId",p."subcategoryId",
             p."staffPrice",p."deliveryPrice",p."minOrderQuantity",p."capacity",p."allowDiscount",p."allowPosPriceChange",p."freeSalePrice",p."negativeStockWarning",p."isSet",p."isRecipe",p."discountA",p."discountB",p."discountC",
             c."name" AS "categoryName",sc."name" AS "subcategoryName",COALESCE(pc."name",mp."brandName") AS "productCompanyName",
             COALESCE((SELECT json_agg(jsonb_build_object('id',pb."id",'barcode',pb."barcode",'unitMultiplier',pb."unitMultiplier",'salePrice',pb."salePrice",'name',pb."name",'updatedAt',pb."updatedAt") ORDER BY pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS barcodes,
             COALESCE(json_agg(DISTINCT jsonb_build_object('storeId',s."id",'storeName',s."name",'salePrice',sp."salePrice",'active',sp."active",'currentStock',sp."currentStock",'minStock',sp."minStock")) FILTER (WHERE s."id" IS NOT NULL),'[]') AS stores
      FROM "Product" p
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN "ProductSubcategory" sc ON sc."id"=p."subcategoryId"
      LEFT JOIN "ManagementProductCompany" pc ON pc."id"=p."productCompanyId"
      LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
      LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id"
      LEFT JOIN "Store" s ON s."id"=sp."storeId" AND s."companyId"=${company}
      WHERE p."companyId"=${company} AND p."active"=true AND (${q===""} OR p."name" ILIKE ${like} OR p."sku" ILIKE ${like})
      GROUP BY p."id",c."name",sc."name",pc."name",mp."brandName" ORDER BY p."name" LIMIT 500`;
    const bestByDrink=new Map(),passthrough=[];
    for(const row of rows){
      if(!isDrinkName(row.name)){passthrough.push(row);continue}
      const key=aliasKey(row.name),current=bestByDrink.get(key);
      if(!current||priority(row)>priority(current))bestByDrink.set(key,row);
    }
    res.json([...passthrough,...bestByDrink.values()].sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"el")));
  }catch(error){next(error)}
});
export default router;
