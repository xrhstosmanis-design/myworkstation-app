import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {Prisma} from "@prisma/client";
import {assertWholesaleManager,buildWholesaleQuote,wholesaleError} from "../lib/wholesale-pricing.js";
import {createWholesaleOrder} from "../lib/wholesale-orders.js";
import {prisma} from "../prisma.js";
import {ensureWholesaleSchema} from "../wholesale-b2b-bootstrap.js";

import {assertWholesaleEntitlement} from "../lib/wholesale-entitlement.js";

const router=Router();
const context=req=>({companyId:req.user?.companyId,actorId:req.user?.id,role:req.user?.role,tokenType:req.user?.tokenType,channel:"BACKOFFICE"});
const uid=()=>crypto.randomUUID();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);

router.use((req,res,next)=>{if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Wholesale access denied."});next();});
router.use(["/products","/quotes","/orders"],(req,res,next)=>{try{assertWholesaleManager(context(req));next()}catch(error){next(error)}});
router.use(async(req,res,next)=>{try{await assertWholesaleEntitlement(prisma,req.user?.companyId);await ensureWholesaleSchema();next()}catch(error){next(error)}});

const customerPayload=z.object({name:z.string().trim().min(1).max(200),code:z.string().trim().max(60).optional().nullable(),taxId:z.string().trim().max(30).optional().nullable(),creditLimit:z.coerce.number().min(0).default(0),paymentTermsDays:z.coerce.number().int().min(0).max(3650).default(0),active:z.boolean().default(true)});
const listPayload=z.object({code:z.string().trim().min(1).max(60),name:z.string().trim().min(1).max(160),discountPercent:z.coerce.number().min(0).max(100).default(0),active:z.boolean().default(true)});

router.get("/customers",async(req,res,next)=>{try{const companyId=req.user.companyId;const rows=await prisma.$queryRaw`SELECT c.*,l."id" AS "priceListId",l."name" AS "priceListName",l."active" AS "priceListActive" FROM "WholesaleCustomer" c LEFT JOIN "WholesaleCustomerPriceList" a ON a."customerId"=c."id" AND a."companyId"=c."companyId" LEFT JOIN "WholesalePriceList" l ON l."id"=a."priceListId" AND l."companyId"=c."companyId" WHERE c."companyId"=${companyId} ORDER BY c."name",c."id"`;res.json({items:rows.map(r=>({...r,creditLimit:Number(r.creditLimit||0),paymentTermsDays:Number(r.paymentTermsDays||0)}))});}catch(error){next(error)}});
router.post("/customers",async(req,res,next)=>{try{const companyId=req.user.companyId,b=customerPayload.parse(req.body||{}),id=uid();await prisma.$transaction(async tx=>{await assertWholesaleEntitlement(tx,companyId,{lock:true});await tx.$executeRaw`INSERT INTO "WholesaleCustomer" ("id","companyId","code","name","taxId","creditLimit","paymentTermsDays","active") VALUES (${id},${companyId},${b.code||null},${b.name},${b.taxId||null},${b.creditLimit},${b.paymentTermsDays},${b.active})`;await assertWholesaleEntitlement(tx,companyId,{lock:true});});res.status(201).json({id});}catch(error){next(error)}});

router.get("/price-lists",async(req,res,next)=>{try{const companyId=req.user.companyId;const rows=await prisma.$queryRaw`SELECT * FROM "WholesalePriceList" WHERE "companyId"=${companyId} ORDER BY "name"`;res.json({items:rows.map(r=>({...r,discountPercent:Number(r.discountPercent||0)}))});}catch(error){next(error)}});
router.post("/price-lists",async(req,res,next)=>{try{const companyId=req.user.companyId,b=listPayload.parse(req.body||{}),id=uid();await prisma.$transaction(async tx=>{await assertWholesaleEntitlement(tx,companyId,{lock:true});await tx.$executeRaw`INSERT INTO "WholesalePriceList" ("id","companyId","code","name","discountPercent","active") VALUES (${id},${companyId},${b.code},${b.name},${b.discountPercent},${b.active})`;await assertWholesaleEntitlement(tx,companyId,{lock:true});});res.status(201).json({id});}catch(error){next(error)}});

const decimal4=z.coerce.number().finite().refine(value=>/^\d+(?:\.\d{1,4})?$/.test(String(value)),"Use at most four decimal places.");
const productPayload=z.object({productId:z.string().trim().min(1).max(200),unitPrice:z.coerce.number().finite().min(0).max(9999999999.9999).pipe(decimal4).optional().nullable(),discountPercent:z.coerce.number().finite().min(0).max(100).refine(value=>/^\d+(?:\.\d{1,3})?$/.test(String(value)),"Use at most three decimal places.").optional().nullable(),minimumQuantity:z.coerce.number().finite().positive().max(1000000).pipe(decimal4).default(1),priceBasis:z.enum(["NET","GROSS"]).nullable().optional()}).strict();
const auditPrice=async(tx,ctx,listId,productId,minimumQuantity,before,after)=>{
  await tx.$executeRaw`INSERT INTO "WholesalePriceAudit" ("id","companyId","actorId","priceListId","productId","minimumQuantity","oldJson","newJson") VALUES (${uid()},${ctx.companyId},${ctx.actorId},${listId},${productId},${minimumQuantity},${before?JSON.stringify(before):null}::jsonb,${JSON.stringify(after)}::jsonb)`;
};
router.put("/price-lists/:id/products",async(req,res,next)=>{try{
  const ctx=context(req),companyId=ctx.companyId,b=productPayload.parse(req.body||{});
  // Serialize concurrent inserts and audit the exact replaced version. Omitted
  // basis deliberately becomes unclassified for legacy clients changing a price.
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([companyId,req.params.id,b.productId,b.minimumQuantity])},0))::text AS locked`;
    await assertWholesaleEntitlement(tx,companyId,{lock:true});
    const lists=await tx.$queryRaw`SELECT "id" FROM "WholesalePriceList" WHERE "id"=${req.params.id} AND "companyId"=${companyId} AND "active"=true LIMIT 1 FOR SHARE`;
    const products=await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id"=${b.productId} AND "companyId"=${companyId} AND "active"=true LIMIT 1 FOR SHARE`;
    if(!lists[0])throw wholesaleError(404,"LIST_NOT_FOUND","Wholesale price list not found.");
    if(!products[0])throw wholesaleError(400,"PRODUCT_NOT_FOUND","Product does not belong to the active company.");
    const old=await tx.$queryRaw`SELECT * FROM "WholesalePriceListProduct" WHERE "priceListId"=${req.params.id} AND "productId"=${b.productId} AND "minimumQuantity"=${b.minimumQuantity} FOR UPDATE`;
    if(old[0]&&old[0].companyId!==companyId)throw wholesaleError(409,"TIER_SCOPE_CONFLICT","Price tier requires ownership review.");
    const rows=await tx.$queryRaw`INSERT INTO "WholesalePriceListProduct" ("id","companyId","priceListId","productId","unitPrice","discountPercent","minimumQuantity","priceBasis") VALUES (${uid()},${companyId},${req.params.id},${b.productId},${b.unitPrice??null},${b.discountPercent??null},${b.minimumQuantity},${b.priceBasis??null}) ON CONFLICT ("priceListId","productId","minimumQuantity") DO UPDATE SET "unitPrice"=EXCLUDED."unitPrice","discountPercent"=EXCLUDED."discountPercent","priceBasis"=EXCLUDED."priceBasis","version"="WholesalePriceListProduct"."version"+1,"updatedAt"=NOW() WHERE "WholesalePriceListProduct"."companyId"=EXCLUDED."companyId" RETURNING *`;
    if(!rows[0])throw wholesaleError(409,"TIER_SCOPE_CONFLICT","Price tier requires ownership review.");
    await auditPrice(tx,ctx,req.params.id,b.productId,b.minimumQuantity,old[0],rows[0]);
    await assertWholesaleEntitlement(tx,companyId,{lock:true});
  });
  res.json({ok:true});
}catch(error){next(error)}});

