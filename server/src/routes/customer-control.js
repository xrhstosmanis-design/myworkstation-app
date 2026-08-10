import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const id=()=>crypto.randomUUID();
const n=value=>Number(value||0);
let schemaPromise;

async function ensureSchema(){
  if(!schemaPromise){
    schemaPromise=(async()=>{
      const alters=[
        `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "legacyCode" TEXT`,
        `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "address" TEXT`,
        `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "city" TEXT`,
        `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "customerType" TEXT NOT NULL DEFAULT 'RETAIL'`,
        `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "points" NUMERIC(14,2) NOT NULL DEFAULT 0`,
        `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "memberCard" TEXT`,
        `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "notes" TEXT`
      ];
      for(const sql of alters)await prisma.$executeRawUnsafe(sql);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Customer_company_legacy_idx" ON "Customer" ("companyId","legacyCode")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Customer_company_member_card_idx" ON "Customer" ("companyId","memberCard")`);
    })().catch(error=>{schemaPromise=undefined;throw error});
  }
  return schemaPromise;
}

function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η πλήρης διαχείριση πελατών είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);
router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

function range(query={}){
  const now=new Date(),to=query.to?new Date(String(query.to)):now,from=query.from?new Date(String(query.from)):new Date(to.getFullYear(),to.getMonth(),1);
  if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to){const e=new Error("Μη έγκυρο διάστημα ημερομηνιών.");e.status=400;throw e}
  return{from,to};
}
async function owned(companyId,customerId){const rows=await prisma.$queryRaw`SELECT * FROM "Customer" WHERE "id"=${customerId} AND "companyId"=${companyId} LIMIT 1`;return rows[0]||null}

router.get("/report",async(req,res,next)=>{try{
  const companyId=req.user.companyId,q=String(req.query.q||"").trim(),activeOnly=String(req.query.activeOnly||"true")!=="false",nonZeroOnly=String(req.query.nonZeroOnly||"false")==="true",text=q?`%${q}%`:null;
  const rows=await prisma.$queryRaw`
    SELECT c.*,
      COALESCE(v."visits",0)::int AS "visits",
      COALESCE(y."currentYear",0) AS "currentYear",
      COALESCE(y."previousYear",0) AS "previousYear"
    FROM "Customer" c
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT s."id")::int AS "visits" FROM "Sale" s
      WHERE s."companyId"=${companyId} AND s."customerId"=c."id" AND s."status"='COMPLETED'
    ) v ON true
    LEFT JOIN LATERAL (
      SELECT
        SUM(s."total") FILTER (WHERE EXTRACT(YEAR FROM s."occurredAt")=EXTRACT(YEAR FROM CURRENT_DATE)) AS "currentYear",
        SUM(s."total") FILTER (WHERE EXTRACT(YEAR FROM s."occurredAt")=EXTRACT(YEAR FROM CURRENT_DATE)-1) AS "previousYear"
      FROM "Sale" s WHERE s."companyId"=${companyId} AND s."customerId"=c."id" AND s."status"='COMPLETED'
    ) y ON true
    WHERE c."companyId"=${companyId}
      AND (${activeOnly}=false OR c."active"=true)
      AND (${nonZeroOnly}=false OR ABS(c."balance")>0.0001)
      AND (${text}::text IS NULL OR c."name" ILIKE ${text} OR COALESCE(c."taxId",'') ILIKE ${text} OR COALESCE(c."legacyCode",'') ILIKE ${text} OR COALESCE(c."memberCard",'') ILIKE ${text})
    ORDER BY c."name" LIMIT 2000`;
  const customers=rows.map(r=>({...r,balance:n(r.balance),discountPercent:n(r.discountPercent),creditLimit:n(r.creditLimit),points:n(r.points),visits:n(r.visits),currentYear:n(r.currentYear),previousYear:n(r.previousYear)}));
  const summary=customers.reduce((a,r)=>{a.count++;a.balance+=r.balance;a.visits+=r.visits;a.currentYear+=r.currentYear;return a},{count:0,balance:0,visits:0,currentYear:0});
  res.json({customers,summary});
}catch(error){next(error)}});

router.get("/receipts",async(req,res,next)=>{try{
  const companyId=req.user.companyId,{from,to}=range(req.query),customerId=String(req.query.customerId||"")||null;
  const rows=await prisma.$queryRaw`
    SELECT l."id",l."createdAt",l."amount",l."note",l."referenceType",l."referenceId",c."id" AS "customerId",c."name" AS "customerName",c."taxId",st."name" AS "storeName"
    FROM "CustomerLedger" l JOIN "Customer" c ON c."id"=l."customerId" LEFT JOIN "Store" st ON st."id"=l."storeId"
    WHERE c."companyId"=${companyId} AND l."entryType"='RECEIPT' AND l."createdAt">=${from} AND l."createdAt"<=${to} AND (${customerId}::text IS NULL OR c."id"=${customerId})
    ORDER BY l."createdAt" DESC LIMIT 3000`;
  const items=rows.map(r=>({...r,amount:Math.abs(n(r.amount))}));const summary=items.reduce((a,r)=>{a.count++;a.total+=r.amount;return a},{count:0,total:0});res.json({items,summary,from,to});
}catch(error){next(error)}});

router.get("/turnover",async(req,res,next)=>{try{
  const companyId=req.user.companyId,{from,to}=range(req.query),customerId=String(req.query.customerId||"")||null;
  const rows=await prisma.$queryRaw`
    SELECT c."id" AS "customerId",c."name" AS "customerName",c."taxId",COUNT(DISTINCT s."id")::int AS "visits",COALESCE(SUM(s."subtotal"),0) AS "subtotal",COALESCE(SUM(s."discount"),0) AS "discount",COALESCE(SUM(s."total"),0) AS "turnover"
    FROM "Sale" s JOIN "Customer" c ON c."id"=s."customerId" AND c."companyId"=s."companyId"
    WHERE s."companyId"=${companyId} AND s."status"='COMPLETED' AND s."occurredAt">=${from} AND s."occurredAt"<=${to} AND (${customerId}::text IS NULL OR c."id"=${customerId})
    GROUP BY c."id",c."name",c."taxId" ORDER BY turnover DESC`;
  const items=rows.map(r=>({...r,visits:n(r.visits),subtotal:n(r.subtotal),discount:n(r.discount),turnover:n(r.turnover)}));const summary=items.reduce((a,r)=>{a.customers++;a.visits+=r.visits;a.turnover+=r.turnover;a.discount+=r.discount;return a},{customers:0,visits:0,turnover:0,discount:0});res.json({items,summary,from,to});
}catch(error){next(error)}});

router.get("/fiscal-status",async(req,res)=>{
  res.json({mydata:{available:false,status:"NOT_CONNECTED",message:"Δεν υπάρχει ακόμη συνδεδεμένη ροή myDATA για καρτέλες πελατών."},provider:{available:false,status:"NOT_CONNECTED",message:"Δεν υπάρχει ακόμη συνδεδεμένος πάροχος τιμολόγησης πελατών στο συγκεκριμένο module."}});
});

router.post("/",async(req,res,next)=>{try{
  const companyId=req.user.companyId,b=z.object({legacyCode:z.string().max(40).optional().nullable(),name:z.string().trim().min(1).max(180),taxId:z.string().max(30).optional().nullable(),phone:z.string().max(40).optional().nullable(),email:z.string().email().optional().nullable(),address:z.string().max(250).optional().nullable(),city:z.string().max(120).optional().nullable(),customerType:z.enum(["RETAIL","WHOLESALE","BUSINESS"]).optional(),discountPercent:z.coerce.number().min(0).max(100).optional(),creditLimit:z.coerce.number().min(0).max(999999999).optional(),points:z.coerce.number().min(-999999999).max(999999999).optional(),memberCard:z.string().max(100).optional().nullable(),notes:z.string().max(1000).optional().nullable()}).parse(req.body||{}),customerId=id();
  await prisma.$executeRaw`INSERT INTO "Customer" ("id","companyId","legacyCode","name","taxId","phone","email","address","city","customerType","discountPercent","creditLimit","points","memberCard","notes") VALUES (${customerId},${companyId},${b.legacyCode||null},${b.name},${b.taxId||null},${b.phone||null},${b.email||null},${b.address||null},${b.city||null},${b.customerType||"RETAIL"},${b.discountPercent||0},${b.creditLimit||0},${b.points||0},${b.memberCard||null},${b.notes||null})`;
  res.status(201).json({id:customerId});
}catch(error){next(error)}});

router.get("/:customerId/detail",async(req,res,next)=>{try{
  const companyId=req.user.companyId,c=await owned(companyId,req.params.customerId);if(!c)return res.status(404).json({error:"Δεν βρέθηκε ο πελάτης."});
  const [ledger,stores]=await Promise.all([
    prisma.$queryRaw`SELECT l.*,st."name" AS "storeName" FROM "CustomerLedger" l LEFT JOIN "Store" st ON st."id"=l."storeId" WHERE l."customerId"=${c.id} ORDER BY l."createdAt" DESC LIMIT 100`,
    prisma.store.findMany({where:{companyId,active:true},select:{id:true,name:true},orderBy:{name:"asc"}})
  ]);
  res.json({customer:{...c,balance:n(c.balance),discountPercent:n(c.discountPercent),creditLimit:n(c.creditLimit),points:n(c.points)},ledger:ledger.map(r=>({...r,amount:n(r.amount)})),stores});
}catch(error){next(error)}});

router.patch("/:customerId",async(req,res,next)=>{try{
  const companyId=req.user.companyId,c=await owned(companyId,req.params.customerId);if(!c)return res.status(404).json({error:"Δεν βρέθηκε ο πελάτης."});
  const b=z.object({legacyCode:z.string().max(40).optional().nullable(),name:z.string().trim().min(1).max(180).optional(),taxId:z.string().max(30).optional().nullable(),phone:z.string().max(40).optional().nullable(),email:z.string().email().optional().nullable(),address:z.string().max(250).optional().nullable(),city:z.string().max(120).optional().nullable(),customerType:z.enum(["RETAIL","WHOLESALE","BUSINESS"]).optional(),discountPercent:z.coerce.number().min(0).max(100).optional(),creditLimit:z.coerce.number().min(0).max(999999999).optional(),points:z.coerce.number().min(-999999999).max(999999999).optional(),memberCard:z.string().max(100).optional().nullable(),notes:z.string().max(1000).optional().nullable(),active:z.boolean().optional()}).parse(req.body||{});
  await prisma.$executeRaw`UPDATE "Customer" SET "legacyCode"=COALESCE(${b.legacyCode??null},"legacyCode"),"name"=COALESCE(${b.name??null},"name"),"taxId"=COALESCE(${b.taxId??null},"taxId"),"phone"=COALESCE(${b.phone??null},"phone"),"email"=COALESCE(${b.email??null},"email"),"address"=COALESCE(${b.address??null},"address"),"city"=COALESCE(${b.city??null},"city"),"customerType"=COALESCE(${b.customerType??null},"customerType"),"discountPercent"=COALESCE(${b.discountPercent??null},"discountPercent"),"creditLimit"=COALESCE(${b.creditLimit??null},"creditLimit"),"points"=COALESCE(${b.points??null},"points"),"memberCard"=COALESCE(${b.memberCard??null},"memberCard"),"notes"=COALESCE(${b.notes??null},"notes"),"active"=COALESCE(${b.active??null},"active"),"updatedAt"=NOW() WHERE "id"=${c.id} AND "companyId"=${companyId}`;
  res.json({ok:true});
}catch(error){next(error)}});

router.post("/:customerId/receipts",async(req,res,next)=>{try{
  const companyId=req.user.companyId,c=await owned(companyId,req.params.customerId);if(!c)return res.status(404).json({error:"Δεν βρέθηκε ο πελάτης."});
  const b=z.object({amount:z.coerce.number().positive().max(999999999),storeId:z.string().optional().nullable(),note:z.string().max(500).optional().nullable()}).parse(req.body||{});
  let storeId=null;if(b.storeId){const st=await prisma.store.findFirst({where:{id:b.storeId,companyId,active:true},select:{id:true}});if(!st)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});storeId=st.id}
  const ledgerId=id();
  await prisma.$transaction(async tx=>{
    await tx.$executeRaw`INSERT INTO "CustomerLedger" ("id","customerId","storeId","entryType","amount","referenceType","referenceId","note") VALUES (${ledgerId},${c.id},${storeId},'RECEIPT',${-b.amount},'MANUAL_RECEIPT',${ledgerId},${b.note||null})`;
    await tx.$executeRaw`UPDATE "Customer" SET "balance"="balance"-${b.amount},"updatedAt"=NOW() WHERE "id"=${c.id} AND "companyId"=${companyId}`;
  });
  res.status(201).json({id:ledgerId,amount:b.amount});
}catch(error){next(error)}});

router.delete("/:customerId",async(req,res,next)=>{try{
  const c=await owned(req.user.companyId,req.params.customerId);if(!c)return res.status(404).json({error:"Δεν βρέθηκε ο πελάτης."});
  await prisma.$executeRaw`UPDATE "Customer" SET "active"=false,"updatedAt"=NOW() WHERE "id"=${c.id} AND "companyId"=${req.user.companyId}`;
  res.json({ok:true,message:"Ο πελάτης απενεργοποιήθηκε. Το ιστορικό του διατηρήθηκε."});
}catch(error){next(error)}});

export default router;
