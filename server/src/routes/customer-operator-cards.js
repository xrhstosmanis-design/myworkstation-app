import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {ensureCustomerOperatorCardSchema,linkCustomerOperatorCard} from "../lib/customer-operator-card.js";

const router=Router();
router.use((req,res,next)=>{
  if(req.user?.tokenType==="STORE_OPERATOR"||!["SUPER_ADMIN","OWNER","ADMIN","MANAGER"].includes(req.user?.role))return res.status(403).json({error:"Απαιτείται δικαίωμα διαχείρισης πελατών."});
  next();
});
async function scope(req,storeId,customerId=null){
  const companyId=req.user.companyId;
  const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true},select:{id:true}});
  if(!store)throw Object.assign(new Error("Δεν βρέθηκε ενεργό κατάστημα της εταιρείας."),{status:404});
  if(customerId&&!(await prisma.$queryRaw`SELECT "id" FROM "Customer" WHERE "id"=${customerId} AND "companyId"=${companyId}`)[0])throw Object.assign(new Error("Δεν βρέθηκε ο πελάτης."),{status:404});
  await ensureCustomerOperatorCardSchema(prisma);
  return {companyId,storeId:store.id,customerId,actorId:req.user.id};
}
router.get("/stores/:storeId/operator-card-options",async(req,res,next)=>{try{
  const {companyId,storeId}=await scope(req,req.params.storeId);
  const items=await prisma.$queryRaw`SELECT c."id" AS "credentialId",c."displayName",c."cardCodeLast4",l."customerId" AS "linkedCustomerId" FROM "StoreOperatorCredential" c
    JOIN "Employee" e ON e."id"=c."employeeId" AND e."storeId"=c."storeId" AND e."active"=TRUE
    LEFT JOIN "CustomerOperatorCardLink" l ON l."credentialId"=c."id" AND l."companyId"=c."companyId" AND l."storeId"=c."storeId"
    WHERE c."companyId"=${companyId} AND c."storeId"=${storeId} AND c."active"=TRUE AND c."cardCodeHash" IS NOT NULL ORDER BY c."displayName",c."id" LIMIT 1000`;
  res.json({storeId,items});
}catch(error){next(error)}});
router.get("/:customerId/operator-card",async(req,res,next)=>{try{
  const s=await scope(req,z.string().min(1).parse(req.query.storeId),req.params.customerId);
  const link=(await prisma.$queryRaw`SELECT l."credentialId",c."displayName",c."cardCodeLast4",c."active",e."active" AS "employeeActive" FROM "CustomerOperatorCardLink" l
    JOIN "StoreOperatorCredential" c ON c."id"=l."credentialId" AND c."companyId"=l."companyId" AND c."storeId"=l."storeId"
    JOIN "Employee" e ON e."id"=c."employeeId" AND e."storeId"=c."storeId"
    WHERE l."companyId"=${s.companyId} AND l."storeId"=${s.storeId} AND l."customerId"=${s.customerId}`)[0]||null;
  res.json({storeId:s.storeId,link});
}catch(error){next(error)}});
router.put("/:customerId/operator-card",async(req,res,next)=>{try{
  const body=z.object({storeId:z.string().min(1),credentialId:z.string().min(1).nullable()}).strict().parse(req.body||{});
  const s=await scope(req,body.storeId,req.params.customerId);
  res.json(await linkCustomerOperatorCard(prisma,{...s,credentialId:body.credentialId}));
}catch(error){next(error)}});
export default router;
