import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const uid=()=>crypto.randomUUID();
const companyId=req=>req.user?.companyId||null;

router.post("/new",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);if(!company)return res.status(403).json({error:"Δεν υπάρχει ενεργή εταιρεία."});
    const body=z.object({name:z.string().trim().min(2).max(250),sku:z.string().trim().max(80).optional().or(z.literal("")),categoryName:z.string().trim().max(160).optional().or(z.literal("")),unit:z.enum(["PIECE","KG","LITER","PACKAGE"]).default("PIECE"),salePrice:z.coerce.number().min(0).default(0),costPrice:z.coerce.number().min(0).default(0),vatRate:z.coerce.number().min(0).max(100).default(0),vatVerified:z.boolean().default(false),trackStock:z.boolean().default(true),active:z.boolean().default(true),barcode:z.string().trim().max(80).optional().or(z.literal("")),storeIds:z.array(z.string().min(1)).max(500).default([])}).parse(req.body||{});
    if(body.sku){const d=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${company} AND "sku"=${body.sku} LIMIT 1`;if(d[0])return res.status(409).json({error:"Ο κωδικός/SKU χρησιμοποιείται ήδη."})}
    if(body.barcode){const d=await prisma.$queryRaw`SELECT pb."id" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${company} AND pb."barcode"=${body.barcode} LIMIT 1`;if(d[0])return res.status(409).json({error:"Το barcode χρησιμοποιείται ήδη."})}
    const validStores=body.storeIds.length?await prisma.store.findMany({where:{companyId:company,id:{in:body.storeIds}},select:{id:true}}):await prisma.store.findMany({where:{companyId:company,active:true},select:{id:true}});
    if(body.storeIds.length&&validStores.length!==new Set(body.storeIds).size)return res.status(400).json({error:"Υπάρχει μη έγκυρο κατάστημα."});
    const productId=uid();
    await prisma.$transaction(async tx=>{
      let categoryId=null;if(body.categoryName){const c=await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${company} AND "name"=${body.categoryName} LIMIT 1`;categoryId=c[0]?.id||uid();if(!c[0])await tx.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name") VALUES (${categoryId},${company},${body.categoryName})`}
      await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","sku","name","unit","vatRate","vatVerified","salePrice","costPrice","trackStock","active") VALUES (${productId},${company},${categoryId},${body.sku||null},${body.name},${body.unit},${body.vatRate},${body.vatVerified},${body.salePrice},${body.costPrice},${body.trackStock},${body.active})`;
      if(body.barcode)await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${uid()},${productId},${body.barcode},1)`;
      for(const store of validStores)await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","active") VALUES (${uid()},${store.id},${productId},${body.salePrice},${body.active}) ON CONFLICT ("storeId","productId") DO NOTHING`;
    });
    res.status(201).json({id:productId});
  }catch(error){next(error)}
});

router.patch("/bulk-card",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);if(!company)return res.status(403).json({error:"Δεν υπάρχει ενεργή εταιρεία."});
    const body=z.object({productIds:z.array(z.string().min(1)).min(1).max(500),categoryName:z.string().trim().max(160).optional(),vatRate:z.coerce.number().min(0).max(100).optional(),salePrice:z.coerce.number().min(0).optional(),active:z.boolean().optional(),trackStock:z.boolean().optional()}).parse(req.body||{});
    const ids=[...new Set(body.productIds)];const found=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${company} AND "id"=ANY(${ids}::text[])`;if(found.length!==ids.length)return res.status(400).json({error:"Υπάρχει μη έγκυρο προϊόν στην επιλογή."});
    await prisma.$transaction(async tx=>{
      let categoryId;if(body.categoryName!==undefined){categoryId=null;if(body.categoryName){const c=await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${company} AND "name"=${body.categoryName} LIMIT 1`;categoryId=c[0]?.id||uid();if(!c[0])await tx.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name") VALUES (${categoryId},${company},${body.categoryName})`}}
      for(const id of ids){
        if(body.categoryName!==undefined)await tx.$executeRaw`UPDATE "Product" SET "categoryId"=${categoryId},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
        if(body.vatRate!==undefined)await tx.$executeRaw`UPDATE "Product" SET "vatRate"=${body.vatRate},"vatVerified"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
        if(body.salePrice!==undefined){await tx.$executeRaw`UPDATE "Product" SET "salePrice"=${body.salePrice},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}`;await tx.$executeRaw`UPDATE "StoreProduct" SET "salePrice"=${body.salePrice},"updatedAt"=CURRENT_TIMESTAMP WHERE "productId"=${id}`}
        if(body.active!==undefined)await tx.$executeRaw`UPDATE "Product" SET "active"=${body.active},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
        if(body.trackStock!==undefined)await tx.$executeRaw`UPDATE "Product" SET "trackStock"=${body.trackStock},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
      }
    });res.json({ok:true,changed:ids.length});
  }catch(error){next(error)}
});

export default router;
