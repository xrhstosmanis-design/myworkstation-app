import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
let schemaReady=false;
async function ensureSchema(){
  if(schemaReady)return;
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "resolutionStatus" TEXT NOT NULL DEFAULT 'MATCHED'`);
  schemaReady=true;
}

router.patch("/:orderId",async(req,res,next)=>{
  try{
    if(req.body?.status!=="FINAL")return next();
    await ensureSchema();
    const rows=await prisma.$queryRaw`
      SELECT COUNT(*)::int AS "count"
      FROM "PurchaseOrderLine" l
      JOIN "PurchaseOrder" o ON o."id"=l."orderId"
      WHERE o."id"=${req.params.orderId} AND o."companyId"=${req.user.companyId}
        AND COALESCE(l."resolutionStatus",'MATCHED')='UNRESOLVED'`;
    const count=Number(rows[0]?.count||0);
    if(count>0)return res.status(409).json({error:`Υπάρχουν ${count} άλυτες γραμμές προϊόντων από το τιμολόγιο. Κάνε πρώτα αντιστοίχιση, προσθήκη barcode, συγχώνευση ή νέα εγγραφή και μετά Οριστικοποίηση.`,unresolvedLines:count});
    next();
  }catch(error){next(error)}
});
export default router;
