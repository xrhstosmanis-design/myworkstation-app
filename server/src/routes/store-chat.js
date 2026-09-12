import crypto from "node:crypto";
import express from "express";
import {prisma} from "../prisma.js";
import {isPlatformSuperAdmin} from "../middleware/module-access.js";

const router=express.Router();
const TYPES=new Set(["GENERAL","SHIFT","CASH","INVOICE","PAYMENT","STOCK_SHORTAGE","EQUIPMENT","ORDER","ANNOUNCEMENT","INCIDENT"]);
const ATTACHMENT_TYPES=new Set(["image/jpeg","image/png","image/webp","application/pdf"]),MAX_ATTACHMENT_BYTES=7*1024*1024;

export async function ensureStoreChatSchema(){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreChatMessage" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"senderId" TEXT NOT NULL,"category" TEXT NOT NULL DEFAULT 'GENERAL',"body" TEXT NOT NULL,"important" BOOLEAN NOT NULL DEFAULT false,"pinned" BOOLEAN NOT NULL DEFAULT false,"completed" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMP NOT NULL DEFAULT NOW())`);
  for(const sql of [`ALTER TABLE "StoreChatMessage" ADD COLUMN IF NOT EXISTS "attachmentName" TEXT`,`ALTER TABLE "StoreChatMessage" ADD COLUMN IF NOT EXISTS "attachmentMimeType" TEXT`,`ALTER TABLE "StoreChatMessage" ADD COLUMN IF NOT EXISTS "attachmentSize" INTEGER`,`ALTER TABLE "StoreChatMessage" ADD COLUMN IF NOT EXISTS "attachmentChecksum" TEXT`,`ALTER TABLE "StoreChatMessage" ADD COLUMN IF NOT EXISTS "attachmentData" TEXT`,`ALTER TABLE "StoreChatMessage" ADD COLUMN IF NOT EXISTS "completedBy" TEXT`,`ALTER TABLE "StoreChatMessage" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP`])await prisma.$executeRawUnsafe(sql);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreChatMessage_store_created_idx" ON "StoreChatMessage" ("storeId","createdAt")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreChatRead" ("messageId" TEXT NOT NULL,"userId" TEXT NOT NULL,"readAt" TIMESTAMP NOT NULL DEFAULT NOW(),PRIMARY KEY ("messageId","userId"))`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreChatTask" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"messageId" TEXT NOT NULL UNIQUE,"title" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'OPEN',"createdBy" TEXT NOT NULL,"createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),"completedBy" TEXT,"completedAt" TIMESTAMP)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreChatTask_store_status_idx" ON "StoreChatTask" ("storeId","status","createdAt")`);
}
async function storeFor(req,res){const id=String(req.params.storeId||req.body?.storeId||"");if(!id)return res.status(400).json({error:"Δεν προσδιορίστηκε κατάστημα."});const store=await prisma.store.findUnique({where:{id},select:{id:true,companyId:true,name:true}}),user=req.user||{};if(!store||(!isPlatformSuperAdmin(user)&&String(user.companyId)!==String(store.companyId))||(user.tokenType==="STORE_OPERATOR"&&String(user.storeId)!==String(id)))return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});return store}
function canPin(user){return isPlatformSuperAdmin(user)||(user?.tokenType!=="STORE_OPERATOR"&&user?.role==="OWNER")}
function canDownload(user){return canPin(user)}
async function audit(req,store,action,details){await prisma.$executeRaw`INSERT INTO "WorkforceAuditLog" ("id","companyId","storeId","actorUserId","action","entityType","entityId","afterJson","createdAt") VALUES (${`chat-${Date.now()}-${Math.random().toString(36).slice(2)}`},${store.companyId},${store.id},${req.user.id},${action},'STORE_CHAT',${details.messageId||null},${JSON.stringify(details)}::jsonb,NOW())`}

