import crypto from "crypto";
import {Router} from "express";
import {prisma} from "../prisma.js";
import {advancedOnlineProductSearch,advancedProviderConfigured} from "../advanced-online-product-search.js";

const router=Router();
const uid=()=>crypto.randomUUID();
const isSuper=req=>req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN"||req.user?.role==="SUPER_ADMIN";

router.use((req,res,next)=>{if(!isSuper(req))return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});next()});

router.get("/status",async(req,res)=>{
  res.json({enabled:true,bypassEntitlement:true,providerConfigured:advancedProviderConfigured(),scope:"PLATFORM_SUPER_ADMIN"});
});

router.get("/options",async(req,res,next)=>{
  try{
    const categories=await prisma.$queryRaw`SELECT DISTINCT TRIM("categoryName") AS "name" FROM "MasterProduct" WHERE "active"=true AND NULLIF(TRIM("categoryName"),'') IS NOT NULL ORDER BY 1`;
    const pairs=await prisma.$queryRaw`SELECT DISTINCT TRIM("categoryName") AS "categoryName",TRIM("subcategoryName") AS "name" FROM "MasterProduct" WHERE "active"=true AND NULLIF(TRIM("categoryName"),'') IS NOT NULL AND NULLIF(TRIM("subcategoryName"),'') IS NOT NULL ORDER BY 1,2`;
    res.json({categories:categories.map(x=>x.name),subcategories:pairs});
  }catch(error){next(error)}
});

router.get("/search",async(req,res,next)=>{
  try{
    const q=String(req.query.q||"").trim();
    if(!/^\d{6,18}$/.test(q))return res.status(400).json({error:"Η Advanced Online Search του Master Catalog γίνεται με έγκυρο barcode 6–18 ψηφίων."});
    const local=await prisma.$queryRaw`SELECT mp."id",mp."sourceCode",mp."name",mp."categoryName",mp."subcategoryName",mp."vatRate",mp."brandName",COALESCE((SELECT json_agg(mpb."barcode") FROM "MasterProductBarcode" mpb WHERE mpb."masterProductId"=mp."id"),'[]') AS "barcodes" FROM "MasterProduct" mp WHERE mp."active"=true AND (mp."sourceCode"=${q} OR EXISTS (SELECT 1 FROM "MasterProductBarcode" b WHERE b."masterProductId"=mp."id" AND b."barcode"=${q})) LIMIT 5`;
    if(local.length)return res.json({source:"MASTER_CATALOG",rows:local,advanced:{enabled:true,bypassEntitlement:true,reason:"FOUND_LOCAL"}});
    const advanced=await advancedOnlineProductSearch({companyId:"PLATFORM_SUPER_ADMIN",storeId:"MASTER_CATALOG",actorId:req.user.id,barcode:q,bypassEntitlement:true,usageContext:"MASTER_CATALOG"});
    res.json({source:advanced.rows?.length?"GOOGLE_SEARCH":"NONE",rows:advanced.rows||[],advanced});
  }catch(error){next(error)}
});

router.post("/master-product",async(req,res,next)=>{
  try{
    const body=req.body&&typeof req.body==="object"?req.body:{};
    const barcode=String(body.barcode||"").trim(),name=String(body.name||"").trim().replace(/\s+/g," ");
    const categoryName=String(body.categoryName||"").trim().replace(/\s+/g," "),subcategoryName=String(body.subcategoryName||"").trim().replace(/\s+/g," "),brandName=String(body.brandName||"").trim().replace(/\s+/g," ");
    const vatRate=body.vatRate===""||body.vatRate===null||body.vatRate===undefined?null:Number(body.vatRate),retail=body.defaultRetailPrice===""||body.defaultRetailPrice===null||body.defaultRetailPrice===undefined?null:Number(body.defaultRetailPrice),cost=body.defaultCostPrice===""||body.defaultCostPrice===null||body.defaultCostPrice===undefined?null:Number(body.defaultCostPrice);
    if(!/^\d{6,18}$/.test(barcode))return res.status(400).json({error:"Βάλε έγκυρο barcode."});
    if(name.length<2||name.length>250)return res.status(400).json({error:"Συμπλήρωσε σωστή περιγραφή προϊόντος."});
    if(!categoryName)return res.status(400).json({error:"Επίλεξε ή γράψε Κατηγορία."});
    if(vatRate!==null&&(!Number.isFinite(vatRate)||vatRate<0||vatRate>100))return res.status(400).json({error:"Έλεγξε τον ΦΠΑ."});
    if(retail!==null&&(!Number.isFinite(retail)||retail<0))return res.status(400).json({error:"Έλεγξε τη λιανική τιμή."});
    if(cost!==null&&(!Number.isFinite(cost)||cost<0))return res.status(400).json({error:"Έλεγξε την τιμή αγοράς."});
    const existing=(await prisma.$queryRaw`SELECT mp."id",mp."sourceCode",mp."name" FROM "MasterProduct" mp WHERE mp."sourceCode"=${barcode} OR EXISTS (SELECT 1 FROM "MasterProductBarcode" b WHERE b."masterProductId"=mp."id" AND b."barcode"=${barcode}) LIMIT 1`)[0];
    if(existing)return res.status(409).json({error:`Το barcode υπάρχει ήδη στον Master Catalog στο «${existing.name}».`,existing});
    const id=uid(),sourceCode=barcode;
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO "MasterProduct" ("id","sourceCode","name","categoryName","subcategoryName","brandName","defaultRetailPrice","defaultCostPrice","vatRate","vatVerified","active","reviewStatus","importVersion") VALUES (${id},${sourceCode},${name},${categoryName},${subcategoryName||null},${brandName||null},${retail},${cost},${vatRate},${vatRate!==null},true,'ONLINE_CONFIRMED','ADVANCED_ONLINE_SEARCH')`;
      await tx.$executeRaw`INSERT INTO "MasterProductBarcode" ("id","masterProductId","barcode","scanEnabled","duplicateBarcode") VALUES (${uid()},${id},${barcode},true,false)`;
    });
    res.status(201).json({ok:true,id,sourceCode,barcode,name,categoryName,subcategoryName:subcategoryName||null,brandName:brandName||null,vatRate,defaultRetailPrice:retail,defaultCostPrice:cost,source:"ADVANCED_ONLINE_SEARCH"});
  }catch(error){next(error)}
});

export default router;
