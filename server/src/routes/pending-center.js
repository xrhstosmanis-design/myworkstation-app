import crypto from "node:crypto";
import express from "express";
import {prisma} from "../prisma.js";
import {isPlatformSuperAdmin} from "../middleware/module-access.js";

const router=express.Router();
const allowed=user=>isPlatformSuperAdmin(user)||user?.role==="OWNER";
const companyId=req=>String(req.user?.companyId||"");

async function audit(req,row,action,status){
  await prisma.$executeRaw`INSERT INTO "WorkforceAuditLog" ("id","companyId","storeId","actorUserId","action","entityType","entityId","afterJson","createdAt") VALUES (${`pending-${crypto.randomUUID()}`},${row.companyId},${row.storeId},${req.user.id},${action},'STORE_CHAT',${row.messageId},${JSON.stringify({messageId:row.messageId,taskId:row.id,status,source:"PENDING_CENTER"})}::jsonb,NOW())`;
}

router.use((req,res,next)=>allowed(req.user)?next():res.status(403).json({error:"Το Κέντρο Εκκρεμοτήτων είναι διαθέσιμο μόνο σε Ιδιοκτήτη ή Super Admin."}));

router.get("/chat-tasks",async(req,res,next)=>{try{
  const company=companyId(req);if(!company)return res.status(401).json({error:"Δεν υπάρχει ενεργή εταιρεία."});
  const storeId=String(req.query.storeId||""),status=String(req.query.status||"OPEN").toUpperCase();
  if(!["OPEN","COMPLETED","ALL"].includes(status))return res.status(400).json({error:"Μη έγκυρο φίλτρο κατάστασης."});
  if(storeId){const store=await prisma.store.findFirst({where:{id:storeId,companyId:company},select:{id:true}});if(!store)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."})}
  const rows=await prisma.$queryRaw`
    SELECT t."id",t."storeId",s."name" AS "storeName",t."messageId",t."title",t."status",t."createdAt",t."completedAt",
      m."category",m."body",m."senderId",
      COALESCE(NULLIF(su."fullName",''),NULLIF(su."email",''),NULLIF(so."displayName",''),m."senderId") AS "senderName",
      COALESCE(NULLIF(cu."fullName",''),NULLIF(cu."email",''),NULLIF(co."displayName",''),t."completedBy") AS "completedByName"
    FROM "StoreChatTask" t
    JOIN "Store" s ON s."id"=t."storeId" AND s."companyId"=t."companyId"
    JOIN "StoreChatMessage" m ON m."id"=t."messageId" AND m."companyId"=t."companyId" AND m."storeId"=t."storeId"
    LEFT JOIN "User" su ON su."id"=m."senderId" AND su."companyId"=t."companyId"
    LEFT JOIN "StoreOperatorCredential" so ON so."id"=m."senderId" AND so."companyId"=t."companyId" AND so."storeId"=t."storeId"
    LEFT JOIN "User" cu ON cu."id"=t."completedBy" AND cu."companyId"=t."companyId"
    LEFT JOIN "StoreOperatorCredential" co ON co."id"=t."completedBy" AND co."companyId"=t."companyId" AND co."storeId"=t."storeId"
    WHERE t."companyId"=${company} AND (${storeId}='' OR t."storeId"=${storeId}) AND (${status}='ALL' OR t."status"=${status})
    ORDER BY CASE WHEN t."status"='OPEN' THEN 0 ELSE 1 END,t."createdAt" DESC`;
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, private");
  res.json({rows,summary:{open:rows.filter(row=>row.status==="OPEN").length,total:rows.length}});
}catch(error){next(error)}});

router.patch("/chat-tasks/:taskId",async(req,res,next)=>{try{
  if(typeof req.body?.completed!=="boolean")return res.status(400).json({error:"Μη έγκυρη κατάσταση εκκρεμότητας."});
  const company=companyId(req),taskId=String(req.params.taskId),rows=await prisma.$queryRaw`SELECT "id","companyId","storeId","messageId" FROM "StoreChatTask" WHERE "id"=${taskId} AND "companyId"=${company} LIMIT 1`,row=rows[0];
  if(!row)return res.status(404).json({error:"Δεν βρέθηκε εκκρεμότητα."});
  const completed=req.body.completed,status=completed?"COMPLETED":"OPEN";
  await prisma.$executeRaw`UPDATE "StoreChatTask" SET "status"=${status},"completedBy"=${completed?req.user.id:null},"completedAt"=${completed?new Date():null} WHERE "id"=${taskId} AND "companyId"=${company} AND "storeId"=${row.storeId}`;
  await audit(req,row,completed?"STORE_CHAT_TASK_COMPLETED":"STORE_CHAT_TASK_REOPENED",status);
  res.json({ok:true,status});
}catch(error){next(error)}});

export default router;
