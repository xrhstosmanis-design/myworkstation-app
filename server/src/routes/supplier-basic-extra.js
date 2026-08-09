import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
let schemaPromise;
async function ensureSchema(){
  if(!schemaPromise){
    schemaPromise=(async()=>{
      await prisma.$executeRawUnsafe(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "taxOffice" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "myfEnabled" BOOLEAN NOT NULL DEFAULT true`);
    })().catch(error=>{schemaPromise=undefined;throw error});
  }
  return schemaPromise;
}
function requireAccess(req,res,next){if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Τα βασικά στοιχεία προμηθευτή είναι διαθέσιμα μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});next()}
router.use(requireAccess);
router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

router.get("/:supplierId/basic-extra",async(req,res,next)=>{
  try{
    const rows=await prisma.$queryRaw`SELECT "id","taxOffice","myfEnabled" FROM "Supplier" WHERE "id"=${req.params.supplierId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    if(!rows[0])return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
    res.json({id:rows[0].id,taxOffice:rows[0].taxOffice||"",myfEnabled:Boolean(rows[0].myfEnabled)});
  }catch(error){next(error)}
});

router.patch("/:supplierId/basic-extra",async(req,res,next)=>{
  try{
    const body=z.object({taxOffice:z.string().trim().max(120).optional().nullable(),myfEnabled:z.boolean()}).parse(req.body||{});
    const rows=await prisma.$queryRaw`UPDATE "Supplier" SET "taxOffice"=${body.taxOffice||null},"myfEnabled"=${body.myfEnabled},"updatedAt"=NOW() WHERE "id"=${req.params.supplierId} AND "companyId"=${req.user.companyId} RETURNING "id","taxOffice","myfEnabled"`;
    if(!rows[0])return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
    res.json({id:rows[0].id,taxOffice:rows[0].taxOffice||"",myfEnabled:Boolean(rows[0].myfEnabled)});
  }catch(error){next(error)}
});

export default router;
