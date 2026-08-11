import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";

const router=Router();
router.use(auth);
router.use((req,res,next)=>{
  const allowed=req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN";
  if(!allowed)return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  next();
});

let schemaReady;
async function ensureAuditSchema(){
  if(!schemaReady)schemaReady=prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "MasterCatalogMaintenanceAudit" (
    "id" TEXT PRIMARY KEY,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "productIdsJson" JSONB,
    "deletedProducts" INTEGER NOT NULL DEFAULT 0,
    "detachedTenantProducts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(error=>{schemaReady=undefined;throw error});
  return schemaReady;
}
router.use(async(req,res,next)=>{try{await ensureAuditSchema();next()}catch(error){next(error)}});

const selectedSchema=z.object({masterProductIds:z.array(z.string().min(1)).min(1).max(1000)});

async function deleteMasters(tx,ids){
  if(!ids.length)return {deletedProducts:0,detachedTenantProducts:0};
  const detached=await tx.$executeRawUnsafe(`UPDATE "Product" SET "masterProductId"=NULL WHERE "masterProductId" = ANY($1::text[])`,ids);
  await tx.$executeRawUnsafe(`DELETE FROM "MasterProductBarcode" WHERE "masterProductId" = ANY($1::text[])`,ids);
  const deleted=await tx.$executeRawUnsafe(`DELETE FROM "MasterProduct" WHERE "id" = ANY($1::text[])`,ids);
  return {deletedProducts:Number(deleted||0),detachedTenantProducts:Number(detached||0)};
}

router.post("/delete-selected",async(req,res,next)=>{
  try{
    const body=selectedSchema.parse(req.body||{}),ids=[...new Set(body.masterProductIds)];
    const existing=await prisma.$queryRawUnsafe(`SELECT "id" FROM "MasterProduct" WHERE "id" = ANY($1::text[])`,ids);
    const existingIds=existing.map(row=>row.id);
    if(!existingIds.length)return res.json({ok:true,deletedProducts:0,detachedTenantProducts:0});
    const result=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('master-catalog-maintenance'))`;
      const outcome=await deleteMasters(tx,existingIds);
      await tx.$executeRaw`INSERT INTO "MasterCatalogMaintenanceAudit" ("id","actorId","action","productIdsJson","deletedProducts","detachedTenantProducts") VALUES (${crypto.randomUUID()},${req.user.id},'DELETE_SELECTED',${JSON.stringify(existingIds)}::jsonb,${outcome.deletedProducts},${outcome.detachedTenantProducts})`;
      return outcome;
    });
    res.json({ok:true,...result});
  }catch(error){next(error)}
});

router.post("/clear",async(req,res,next)=>{
  try{
    const confirmation=String(req.body?.confirmation||"").trim();
    if(confirmation!=="ΔΙΑΓΡΑΦΗ MASTER CATALOG")return res.status(400).json({error:"Απαιτείται η ακριβής επιβεβαίωση «ΔΙΑΓΡΑΦΗ MASTER CATALOG»."});
    const result=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('master-catalog-maintenance'))`;
      const rows=await tx.$queryRaw`SELECT "id" FROM "MasterProduct"`;
      const ids=rows.map(row=>row.id);
      const outcome=await deleteMasters(tx,ids);
      await tx.$executeRaw`INSERT INTO "MasterCatalogMaintenanceAudit" ("id","actorId","action","productIdsJson","deletedProducts","detachedTenantProducts") VALUES (${crypto.randomUUID()},${req.user.id},'CLEAR_ALL',NULL,${outcome.deletedProducts},${outcome.detachedTenantProducts})`;
      return outcome;
    });
    res.json({ok:true,...result});
  }catch(error){next(error)}
});

export default router;
