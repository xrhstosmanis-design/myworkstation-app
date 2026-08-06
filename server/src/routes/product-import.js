import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const id=()=>crypto.randomUUID();

const rowSchema=z.object({
  name:z.string().trim().min(1).max(220),
  sku:z.string().trim().max(100).optional().nullable(),
  barcode:z.string().trim().max(100).optional().nullable(),
  category:z.string().trim().max(140).optional().nullable(),
  unit:z.string().trim().max(30).optional().nullable(),
  salePrice:z.coerce.number().min(0).optional().nullable(),
  costPrice:z.coerce.number().min(0).optional().nullable(),
  vatRate:z.coerce.number().min(0).max(100).optional().nullable(),
  openingStock:z.coerce.number().optional().nullable()
});

const payloadSchema=z.object({
  storeId:z.string().min(1),
  stockMode:z.enum(["KEEP","SET","ADD"]).default("KEEP"),
  rows:z.array(rowSchema).min(1).max(3000)
});

async function findProduct(tx,companyId,row){
  if(row.sku){
    const bySku=await tx.$queryRaw`SELECT "id","name" FROM "Product" WHERE "companyId"=${companyId} AND "sku"=${row.sku} LIMIT 1`;
    if(bySku[0])return bySku[0];
  }
  if(row.barcode){
    const byBarcode=await tx.$queryRaw`SELECT p."id",p."name" FROM "Product" p JOIN "ProductBarcode" b ON b."productId"=p."id" WHERE p."companyId"=${companyId} AND b."barcode"=${row.barcode} LIMIT 1`;
    if(byBarcode[0])return byBarcode[0];
  }
  const byName=await tx.$queryRaw`SELECT "id","name" FROM "Product" WHERE "companyId"=${companyId} AND LOWER("name")=LOWER(${row.name}) LIMIT 1`;
  return byName[0]||null;
}

async function categoryIdFor(tx,companyId,name){
  if(!name)return null;
  const existing=await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${companyId} AND LOWER("name")=LOWER(${name}) LIMIT 1`;
  if(existing[0])return existing[0].id;
  const categoryId=id();
  await tx.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name") VALUES (${categoryId},${companyId},${name})`;
  return categoryId;
}

async function ensureBarcode(tx,companyId,productId,barcode){
  if(!barcode)return;
  const existing=await tx.$queryRaw`SELECT p."id" AS "productId" FROM "Product" p JOIN "ProductBarcode" b ON b."productId"=p."id" WHERE p."companyId"=${companyId} AND b."barcode"=${barcode} LIMIT 1`;
  if(existing[0]?.productId&&existing[0].productId!==productId){
    const error=new Error(`Το barcode ${barcode} χρησιμοποιείται ήδη σε άλλο προϊόν.`);
    error.code="BARCODE_CONFLICT";
    throw error;
  }
  if(!existing[0])await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode") VALUES (${id()},${productId},${barcode})`;
}

router.post("/products",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const body=payloadSchema.parse(req.body||{});
    const store=await prisma.store.findFirst({where:{id:body.storeId,companyId:req.user.companyId},select:{id:true,name:true}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα για τη συγκεκριμένη εταιρεία."});

    const result={total:body.rows.length,created:0,updated:0,categoriesCreated:0,barcodesAdded:0,stockChanged:0,errors:[]};
    for(let index=0;index<body.rows.length;index++){
      const row=body.rows[index];
      try{
        await prisma.$transaction(async tx=>{
          let categoryId=null;
          if(row.category){
            const before=await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${req.user.companyId} AND LOWER("name")=LOWER(${row.category}) LIMIT 1`;
            categoryId=await categoryIdFor(tx,req.user.companyId,row.category);
            if(!before[0])result.categoriesCreated++;
          }

          let product=await findProduct(tx,req.user.companyId,row);
          let productId=product?.id;
          if(!productId){
            productId=id();
            await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","sku","name","unit","vatRate","salePrice","costPrice","trackStock") VALUES (${productId},${req.user.companyId},${categoryId},${row.sku||null},${row.name},${row.unit||"PIECE"},${row.vatRate??24},${row.salePrice??0},${row.costPrice??0},true)`;
            result.created++;
          }else{
            await tx.$executeRaw`UPDATE "Product" SET "categoryId"=COALESCE(${categoryId},"categoryId"),"sku"=COALESCE(${row.sku||null},"sku"),"name"=${row.name},"unit"=COALESCE(${row.unit||null},"unit"),"vatRate"=COALESCE(${row.vatRate??null},"vatRate"),"salePrice"=COALESCE(${row.salePrice??null},"salePrice"),"costPrice"=COALESCE(${row.costPrice??null},"costPrice"),"active"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${productId} AND "companyId"=${req.user.companyId}`;
            result.updated++;
          }

          if(row.barcode){
            const had=await tx.$queryRaw`SELECT 1 FROM "ProductBarcode" WHERE "productId"=${productId} AND "barcode"=${row.barcode} LIMIT 1`;
            await ensureBarcode(tx,req.user.companyId,productId,row.barcode);
            if(!had[0])result.barcodesAdded++;
          }

          const current=await tx.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"=${store.id} AND "productId"=${productId} LIMIT 1`;
          const stockValue=row.openingStock;
          let nextStock=current[0]?.currentStock??0;
          let change=0;
          if(stockValue!=null){
            if(!current[0]){nextStock=stockValue;change=stockValue;}
            else if(body.stockMode==="SET"){nextStock=stockValue;change=Number(stockValue)-Number(current[0].currentStock||0);}
            else if(body.stockMode==="ADD"){nextStock=Number(current[0].currentStock||0)+Number(stockValue);change=Number(stockValue);}
          }
          await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock") VALUES (${id()},${store.id},${productId},${row.salePrice??null},${nextStock}) ON CONFLICT ("storeId","productId") DO UPDATE SET "salePrice"=COALESCE(${row.salePrice??null},"StoreProduct"."salePrice"),"currentStock"=${nextStock},"updatedAt"=CURRENT_TIMESTAMP`;
          if(change!==0){
            await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","note","createdByUserId") VALUES (${id()},${store.id},${productId},'ADJUSTMENT',${change},${row.costPrice??null},'BULK_IMPORT','Μαζική εισαγωγή καταλόγου',${req.user.id})`;
            result.stockChanged++;
          }
        });
      }catch(error){
        result.errors.push({row:index+2,name:row.name,error:error?.code==="BARCODE_CONFLICT"?error.message:"Η γραμμή δεν εισήχθη."});
      }
    }
    res.json({...result,failed:result.errors.length,ok:result.errors.length===0,store});
  }catch(error){next(error)}
});

export default router;