function parseAttachment(value){
  if(!value)return null;
  const name=String(value.name||value.filename||"αρχείο").replace(/[\r\n"\\]/g,"_").slice(0,180),mimeType=String(value.mimeType||"").toLowerCase();
  if(!ATTACHMENT_TYPES.has(mimeType))throw Object.assign(new Error("Επιτρέπονται μόνο φωτογραφίες JPG/PNG/WEBP και PDF."),{status:400});
  const match=String(value.dataUrl||"").match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if(!match||match[1].toLowerCase()!==mimeType)throw Object.assign(new Error("Μη έγκυρο αρχείο Chat."),{status:400});
  const buffer=Buffer.from(match[2],"base64");
  if(!buffer.length||buffer.length>MAX_ATTACHMENT_BYTES)throw Object.assign(new Error("Το αρχείο πρέπει να είναι έως 7 MB."),{status:400});
  const valid=mimeType==="application/pdf"?buffer.subarray(0,5).toString()==="%PDF-":mimeType==="image/jpeg"?buffer[0]===0xff&&buffer[1]===0xd8:mimeType==="image/png"?buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):buffer.subarray(0,4).toString()==="RIFF"&&buffer.subarray(8,12).toString()==="WEBP";
  if(!valid)throw Object.assign(new Error("Το περιεχόμενο του αρχείου δεν συμφωνεί με τον τύπο του."),{status:400});
  return {name,mimeType,size:buffer.length,checksum:crypto.createHash("sha256").update(buffer).digest("hex"),data:match[2]};
}

router.get("/stores/:storeId/messages",async(req,res,next)=>{try{
  const store=await storeFor(req,res);if(!store)return;
  const limit=Math.min(Math.max(Number(req.query.limit||100),1),200);
  const fetched=await prisma.$queryRaw`
    SELECT m."id",m."senderId",COALESCE(NULLIF(su."fullName",''),NULLIF(su."email",''),NULLIF(so."displayName",''),m."senderId") AS "senderName",
      m."category",m."body",m."important",m."pinned",m."completed",m."completedAt",m."completedBy",
      COALESCE(NULLIF(cu."fullName",''),NULLIF(cu."email",''),NULLIF(co."displayName",''),m."completedBy") AS "completedByName",
      t."id" AS "taskId",t."title" AS "taskTitle",t."status" AS "taskStatus",t."createdAt" AS "taskCreatedAt",
      COALESCE(NULLIF(tu."fullName",''),NULLIF(tu."email",''),NULLIF(to2."displayName",''),t."createdBy") AS "taskCreatedByName",
      m."createdAt",m."attachmentName",m."attachmentMimeType",m."attachmentSize",
      (m."attachmentData" IS NOT NULL) AS "hasAttachment",
      (m."senderId"=${req.user.id} OR EXISTS(SELECT 1 FROM "StoreChatRead" mine WHERE mine."messageId"=m."id" AND mine."userId"=${req.user.id})) AS "readByMe",
      (SELECT COALESCE(json_agg(json_build_object('id',r."userId",'name',COALESCE(NULLIF(u."fullName",''),NULLIF(u."email",''),NULLIF(o."displayName",''),r."userId")) ORDER BY r."readAt"),'[]'::json)
        FROM "StoreChatRead" r
        LEFT JOIN "User" u ON u."id"=r."userId" AND u."companyId"=m."companyId"
        LEFT JOIN "StoreOperatorCredential" o ON o."id"=r."userId" AND o."companyId"=m."companyId" AND o."storeId"=m."storeId"
        WHERE r."messageId"=m."id") AS "readers"
    FROM "StoreChatMessage" m
    LEFT JOIN "User" su ON su."id"=m."senderId" AND su."companyId"=m."companyId"
    LEFT JOIN "StoreOperatorCredential" so ON so."id"=m."senderId" AND so."companyId"=m."companyId" AND so."storeId"=m."storeId"
    LEFT JOIN "User" cu ON cu."id"=m."completedBy" AND cu."companyId"=m."companyId"
    LEFT JOIN "StoreOperatorCredential" co ON co."id"=m."completedBy" AND co."companyId"=m."companyId" AND co."storeId"=m."storeId"
    LEFT JOIN "StoreChatTask" t ON t."messageId"=m."id" AND t."companyId"=m."companyId" AND t."storeId"=m."storeId"
    LEFT JOIN "User" tu ON tu."id"=t."createdBy" AND tu."companyId"=m."companyId"
    LEFT JOIN "StoreOperatorCredential" to2 ON to2."id"=t."createdBy" AND to2."companyId"=m."companyId" AND to2."storeId"=m."storeId"
    WHERE m."companyId"=${store.companyId} AND m."storeId"=${store.id}
    ORDER BY "readByMe" ASC,m."pinned" DESC,m."createdAt" DESC`;
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, private");
  res.json({store,rows:fetched.slice(0,limit),permissions:{canPin:canPin(req.user),canDownload:canDownload(req.user),canComplete:canPin(req.user),canCreateTask:true}});
}catch(e){next(e)}});

router.get("/stores/:storeId/messages/:messageId/attachment",async(req,res,next)=>{try{const store=await storeFor(req,res);if(!store)return;const id=String(req.params.messageId),download=req.query.download==="1";if(download&&!canDownload(req.user))return res.status(403).json({error:"Κατέβασμα αρχείου επιτρέπεται μόνο σε Ιδιοκτήτη ή Super Admin."});const rows=await prisma.$queryRaw`SELECT "attachmentName","attachmentMimeType","attachmentSize","attachmentChecksum","attachmentData" FROM "StoreChatMessage" WHERE "id"=${id} AND "companyId"=${store.companyId} AND "storeId"=${store.id} LIMIT 1`;const row=rows[0];if(!row?.attachmentData)return res.status(404).json({error:"Δεν βρέθηκε αρχείο."});const buffer=Buffer.from(row.attachmentData,"base64");res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, private");res.setHeader("Pragma","no-cache");res.setHeader("Expires","0");res.setHeader("Content-Type",row.attachmentMimeType);res.setHeader("Content-Length",String(buffer.length));res.setHeader("Content-Disposition",`${download?"attachment":"inline"}; filename*=UTF-8''${encodeURIComponent(row.attachmentName||"chat-file")}`);await audit(req,store,download?"STORE_CHAT_ATTACHMENT_DOWNLOADED":"STORE_CHAT_ATTACHMENT_OPENED",{messageId:id,filename:row.attachmentName,mimeType:row.attachmentMimeType,size:row.attachmentSize,checksum:row.attachmentChecksum});res.end(buffer)}catch(e){next(e)}});

router.patch("/stores/:storeId/messages/:messageId",async(req,res,next)=>{try{const store=await storeFor(req,res);if(!store)return;const id=String(req.params.messageId),hasPinned=typeof req.body?.pinned==="boolean",hasCompleted=typeof req.body?.completed==="boolean",important=Boolean(req.body?.important),pinned=Boolean(req.body?.pinned),completed=Boolean(req.body?.completed);const found=await prisma.$queryRaw`SELECT "id","category" FROM "StoreChatMessage" WHERE "id"=${id} AND "companyId"=${store.companyId} AND "storeId"=${store.id}`;if(!found.length)return res.status(404).json({error:"Δεν βρέθηκε μήνυμα."});if(hasCompleted){if(!canPin(req.user))return res.status(403).json({error:"Μόνο ο Ιδιοκτήτης ή ο Super Admin μπορεί να κλείσει μήνυμα ως ολοκληρωμένο."});await prisma.$executeRaw`UPDATE "StoreChatMessage" SET "completed"=${completed},"completedBy"=${completed?req.user.id:null},"completedAt"=${completed?new Date():null},"updatedAt"=NOW() WHERE "id"=${id} AND "companyId"=${store.companyId} AND "storeId"=${store.id}`;await audit(req,store,completed?"STORE_CHAT_MESSAGE_COMPLETED":"STORE_CHAT_MESSAGE_REOPENED",{messageId:id,completed});return res.json({ok:true})}if(hasPinned){if(!canPin(req.user))return res.status(403).json({error:"Μόνο ο Ιδιοκτήτης ή ο Super Admin μπορεί να καρφιτσώσει ανακοίνωση."});if(found[0].category!=="ANNOUNCEMENT")return res.status(400).json({error:"Μόνο μήνυμα κατηγορίας Ανακοίνωση μπορεί να καρφιτσωθεί."});await prisma.$executeRaw`UPDATE "StoreChatMessage" SET "pinned"=${pinned},"updatedAt"=NOW() WHERE "id"=${id} AND "companyId"=${store.companyId} AND "storeId"=${store.id}`;await audit(req,store,pinned?"STORE_CHAT_ANNOUNCEMENT_PINNED":"STORE_CHAT_ANNOUNCEMENT_UNPINNED",{messageId:id,pinned});return res.json({ok:true})}await prisma.$executeRaw`UPDATE "StoreChatMessage" SET "important"=${important},"updatedAt"=NOW() WHERE "id"=${id} AND "companyId"=${store.companyId} AND "storeId"=${store.id}`;await audit(req,store,important?"STORE_CHAT_MESSAGE_MARKED_IMPORTANT":"STORE_CHAT_MESSAGE_UNMARKED_IMPORTANT",{messageId:id,important});res.json({ok:true})}catch(e){next(e)}});
router.post("/stores/:storeId/messages/:messageId/read",async(req,res,next)=>{try{const store=await storeFor(req,res);if(!store)return;const id=String(req.params.messageId);await prisma.$executeRaw`INSERT INTO "StoreChatRead" ("messageId","userId","readAt") SELECT ${id},${req.user.id},NOW() WHERE EXISTS (SELECT 1 FROM "StoreChatMessage" WHERE "id"=${id} AND "companyId"=${store.companyId} AND "storeId"=${store.id}) ON CONFLICT ("messageId","userId") DO UPDATE SET "readAt"=NOW()`;await audit(req,store,"STORE_CHAT_MESSAGE_READ",{messageId:id});res.json({ok:true})}catch(e){next(e)}});
router.post("/stores/:storeId/messages/:messageId/task",async(req,res,next)=>{try{const store=await storeFor(req,res);if(!store)return;const messageId=String(req.params.messageId),taskId=`chat-task-${Date.now()}-${Math.random().toString(36).slice(2)}`,found=await prisma.$queryRaw`SELECT "body","attachmentName" FROM "StoreChatMessage" WHERE "id"=${messageId} AND "companyId"=${store.companyId} AND "storeId"=${store.id} LIMIT 1`;if(!found.length)return res.status(404).json({error:"Δεν βρέθηκε μήνυμα."});const title=String(found[0].body||found[0].attachmentName||"Εκκρεμότητα από Chat").trim().slice(0,300),created=await prisma.$queryRaw`INSERT INTO "StoreChatTask" ("id","companyId","storeId","messageId","title","status","createdBy","createdAt") VALUES (${taskId},${store.companyId},${store.id},${messageId},${title},'OPEN',${req.user.id},NOW()) ON CONFLICT ("messageId") DO NOTHING RETURNING "id"`;if(!created.length)return res.status(409).json({error:"Το μήνυμα έχει ήδη συνδεθεί με εκκρεμότητα."});await audit(req,store,"STORE_CHAT_TASK_CREATED",{messageId,taskId,title,status:"OPEN"});res.status(201).json({ok:true,taskId})}catch(e){next(e)}});
router.post("/stores/:storeId/messages",async(req,res,next)=>{try{const store=await storeFor(req,res);if(!store)return;const body=String(req.body?.body||"").trim(),category=String(req.body?.category||"GENERAL").toUpperCase(),attachment=parseAttachment(req.body?.attachment);if((!body&&!attachment)||body.length>5000||!TYPES.has(category))return res.status(400).json({error:"Μη έγκυρο μήνυμα ή κατηγορία."});const id=`chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;await prisma.$executeRaw`INSERT INTO "StoreChatMessage" ("id","companyId","storeId","senderId","category","body","attachmentName","attachmentMimeType","attachmentSize","attachmentChecksum","attachmentData","createdAt","updatedAt") VALUES (${id},${store.companyId},${store.id},${req.user.id},${category},${body},${attachment?.name||null},${attachment?.mimeType||null},${attachment?.size||null},${attachment?.checksum||null},${attachment?.data||null},NOW(),NOW())`;await audit(req,store,"STORE_CHAT_MESSAGE_SENT",{messageId:id,category,hasAttachment:Boolean(attachment),attachmentName:attachment?.name||null,attachmentMimeType:attachment?.mimeType||null,attachmentSize:attachment?.size||null,attachmentChecksum:attachment?.checksum||null});res.status(201).json({ok:true,id})}catch(e){next(e)}});
export default router;
