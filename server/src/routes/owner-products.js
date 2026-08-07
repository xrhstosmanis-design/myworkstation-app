import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const uid=()=>crypto.randomUUID();
const money=value=>value===null||value===undefined?null:Number(value);

function companyId(req){return req.user?.companyId||null;}
async function ownedStore(company,storeId){
  if(!company||!storeId)return null;
  return prisma.store.findFirst({where:{id:String(storeId),companyId:company},select:{id:true,name:true}});
}
async function ownedProduct(company,productId){
  const rows=await prisma.$queryRaw`SELECT "id","name","salePrice","costPrice","vatRate","vatVerified","masterProductId" FROM "Product" WHERE "id"=${String(productId)} AND "companyId"=${company} LIMIT 1`;
  return rows[0]||null;
}

router.get("/stores",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    if(!company)return res.status(403).json({error:"Δεν υπάρχει ενεργή εταιρεία."});
    const rows=await prisma.store.findMany({where:{companyId:company},select:{id:true,name:true,city:true,active:true},orderBy:{name:"asc"}});
    res.json(rows);
  }catch(error){next(error)}
});

router.get("/master",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const q=String(req.query.q||"").trim();
    if(q.length<2)return res.json([]);
    const like=`%${q}%`;
    const rows=await prisma.$queryRaw`
      SELECT mp."id",mp."sourceCode",mp."name",mp."categoryName",mp."subcategoryName",mp."supplierName",mp."brandName",
             mp."defaultRetailPrice",mp."defaultCostPrice",mp."vatRate",mp."vatVerified",
             COALESCE(json_agg(mb."barcode") FILTER (WHERE mb."barcode" IS NOT NULL AND mb."scanEnabled"=true),'[]') AS "safeBarcodes",
             COUNT(mb."barcode") FILTER (WHERE mb."duplicateBarcode"=true)::int AS "duplicateBarcodeCount",
             p."id" AS "companyProductId"
      FROM "MasterProduct" mp
      LEFT JOIN "MasterProductBarcode" mb ON mb."masterProductId"=mp."id"
      LEFT JOIN "Product" p ON p."companyId"=${company} AND p."masterProductId"=mp."id"
      WHERE mp."active"=true AND (mp."name" ILIKE ${like} OR mp."sourceCode" ILIKE ${like} OR mb."barcode" ILIKE ${like})
      GROUP BY mp."id",p."id"
      ORDER BY mp."name" LIMIT 100`;
    res.json(rows);
  }catch(error){next(error)}
});

