import crypto from "node:crypto";
import {z} from "zod";
import {requireStaffAction,staffError} from "./backoffice-staff-access.js";

const file=z.object({dataUrl:z.string().max(4600000),filename:z.string().trim().min(1).max(180)});
const uploadBody=z.object({
  storeId:z.string().min(1),supplierId:z.string().optional().nullable(),
  responsibleName:z.string().trim().max(180).optional().nullable(),
  note:z.string().trim().max(1000).optional().nullable(),file
});
const staffUploadBody=uploadBody.pick({storeId:true,note:true,file:true}).strict();
const base64=/^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
function matchesSignature(mime,bytes){
  if(mime==="application/pdf")return bytes.subarray(0,5).toString("ascii")==="%PDF-";
  if(mime==="image/jpeg")return bytes.subarray(0,3).equals(Buffer.from([255,216,255]));
  if(mime==="image/png")return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  return bytes.subarray(0,4).toString("ascii")==="RIFF"&&bytes.subarray(8,12).toString("ascii")==="WEBP";
}

export async function uploadInvoiceInboxOriginal(db,req,{authorize=requireStaffAction}={}){
  const staff=req.user.staffAccess===true;
  const body=(staff?staffUploadBody:uploadBody).parse(req.body||{});
  const {storeId}=body,{companyId,id:actorId}=req.user;
  if(staff&&req.user.storeId!==storeId)throw staffError();
  const match=base64.exec(body.file.dataUrl);
  if(!match)throw staffError(400,"INVALID_INVOICE_ORIGINAL","Το αρχείο πρέπει να είναι PDF, JPEG, PNG ή WEBP.");
  const [,mime,content]=match,bytes=Buffer.from(content,"base64");
  if(bytes.length<100||bytes.length>3400000)throw staffError(400,"INVALID_INVOICE_ORIGINAL_LENGTH","Το αρχείο πρέπει να είναι έως 3,4 MB.");
  if(staff&&(!matchesSignature(mime,bytes)||bytes.toString("base64")!==content))
    throw staffError(400,"INVALID_INVOICE_ORIGINAL","Ο τύπος του αρχείου δεν συμφωνεί με τα περιεχόμενά του.");
  const attachmentId=crypto.randomUUID(),inboxId=crypto.randomUUID();
  const checksum=crypto.createHash("sha256").update(bytes).digest("hex");
  return db.$transaction(async tx=>{
    if(staff)await authorize(tx,req,storeId,"invoices.upload-original");
    else if(!await tx.store.findFirst({where:{id:storeId,companyId},select:{id:true}}))
      throw staffError(404,"STAFF_OBJECT_NOT_FOUND","Δεν βρέθηκε το κατάστημα.");
    await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${JSON.stringify(["invoice-original",companyId,storeId,checksum])})) IS NULL) AS "locked"`;
    const [existing]=await tx.$queryRaw`
      SELECT i."id",i."status" FROM "DocumentInbox" i JOIN "DocumentAttachment" a
        ON a."id"=i."attachmentId" AND a."companyId"=i."companyId" AND a."storeId"=i."storeId"
      WHERE i."companyId"=${companyId} AND i."storeId"=${storeId} AND a."checksum"=${checksum} LIMIT 1`;
    if(existing)throw staffError(409,"INVOICE_ORIGINAL_DUPLICATE","Το ίδιο αρχείο τιμολογίου υπάρχει ήδη στη θυρίδα του καταστήματος.");
    await tx.$executeRaw`
      INSERT INTO "DocumentAttachment" ("id","companyId","storeId","documentType","filename","mimeType","storageKey","checksum","contentData")
      VALUES (${attachmentId},${companyId},${storeId},'INVOICE_INBOX',${body.file.filename},${mime},${`DATABASE:${checksum}`},${checksum},${body.file.dataUrl})`;
    await tx.$executeRaw`
      INSERT INTO "DocumentInbox" ("id","companyId","storeId","supplierId","attachmentId","status","note","responsibleName","createdByUserId")
      VALUES (${inboxId},${companyId},${storeId},${body.supplierId||null},${attachmentId},'RECEIVED',${body.note||null},${staff?(req.user.fullName||null):body.responsibleName||null},${actorId})`;
    if(staff)await tx.$executeRaw`
      INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","actorId","eventType","details")
      VALUES (${crypto.randomUUID()},${companyId},${storeId},${actorId},'INVOICE_ORIGINAL_UPLOADED',
        ${JSON.stringify({inboxId,attachmentId,checksum,mime})}::jsonb)`;
    return {id:inboxId,status:"RECEIVED"};
  });
}