const basisPayload=z.object({priceBasis:z.enum(["NET","GROSS"]),expectedVersion:z.number().int().positive().max(2147483646)}).strict();
router.put("/price-lists/:id/products/:tierId/price-basis",async(req,res,next)=>{try{
  const ctx=context(req),companyId=ctx.companyId,b=basisPayload.parse(req.body);assertWholesaleManager(ctx);
  const tier=await prisma.$transaction(async tx=>{
    await assertWholesaleEntitlement(tx,companyId,{lock:true});
    const rows=await tx.$queryRaw`SELECT t.* FROM "WholesalePriceListProduct" t JOIN "WholesalePriceList" l ON l."id"=t."priceListId" AND l."companyId"=t."companyId" JOIN "Product" p ON p."id"=t."productId" AND p."companyId"=t."companyId" WHERE t."id"=${req.params.tierId} AND t."priceListId"=${req.params.id} AND t."companyId"=${ctx.companyId} AND l."active"=true AND p."active"=true FOR UPDATE OF t FOR SHARE OF l,p`;
    const old=rows[0];if(!old)throw wholesaleError(404,"TIER_NOT_FOUND","Price tier not found.");
    if(old.version!==b.expectedVersion)throw wholesaleError(409,"TIER_CHANGED","Η τιμή άλλαξε. Ανανέωσε τον τιμοκατάλογο.");
    const updated=await tx.$queryRaw`UPDATE "WholesalePriceListProduct" SET "priceBasis"=${b.priceBasis},"version"="version"+1,"updatedAt"=NOW() WHERE "id"=${old.id} AND "companyId"=${ctx.companyId} AND "version"=${b.expectedVersion} RETURNING *`;
    if(!updated[0])throw wholesaleError(409,"TIER_CHANGED","Η τιμή άλλαξε. Ανανέωσε τον τιμοκατάλογο.");
    await auditPrice(tx,ctx,req.params.id,old.productId,old.minimumQuantity,old,updated[0]);await assertWholesaleEntitlement(tx,companyId,{lock:true});return updated[0];
  });
  res.json({ok:true,tier:{id:tier.id,priceBasis:tier.priceBasis,version:tier.version}});
}catch(error){next(error)}});