router.post("/activate",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const body=z.object({
      masterProductId:z.string().min(1),
      basePrice:z.coerce.number().min(0).nullable().optional(),
      storeConfigs:z.array(z.object({storeId:z.string().min(1),active:z.boolean().default(true),salePrice:z.coerce.number().min(0).nullable().optional()})).max(500)
    }).parse(req.body||{});
    const masterRows=await prisma.$queryRaw`SELECT "id","sourceCode","name","categoryName","defaultRetailPrice","defaultCostPrice","vatRate","vatVerified" FROM "MasterProduct" WHERE "id"=${body.masterProductId} AND "active"=true LIMIT 1`;
    const master=masterRows[0];
    if(!master)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν στον Master Catalog."});
    const storeIds=[...new Set(body.storeConfigs.map(x=>x.storeId))];
    const stores=await prisma.store.findMany({where:{companyId:company,id:{in:storeIds}},select:{id:true,name:true}});
    if(stores.length!==storeIds.length)return res.status(400).json({error:"Υπάρχει μη έγκυρο κατάστημα στην επιλογή."});

    const existing=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${company} AND "masterProductId"=${master.id} LIMIT 1`;
    const productId=existing[0]?.id||uid();
    const requestedBase=body.basePrice===undefined||body.basePrice===null?money(master.defaultRetailPrice):body.basePrice;
    const basePrice=requestedBase??0;
    const cost=money(master.defaultCostPrice)??0;
    const vatVerified=master.vatVerified===true;
    const vat=vatVerified?(money(master.vatRate)??0):0;

    await prisma.$transaction(async tx=>{
      let categoryId=null;
      if(master.categoryName){
        const categoryRows=await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${company} AND "name"=${master.categoryName} LIMIT 1`;
        categoryId=categoryRows[0]?.id||uid();
        if(!categoryRows[0])await tx.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name") VALUES (${categoryId},${company},${master.categoryName})`;
      }
      if(!existing[0]){
        await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","sku","name","unit","vatRate","vatVerified","salePrice","costPrice","trackStock","active","masterProductId") VALUES (${productId},${company},${categoryId},${master.sourceCode},${master.name},'PIECE',${vat},${vatVerified},${basePrice},${cost},true,true,${master.id})`;
        const barcodes=await tx.$queryRaw`SELECT "barcode" FROM "MasterProductBarcode" WHERE "masterProductId"=${master.id} AND "scanEnabled"=true ORDER BY "barcode"`;
        for(const row of barcodes){
          const companyDuplicate=await tx.$queryRaw`SELECT pb."id" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${company} AND pb."barcode"=${row.barcode} LIMIT 1`;
          if(!companyDuplicate[0])await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode") VALUES (${uid()},${productId},${row.barcode})`;
        }
      }else{
        await tx.$executeRaw`UPDATE "Product" SET "active"=true,"salePrice"=${basePrice},"costPrice"=${cost},"vatRate"=${vat},"vatVerified"=${vatVerified},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${productId}`;
      }
      for(const config of body.storeConfigs){
        await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","active") VALUES (${uid()},${config.storeId},${productId},${config.salePrice??basePrice},${config.active}) ON CONFLICT ("storeId","productId") DO UPDATE SET "salePrice"=EXCLUDED."salePrice","active"=EXCLUDED."active","updatedAt"=CURRENT_TIMESTAMP`;
      }
    });
    res.status(existing[0]?200:201).json({id:productId,name:master.name,vatVerified});
  }catch(error){next(error)}
});

router.get("/catalog",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const q=String(req.query.q||"").trim();
    const like=`%${q}%`;
    const rows=await prisma.$queryRaw`
      SELECT p."id",p."sku",p."name",p."salePrice",p."costPrice",p."vatRate",p."vatVerified",p."active",p."masterProductId",
             c."name" AS "categoryName",
             COALESCE(json_agg(DISTINCT jsonb_build_object('storeId',s."id",'storeName',s."name",'salePrice',sp."salePrice",'active',sp."active",'currentStock',sp."currentStock")) FILTER (WHERE s."id" IS NOT NULL),'[]') AS stores
      FROM "Product" p
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id"
      LEFT JOIN "Store" s ON s."id"=sp."storeId" AND s."companyId"=${company}
      WHERE p."companyId"=${company} AND (${q===""} OR p."name" ILIKE ${like} OR p."sku" ILIKE ${like})
      GROUP BY p."id",c."name" ORDER BY p."name" LIMIT 500`;
    res.json(rows);
  }catch(error){next(error)}
});

