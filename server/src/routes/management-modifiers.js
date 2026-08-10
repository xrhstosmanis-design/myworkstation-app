import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
let schemaReady=null;
const uid=()=>crypto.randomUUID();

function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η Διαχείριση είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);

async function ensureSchema(){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ManagementModifierGroup" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "legacyId" INTEGER,
      "description" TEXT NOT NULL,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ManagementModifierGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ManagementModifierGroup_company_description_key" ON "ManagementModifierGroup"("companyId",LOWER("description"))`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManagementModifierGroup_company_idx" ON "ManagementModifierGroup"("companyId")`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ManagementModifier" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "groupId" TEXT NOT NULL,
      "sequence" INTEGER NOT NULL DEFAULT 0,
      "description" TEXT NOT NULL,
      "price" NUMERIC(14,4) NOT NULL DEFAULT 0,
      "costNet" NUMERIC(14,4) NOT NULL DEFAULT 0,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ManagementModifier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ManagementModifier_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ManagementModifierGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManagementModifier_company_group_idx" ON "ManagementModifier"("companyId","groupId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManagementModifier_group_sequence_idx" ON "ManagementModifier"("groupId","sequence")`);
  })();
  return schemaReady;
}

const groupSchema=z.object({description:z.string().trim().min(1).max(160),active:z.boolean().default(true),legacyId:z.coerce.number().int().min(0).max(999999).nullable().optional()});
const modifierSchema=z.object({sequence:z.coerce.number().int().min(0).max(999999).default(0),description:z.string().trim().min(1).max(180),price:z.coerce.number().min(-999999).max(999999).default(0),costNet:z.coerce.number().min(0).max(999999).default(0),active:z.boolean().default(true)});

router.get("/groups",async(req,res,next)=>{
  try{await ensureSchema();const rows=await prisma.$queryRaw`
    SELECT g."id",g."legacyId",g."description",g."active",
      COUNT(m."id") FILTER (WHERE m."active"=true)::int AS "modifierCount"
    FROM "ManagementModifierGroup" g
    LEFT JOIN "ManagementModifier" m ON m."groupId"=g."id" AND m."companyId"=g."companyId"
    WHERE g."companyId"=${req.user.companyId}
    GROUP BY g."id" ORDER BY COALESCE(g."legacyId",2147483647),g."description"`;
    res.json({items:rows.map(r=>({...r,modifierCount:Number(r.modifierCount||0)}))});
  }catch(error){next(error)}
});

router.post("/groups",async(req,res,next)=>{
  try{await ensureSchema();const body=groupSchema.parse(req.body||{});const id=uid();await prisma.$executeRaw`
    INSERT INTO "ManagementModifierGroup" ("id","companyId","legacyId","description","active") VALUES (${id},${req.user.companyId},${body.legacyId??null},${body.description},${body.active})`;
    res.status(201).json({id});
  }catch(error){if(error?.code==="P2010")return res.status(409).json({error:"Υπάρχει ήδη ομάδα Modifier με αυτή την περιγραφή."});next(error)}
});

router.patch("/groups/:id",async(req,res,next)=>{
  try{await ensureSchema();const body=groupSchema.parse(req.body||{});const count=await prisma.$executeRaw`
    UPDATE "ManagementModifierGroup" SET "legacyId"=${body.legacyId??null},"description"=${body.description},"active"=${body.active},"updatedAt"=CURRENT_TIMESTAMP
    WHERE "id"=${req.params.id} AND "companyId"=${req.user.companyId}`;
    if(!count)return res.status(404).json({error:"Δεν βρέθηκε η ομάδα Modifier."});res.json({ok:true});
  }catch(error){next(error)}
});

router.delete("/groups/:id",async(req,res,next)=>{
  try{await ensureSchema();const count=await prisma.$executeRaw`
    UPDATE "ManagementModifierGroup" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.id} AND "companyId"=${req.user.companyId}`;
    if(!count)return res.status(404).json({error:"Δεν βρέθηκε η ομάδα Modifier."});
    await prisma.$executeRaw`UPDATE "ManagementModifier" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "groupId"=${req.params.id} AND "companyId"=${req.user.companyId}`;
    res.json({ok:true,softDeleted:true});
  }catch(error){next(error)}
});

router.get("/groups/:id/modifiers",async(req,res,next)=>{
  try{await ensureSchema();const group=(await prisma.$queryRaw`SELECT "id","description","active" FROM "ManagementModifierGroup" WHERE "id"=${req.params.id} AND "companyId"=${req.user.companyId} LIMIT 1`)[0];if(!group)return res.status(404).json({error:"Δεν βρέθηκε η ομάδα Modifier."});
    const rows=await prisma.$queryRaw`SELECT "id","sequence","description","price","costNet","active" FROM "ManagementModifier" WHERE "groupId"=${group.id} AND "companyId"=${req.user.companyId} ORDER BY "sequence","description"`;
    res.json({group,items:rows.map(r=>({...r,sequence:Number(r.sequence||0),price:Number(r.price||0),costNet:Number(r.costNet||0)}))});
  }catch(error){next(error)}
});

router.post("/groups/:id/modifiers",async(req,res,next)=>{
  try{await ensureSchema();const body=modifierSchema.parse(req.body||{});const group=(await prisma.$queryRaw`SELECT "id" FROM "ManagementModifierGroup" WHERE "id"=${req.params.id} AND "companyId"=${req.user.companyId} LIMIT 1`)[0];if(!group)return res.status(404).json({error:"Δεν βρέθηκε η ομάδα Modifier."});const id=uid();await prisma.$executeRaw`
    INSERT INTO "ManagementModifier" ("id","companyId","groupId","sequence","description","price","costNet","active") VALUES (${id},${req.user.companyId},${group.id},${body.sequence},${body.description},${body.price},${body.costNet},${body.active})`;
    res.status(201).json({id});
  }catch(error){next(error)}
});

router.patch("/modifiers/:id",async(req,res,next)=>{
  try{await ensureSchema();const body=modifierSchema.parse(req.body||{});const count=await prisma.$executeRaw`
    UPDATE "ManagementModifier" SET "sequence"=${body.sequence},"description"=${body.description},"price"=${body.price},"costNet"=${body.costNet},"active"=${body.active},"updatedAt"=CURRENT_TIMESTAMP
    WHERE "id"=${req.params.id} AND "companyId"=${req.user.companyId}`;
    if(!count)return res.status(404).json({error:"Δεν βρέθηκε το Modifier."});res.json({ok:true});
  }catch(error){next(error)}
});

router.delete("/modifiers/:id",async(req,res,next)=>{
  try{await ensureSchema();const count=await prisma.$executeRaw`UPDATE "ManagementModifier" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.id} AND "companyId"=${req.user.companyId}`;if(!count)return res.status(404).json({error:"Δεν βρέθηκε το Modifier."});res.json({ok:true,softDeleted:true});}catch(error){next(error)}
});

export default router;