const assignmentPayload=z.object({priceListId:z.string().trim().min(1).max(200).nullable()}).strict();
const tierQuery=z.object({page:z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(1000000)).default("1"),pageSize:z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(100)).default("50")}).strict();

router.get("/price-lists/:id/products",async(req,res,next)=>{try{
  const companyId=req.user.companyId,{page,pageSize}=tierQuery.parse(req.query),offset=(page-1)*pageSize;
  const lists=await prisma.$queryRaw`SELECT "id" FROM "WholesalePriceList" WHERE "id"=${req.params.id} AND "companyId"=${companyId} LIMIT 1`;
  if(!lists[0])return res.status(404).json({error:"Wholesale price list not found."});
  const rows=await prisma.$queryRaw`SELECT t."id",t."productId",p."sku",p."name",t."minimumQuantity",t."unitPrice",t."discountPercent",t."priceBasis",t."version",t."updatedAt" FROM "WholesalePriceListProduct" t JOIN "WholesalePriceList" l ON l."id"=t."priceListId" AND l."companyId"=t."companyId" JOIN "Product" p ON p."id"=t."productId" AND p."companyId"=t."companyId" WHERE t."companyId"=${companyId} AND t."priceListId"=${req.params.id} ORDER BY p."name",p."id",t."minimumQuantity",t."id" LIMIT ${pageSize} OFFSET ${offset}`;
  const counts=await prisma.$queryRaw`SELECT COUNT(*) AS "total" FROM "WholesalePriceListProduct" t JOIN "WholesalePriceList" l ON l."id"=t."priceListId" AND l."companyId"=t."companyId" JOIN "Product" p ON p."id"=t."productId" AND p."companyId"=t."companyId" WHERE t."companyId"=${companyId} AND t."priceListId"=${req.params.id}`;
  res.json({items:rows.map(row=>({...row,minimumQuantity:Number(row.minimumQuantity),unitPrice:row.unitPrice==null?null:Number(row.unitPrice),discountPercent:row.discountPercent==null?null:Number(row.discountPercent)})),page,pageSize,total:Number(counts[0]?.total||0)});
}catch(error){next(error)}});