router.patch("/:productId/prices",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const product=await ownedProduct(company,req.params.productId);
    if(!product)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});
    const body=z.object({
      basePrice:z.coerce.number().min(0),
      vatRate:z.coerce.number().min(0).max(100).optional(),
      vatVerified:z.boolean().optional(),
      stores:z.array(z.object({storeId:z.string().min(1),active:z.boolean(),salePrice:z.coerce.number().min(0).nullable()})).max(500)
    }).parse(req.body||{});
    const ids=[...new Set(body.stores.map(x=>x.storeId))];
    const valid=await prisma.store.findMany({where:{companyId:company,id:{in:ids}},select:{id:true}});
    if(valid.length!==ids.length)return res.status(400).json({error:"Υπάρχει μη έγκυρο κατάστημα."});
    await prisma.$transaction(async tx=>{
      const oldBase=money(product.salePrice);
      if(oldBase!==body.basePrice){
        await tx.$executeRaw`INSERT INTO "ProductPriceHistory" ("id","companyId","productId","oldPrice","newPrice","changeType","createdByUserId") VALUES (${uid()},${company},${product.id},${oldBase},${body.basePrice},'BASE_PRICE',${req.user.id})`;
      }
      await tx.$executeRaw`UPDATE "Product" SET "salePrice"=${body.basePrice},"vatRate"=${body.vatRate??money(product.vatRate)??0},"vatVerified"=${body.vatVerified??product.vatVerified},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${product.id}`;
      for(const config of body.stores){
        const oldRows=await tx.$queryRaw`SELECT "salePrice","active" FROM "StoreProduct" WHERE "storeId"=${config.storeId} AND "productId"=${product.id} LIMIT 1`;
        const old=oldRows[0];
        const newPrice=config.salePrice===null?body.basePrice:config.salePrice;
        if(!old||money(old.salePrice)!==newPrice){
          await tx.$executeRaw`INSERT INTO "ProductPriceHistory" ("id","companyId","productId","storeId","oldPrice","newPrice","changeType","createdByUserId") VALUES (${uid()},${company},${product.id},${config.storeId},${old?money(old.salePrice):null},${newPrice},'STORE_PRICE',${req.user.id})`;
        }
        await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","active") VALUES (${uid()},${config.storeId},${product.id},${newPrice},${config.active}) ON CONFLICT ("storeId","productId") DO UPDATE SET "salePrice"=EXCLUDED."salePrice","active"=EXCLUDED."active","updatedAt"=CURRENT_TIMESTAMP`;
      }
    });
    res.json({ok:true});
  }catch(error){next(error)}
});

router.get("/:productId/price-history",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    if(!await ownedProduct(company,req.params.productId))return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});
    const rows=await prisma.$queryRaw`SELECT h."id",h."oldPrice",h."newPrice",h."changeType",h."createdAt",s."name" AS "storeName" FROM "ProductPriceHistory" h LEFT JOIN "Store" s ON s."id"=h."storeId" WHERE h."companyId"=${company} AND h."productId"=${req.params.productId} ORDER BY h."createdAt" DESC LIMIT 100`;
    res.json(rows);
  }catch(error){next(error)}
});

router.get("/promotions/list",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const rows=await prisma.$queryRaw`
      SELECT pr."id",pr."name",pr."promotionType",pr."percentOff",pr."buyQuantity",pr."freeQuantity",pr."fixedPrice",pr."startsAt",pr."endsAt",pr."priority",pr."active",p."id" AS "productId",p."name" AS "productName",
             COALESCE(json_agg(jsonb_build_object('storeId',s."id",'storeName',s."name")) FILTER (WHERE s."id" IS NOT NULL),'[]') AS stores
      FROM "Promotion" pr JOIN "Product" p ON p."id"=pr."productId"
      LEFT JOIN "PromotionStore" ps ON ps."promotionId"=pr."id" LEFT JOIN "Store" s ON s."id"=ps."storeId"
      WHERE pr."companyId"=${company} GROUP BY pr."id",p."id" ORDER BY pr."startsAt" DESC LIMIT 500`;
    res.json(rows);
  }catch(error){next(error)}
});

