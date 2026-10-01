import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {ensureWholesaleSchema} from "../wholesale-b2b-bootstrap.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const uid=()=>crypto.randomUUID();

router.use((req,res,next)=>{if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Wholesale access denied."});next();});
router.use(async(req,res,next)=>{try{await ensureWholesaleSchema();next()}catch(error){next(error)}});

const customerPayload=z.object({name:z.string().trim().min(1).max(200),code:z.string().trim().max(60).optional().nullable(),taxId:z.string().trim().max(30).optional().nullable(),creditLimit:z.coerce.number().min(0).default(0),paymentTermsDays:z.coerce.number().int().min(0).max(3650).default(0),active:z.boolean().default(true)});
const listPayload=z.object({code:z.string().trim().min(1).max(60),name:z.string().trim().min(1).max(160),discountPercent:z.coerce.number().min(0).max(100).default(0),active:z.boolean().default(true)});

router.get("/customers",async(req,res,next)=>{try{const companyId=req.user.companyId;const rows=await prisma.$queryRaw`SELECT * FROM "WholesaleCustomer" WHERE "companyId"=${companyId} ORDER BY "name"`;res.json({items:rows.map(r=>({...r,creditLimit:Number(r.creditLimit||0),paymentTermsDays:Number(r.paymentTermsDays||0)}))});}catch(error){next(error)}});
router.post("/customers",async(req,res,next)=>{try{const companyId=req.user.companyId,b=customerPayload.parse(req.body||{}),id=uid();await prisma.$executeRaw`INSERT INTO "WholesaleCustomer" ("id","companyId","code","name","taxId","creditLimit","paymentTermsDays","active") VALUES (${id},${companyId},${b.code||null},${b.name},${b.taxId||null},${b.creditLimit},${b.paymentTermsDays},${b.active})`;res.status(201).json({id});}catch(error){next(error)}});

router.get("/price-lists",async(req,res,next)=>{try{const companyId=req.user.companyId;const rows=await prisma.$queryRaw`SELECT * FROM "WholesalePriceList" WHERE "companyId"=${companyId} ORDER BY "name"`;res.json({items:rows.map(r=>({...r,discountPercent:Number(r.discountPercent||0)}))});}catch(error){next(error)}});
router.post("/price-lists",async(req,res,next)=>{try{const companyId=req.user.companyId,b=listPayload.parse(req.body||{}),id=uid();await prisma.$executeRaw`INSERT INTO "WholesalePriceList" ("id","companyId","code","name","discountPercent","active") VALUES (${id},${companyId},${b.code},${b.name},${b.discountPercent},${b.active})`;res.status(201).json({id});}catch(error){next(error)}});

const productPayload=z.object({productId:z.string().trim().min(1),unitPrice:z.coerce.number().min(0).optional().nullable(),discountPercent:z.coerce.number().min(0).max(100).optional().nullable(),minimumQuantity:z.coerce.number().positive().default(1)});

router.put("/price-lists/:id/products",async(req,res,next)=>{try{
  const companyId=req.user.companyId,b=productPayload.parse(req.body||{});
  const lists=await prisma.$queryRaw`SELECT "id" FROM "WholesalePriceList" WHERE "id"=${req.params.id} AND "companyId"=${companyId} AND "active"=true LIMIT 1`;
  const products=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "id"=${b.productId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`;
  if(!lists[0])return res.status(404).json({error:"Wholesale price list not found."});
  if(!products[0])return res.status(400).json({error:"Product does not belong to the active company."});
  const id=uid();
  await prisma.$executeRaw`INSERT INTO "WholesalePriceListProduct" ("id","companyId","priceListId","productId","unitPrice","discountPercent","minimumQuantity") VALUES (${id},${companyId},${req.params.id},${b.productId},${b.unitPrice??null},${b.discountPercent??null},${b.minimumQuantity}) ON CONFLICT ("priceListId","productId","minimumQuantity") DO UPDATE SET "unitPrice"=EXCLUDED."unitPrice","discountPercent"=EXCLUDED."discountPercent","companyId"=EXCLUDED."companyId","updatedAt"=NOW()`;
  res.json({ok:true});
}catch(error){next(error)}});

router.put("/customers/:id/price-list",async(req,res,next)=>{try{
  const companyId=req.user.companyId,priceListId=String(req.body?.priceListId||"").trim();
  const customers=await prisma.$queryRaw`SELECT "id" FROM "WholesaleCustomer" WHERE "id"=${req.params.id} AND "companyId"=${companyId} AND "active"=true LIMIT 1`;
  const lists=await prisma.$queryRaw`SELECT "id" FROM "WholesalePriceList" WHERE "id"=${priceListId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`;
  if(!customers[0])return res.status(404).json({error:"Wholesale customer not found."});
  if(!lists[0])return res.status(400).json({error:"Price list does not belong to the active company."});
  await prisma.$executeRaw`INSERT INTO "WholesaleCustomerPriceList" ("customerId","companyId","priceListId") VALUES (${req.params.id},${companyId},${priceListId}) ON CONFLICT ("customerId") DO UPDATE SET "companyId"=EXCLUDED."companyId","priceListId"=EXCLUDED."priceListId"`;
  res.json({ok:true});
}catch(error){next(error)}});

export default router;
