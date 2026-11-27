import {randomUUID} from "node:crypto";
import {Router} from "express";
import {chatAccessRevoked} from "../chat-access.mjs";
import {isPlatformSuperAdmin} from "../middleware/module-access.js";
import {prisma} from "../prisma.js";

const router=Router();

async function changeOwnMessage(req,res,next,remove){
  try{
    const user=req.user;
    const store=await prisma.store.findUnique({where:{id:req.params.storeId},select:{id:true,companyId:true}});
    const scopedStore=user.supportContext?.storeId||user.storeId;
    if(!store||user.staffAccess===true||(!isPlatformSuperAdmin(user)&&user.companyId!==store.companyId)||
      (scopedStore&&scopedStore!==store.id)||await chatAccessRevoked(prisma,store,user.id)){
      return res.status(404).json({error:"Δεν βρέθηκε διαθέσιμη συνομιλία."});
    }
    const id=String(req.params.messageId);
    const body=typeof req.body?.body==="string"?req.body.body.trim():"";
    if(!remove&&(!body||body.length>5000||body==="Το μήνυμα διαγράφηκε."))return res.status(400).json({error:"Το μήνυμα πρέπει να έχει από 1 έως 5.000 χαρακτήρες."});
    const result=await prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw`
        UPDATE "StoreChatMessage" m SET
          "body"=${remove?"Το μήνυμα διαγράφηκε.":body},
          "attachmentName"=CASE WHEN ${remove} THEN NULL ELSE m."attachmentName" END,
          "attachmentMimeType"=CASE WHEN ${remove} THEN NULL ELSE m."attachmentMimeType" END,
          "attachmentSize"=CASE WHEN ${remove} THEN NULL ELSE m."attachmentSize" END,
          "attachmentChecksum"=CASE WHEN ${remove} THEN NULL ELSE m."attachmentChecksum" END,
          "attachmentData"=CASE WHEN ${remove} THEN NULL ELSE m."attachmentData" END,
          "pinned"=CASE WHEN ${remove} THEN false ELSE m."pinned" END,
          "important"=CASE WHEN ${remove} THEN false ELSE m."important" END,
          "updatedAt"=NOW()
        WHERE m."id"=${id} AND m."companyId"=${store.companyId} AND m."storeId"=${store.id}
          AND m."senderId"=${req.user.id} AND m."body"<>'Το μήνυμα διαγράφηκε.' AND m."cashDay" IS NULL
          AND m."aiReaderJobId" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "StoreChatTask" t WHERE t."messageId"=m."id" AND t."companyId"=m."companyId" AND t."storeId"=m."storeId")
        RETURNING m."id",m."body"`;
      if(rows[0])await tx.$executeRaw`
        INSERT INTO "WorkforceAuditLog" ("id","companyId","storeId","actorUserId","action","entityType","entityId","afterJson","createdAt")
        VALUES (${randomUUID()},${store.companyId},${store.id},${user.id},${remove?"STORE_CHAT_MESSAGE_DELETED":"STORE_CHAT_MESSAGE_EDITED"},'STORE_CHAT',${id},${JSON.stringify({messageId:id})}::jsonb,NOW())`;
      return rows[0];
    });
    if(!result)return res.status(404).json({error:"Το δικό σου μήνυμα δεν είναι διαθέσιμο για αλλαγή."});
    res.json({ok:true,message:result});
  }catch(error){next(error)}
}

router.patch("/stores/:storeId/messages/:messageId/own-content",(req,res,next)=>changeOwnMessage(req,res,next,false));
router.delete("/stores/:storeId/messages/:messageId/own-content",(req,res,next)=>changeOwnMessage(req,res,next,true));

export default router;