router.put("/customers/:id/price-list",async(req,res,next)=>{try{
  const companyId=req.user.companyId,{priceListId}=assignmentPayload.parse(req.body);
  const result=await prisma.$transaction(async tx=>{
    await assertWholesaleEntitlement(tx,companyId,{lock:true});
    // Lock the checked masters through the mutation so a concurrent deactivation
    // or reassignment cannot invalidate the ownership/active checks mid-write.
    const customers=await tx.$queryRaw`SELECT "id" FROM "WholesaleCustomer" WHERE "id"=${req.params.id} AND "companyId"=${companyId} AND "active"=true LIMIT 1 FOR UPDATE`;
    if(!customers[0])return {status:404,error:"Wholesale customer not found."};
    if(priceListId===null){
      await tx.$executeRaw`DELETE FROM "WholesaleCustomerPriceList" WHERE "customerId"=${req.params.id} AND "companyId"=${companyId}`;
    }else{
      const lists=await tx.$queryRaw`SELECT "id" FROM "WholesalePriceList" WHERE "id"=${priceListId} AND "companyId"=${companyId} AND "active"=true LIMIT 1 FOR UPDATE`;
      if(!lists[0])return {status:400,error:"Price list does not belong to the active company."};
      const changed=await tx.$executeRaw`INSERT INTO "WholesaleCustomerPriceList" ("customerId","companyId","priceListId") VALUES (${req.params.id},${companyId},${priceListId}) ON CONFLICT ("customerId") DO UPDATE SET "priceListId"=EXCLUDED."priceListId" WHERE "WholesaleCustomerPriceList"."companyId"=EXCLUDED."companyId"`;
      if(changed!==1)return {status:409,error:"Wholesale customer association requires review."};
    }
    await assertWholesaleEntitlement(tx,companyId,{lock:true});
    return {status:200};
  });
  if(result.error)return res.status(result.status).json({error:result.error});
  res.json({ok:true,customerId:req.params.id,priceListId});
}catch(error){next(error)}});

const storeQuery=tierQuery.extend({storeId:z.string().trim().min(1).max(200)});
const productQuery=storeQuery.extend({q:z.string().trim().max(160).default("")});
const detailQuery=z.object({storeId:z.string().trim().min(1).max(200)}).strict();
async function activeStore(db,companyId,storeId){
  await assertWholesaleEntitlement(db,companyId);
  const rows=await db.$queryRaw`SELECT s."id" FROM "Store" s JOIN "Company" c ON c."id"=s."companyId" WHERE s."id"=${storeId} AND s."companyId"=${companyId} AND s."active"=true AND c."active"=true LIMIT 1`;
  if(!rows[0])throw wholesaleError(404,"STORE_NOT_FOUND","Το επιλεγμένο κατάστημα δεν είναι διαθέσιμο.");
}
const orderAmount=value=>{const [whole,fraction=""]=String(value).split(".");return whole+"."+fraction.padEnd(2,"0")};
const orderRecord=row=>({...row,netTotal:orderAmount(row.netTotal),vatTotal:orderAmount(row.vatTotal),grossTotal:orderAmount(row.grossTotal)});