router.post("/promotions",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const body=z.object({
      productId:z.string().min(1),name:z.string().trim().min(1).max(180),promotionType:z.enum(["PERCENT","BUY_X_GET_Y","FIXED_PRICE"]),
      percentOff:z.coerce.number().gt(0).lte(100).nullable().optional(),buyQuantity:z.coerce.number().gt(0).nullable().optional(),freeQuantity:z.coerce.number().gt(0).nullable().optional(),fixedPrice:z.coerce.number().min(0).nullable().optional(),
      startsAt:z.coerce.date(),endsAt:z.coerce.date(),priority:z.coerce.number().int().min(0).max(9999).default(100),storeIds:z.array(z.string().min(1)).min(1).max(500)
    }).parse(req.body||{});
    if(body.endsAt<=body.startsAt)return res.status(400).json({error:"Η λήξη της προσφοράς πρέπει να είναι μετά την έναρξη."});
    if(body.promotionType==="PERCENT"&&!body.percentOff)return res.status(400).json({error:"Χρειάζεται ποσοστό έκπτωσης."});
    if(body.promotionType==="BUY_X_GET_Y"&&(!body.buyQuantity||!body.freeQuantity))return res.status(400).json({error:"Χρειάζονται ποσότητες αγοράς και δωρεάν τεμαχίων."});
    if(body.promotionType==="FIXED_PRICE"&&body.fixedPrice===null)return res.status(400).json({error:"Χρειάζεται τελική τιμή προσφοράς."});
    if(!await ownedProduct(company,body.productId))return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});
    const ids=[...new Set(body.storeIds)];
    const valid=await prisma.store.findMany({where:{companyId:company,id:{in:ids}},select:{id:true}});
    if(valid.length!==ids.length)return res.status(400).json({error:"Υπάρχει μη έγκυρο κατάστημα στην προσφορά."});
    const promotionId=uid();
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO "Promotion" ("id","companyId","productId","name","promotionType","percentOff","buyQuantity","freeQuantity","fixedPrice","startsAt","endsAt","priority","createdByUserId") VALUES (${promotionId},${company},${body.productId},${body.name},${body.promotionType},${body.percentOff??null},${body.buyQuantity??null},${body.freeQuantity??null},${body.fixedPrice??null},${body.startsAt},${body.endsAt},${body.priority},${req.user.id})`;
      for(const storeId of ids)await tx.$executeRaw`INSERT INTO "PromotionStore" ("id","promotionId","storeId") VALUES (${uid()},${promotionId},${storeId})`;
    });
    res.status(201).json({id:promotionId});
  }catch(error){next(error)}
});

router.patch("/promotions/:promotionId",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const body=z.object({active:z.boolean()}).parse(req.body||{});
    const count=await prisma.$executeRaw`UPDATE "Promotion" SET "active"=${body.active},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.promotionId} AND "companyId"=${company}`;
    if(!count)return res.status(404).json({error:"Δεν βρέθηκε η προσφορά."});
    res.json({ok:true});
  }catch(error){next(error)}
});

router.get("/stocktakes/list",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const rows=await prisma.$queryRaw`SELECT st."id",st."name",st."status",st."startedAt",st."finalizedAt",s."name" AS "storeName",COUNT(sl."id")::int AS "lineCount",COUNT(sl."id") FILTER (WHERE sl."countedQuantity" IS NOT NULL)::int AS "countedCount" FROM "Stocktake" st JOIN "Store" s ON s."id"=st."storeId" LEFT JOIN "StocktakeLine" sl ON sl."stocktakeId"=st."id" WHERE st."companyId"=${company} GROUP BY st."id",s."name" ORDER BY st."startedAt" DESC LIMIT 100`;
    res.json(rows);
  }catch(error){next(error)}
});

router.post("/stocktakes",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const body=z.object({storeId:z.string().min(1),name:z.string().trim().min(1).max(180)}).parse(req.body||{});
    if(!await ownedStore(company,body.storeId))return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    const stocktakeId=uid();
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO "Stocktake" ("id","companyId","storeId","name","createdByUserId") VALUES (${stocktakeId},${company},${body.storeId},${body.name},${req.user.id})`;
      const products=await tx.$queryRaw`SELECT p."id",sp."currentStock",p."costPrice" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" WHERE sp."storeId"=${body.storeId} AND sp."active"=true AND p."companyId"=${company} AND p."active"=true ORDER BY p."name"`;
      for(const row of products)await tx.$executeRaw`INSERT INTO "StocktakeLine" ("id","stocktakeId","productId","expectedQuantity","unitCost") VALUES (${uid()},${stocktakeId},${row.id},${money(row.currentStock)??0},${money(row.costPrice)??0})`;
    });
    res.status(201).json({id:stocktakeId});
  }catch(error){next(error)}
});