router.get("/products",async(req,res,next)=>{try{
  const companyId=req.user.companyId,{storeId,q,page,pageSize}=productQuery.parse(req.query),offset=(page-1)*pageSize,pattern=`%${q}%`;
  const result=await prisma.$transaction(async tx=>{
    await assertWholesaleEntitlement(tx,companyId,{lock:true});
    await activeStore(tx,companyId,storeId);
    const filter=Prisma.sql`FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" JOIN "Store" s ON s."id"=sp."storeId" AND s."companyId"=p."companyId" JOIN "Company" c ON c."id"=p."companyId" WHERE p."companyId"=${companyId} AND s."id"=${storeId} AND p."active"=true AND sp."active"=true AND s."active"=true AND c."active"=true AND (p."name" ILIKE ${pattern} OR p."sku" ILIKE ${pattern})`;
    const items=await tx.$queryRaw(Prisma.sql`SELECT p."id",p."name",p."sku",p."unit" ${filter} ORDER BY p."name",p."id" LIMIT ${pageSize} OFFSET ${offset}`);
    const counts=await tx.$queryRaw(Prisma.sql`SELECT COUNT(*) AS total ${filter}`);
    return {items,total:Number(counts[0]?.total||0),page,pageSize};
  },{isolationLevel:"RepeatableRead"});
  res.json(result);
}catch(error){next(error)}});

router.post("/quotes",async(req,res,next)=>{try{
  const quote=await prisma.$transaction(tx=>buildWholesaleQuote(tx,context(req),req.body),{isolationLevel:"RepeatableRead"});res.json(quote);
}catch(error){next(error)}});
router.post("/orders",async(req,res,next)=>{try{
  const result=await createWholesaleOrder(prisma,context(req),req.body);res.status(result.replayed?200:201).json(result);
}catch(error){next(error)}});
router.get("/orders",async(req,res,next)=>{try{
  const companyId=req.user.companyId,{storeId,page,pageSize}=storeQuery.parse(req.query),offset=(page-1)*pageSize;
  const result=await prisma.$transaction(async tx=>{
    await assertWholesaleEntitlement(tx,companyId,{lock:true});
    await activeStore(tx,companyId,storeId);
    const items=await tx.$queryRaw`SELECT "id","storeId","customerId","actorId","channel","status","revision","clientOrderId","quoteId","snapshot","notes","netTotal","vatTotal","grossTotal","createdAt" FROM "WholesaleOrderRequest" WHERE "companyId"=${companyId} AND "storeId"=${storeId} ORDER BY "createdAt" DESC,"id" DESC LIMIT ${pageSize} OFFSET ${offset}`;
    const counts=await tx.$queryRaw`SELECT COUNT(*) AS total FROM "WholesaleOrderRequest" WHERE "companyId"=${companyId} AND "storeId"=${storeId}`;
    return {items:items.map(orderRecord),total:Number(counts[0]?.total||0),page,pageSize};
  },{isolationLevel:"RepeatableRead"});res.json(result);
}catch(error){next(error)}});
router.get("/orders/:id",async(req,res,next)=>{try{
  const companyId=req.user.companyId,{storeId}=detailQuery.parse(req.query);
  const order=await prisma.$transaction(async tx=>{
    await assertWholesaleEntitlement(tx,companyId,{lock:true});
    await activeStore(tx,companyId,storeId);
    const rows=await tx.$queryRaw`SELECT "id","storeId","customerId","actorId","channel","status","revision","clientOrderId","quoteId","snapshot","notes","netTotal","vatTotal","grossTotal","createdAt" FROM "WholesaleOrderRequest" WHERE "id"=${req.params.id} AND "companyId"=${companyId} AND "storeId"=${storeId} LIMIT 1`;
    if(!rows[0])throw wholesaleError(404,"ORDER_NOT_FOUND","Η παραγγελία δεν βρέθηκε στο επιλεγμένο κατάστημα.");return orderRecord(rows[0]);
  },{isolationLevel:"RepeatableRead"});res.json({order});
}catch(error){next(error)}});
// Preserve typed stale-price information for the mounted client. Unexpected
// errors continue to the application's ordinary logging/error handler.
router.use((error,req,res,next)=>{
  if(error.name==="ZodError")return res.status(400).json({error:"Μη έγκυρα στοιχεία χονδρικής.",code:"INVALID_INPUT"});
  if(Number.isInteger(error.status)&&error.status>=400&&error.status<500)return res.status(error.status).json({error:error.message,code:error.code,...(error.details?{details:error.details}:{})});
  next(error);
});

export default router;