router.get("/stocktakes/:stocktakeId",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const header=await prisma.$queryRaw`SELECT st."id",st."name",st."status",st."storeId",st."startedAt",st."finalizedAt",s."name" AS "storeName" FROM "Stocktake" st JOIN "Store" s ON s."id"=st."storeId" WHERE st."id"=${req.params.stocktakeId} AND st."companyId"=${company} LIMIT 1`;
    if(!header[0])return res.status(404).json({error:"Δεν βρέθηκε η απογραφή."});
    const lines=await prisma.$queryRaw`SELECT sl."id",sl."productId",p."name",p."sku",sl."expectedQuantity",sl."countedQuantity",sl."unitCost",(COALESCE(sl."countedQuantity",sl."expectedQuantity")-sl."expectedQuantity") AS difference,((COALESCE(sl."countedQuantity",sl."expectedQuantity")-sl."expectedQuantity")*COALESCE(sl."unitCost",0)) AS "differenceValue" FROM "StocktakeLine" sl JOIN "Product" p ON p."id"=sl."productId" WHERE sl."stocktakeId"=${req.params.stocktakeId} ORDER BY p."name"`;
    res.json({...header[0],lines});
  }catch(error){next(error)}
});

router.patch("/stocktakes/:stocktakeId/lines/:lineId",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const body=z.object({countedQuantity:z.coerce.number().min(0)}).parse(req.body||{});
    const rows=await prisma.$queryRaw`SELECT sl."id" FROM "StocktakeLine" sl JOIN "Stocktake" st ON st."id"=sl."stocktakeId" WHERE sl."id"=${req.params.lineId} AND st."id"=${req.params.stocktakeId} AND st."companyId"=${company} AND st."status"='DRAFT' LIMIT 1`;
    if(!rows[0])return res.status(404).json({error:"Δεν βρέθηκε ανοιχτή γραμμή απογραφής."});
    await prisma.$executeRaw`UPDATE "StocktakeLine" SET "countedQuantity"=${body.countedQuantity},"countedByUserId"=${req.user.id},"countedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.lineId}`;
    res.json({ok:true});
  }catch(error){next(error)}
});

router.post("/stocktakes/:stocktakeId/finalize",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const headers=await prisma.$queryRaw`SELECT "id","storeId","status" FROM "Stocktake" WHERE "id"=${req.params.stocktakeId} AND "companyId"=${company} LIMIT 1`;
    const stocktake=headers[0];
    if(!stocktake)return res.status(404).json({error:"Δεν βρέθηκε η απογραφή."});
    if(stocktake.status!=="DRAFT")return res.status(409).json({error:"Η απογραφή έχει ήδη οριστικοποιηθεί."});
    const missing=await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "StocktakeLine" WHERE "stocktakeId"=${stocktake.id} AND "countedQuantity" IS NULL`;
    if((missing[0]?.count||0)>0)return res.status(409).json({error:`Υπάρχουν ${missing[0].count} προϊόντα χωρίς φυσική καταμέτρηση.`});
    await prisma.$transaction(async tx=>{
      const lines=await tx.$queryRaw`SELECT "productId","expectedQuantity","countedQuantity","unitCost" FROM "StocktakeLine" WHERE "stocktakeId"=${stocktake.id}`;
      for(const line of lines){
        const expected=money(line.expectedQuantity)??0,counted=money(line.countedQuantity)??0,diff=counted-expected;
        await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=${counted},"updatedAt"=CURRENT_TIMESTAMP WHERE "storeId"=${stocktake.storeId} AND "productId"=${line.productId}`;
        if(diff!==0)await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId") VALUES (${uid()},${stocktake.storeId},${line.productId},'STOCKTAKE_ADJUSTMENT',${diff},${money(line.unitCost)},'STOCKTAKE',${stocktake.id},'Οριστικοποίηση απογραφής',${req.user.id})`;
      }
      await tx.$executeRaw`UPDATE "Stocktake" SET "status"='FINALIZED',"finalizedAt"=CURRENT_TIMESTAMP,"finalizedByUserId"=${req.user.id},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${stocktake.id}`;
    });
    res.json({ok:true});
  }catch(error){next(error)}
});

export default router;
