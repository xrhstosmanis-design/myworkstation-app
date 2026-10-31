import crypto from 'node:crypto';
import {VOICE_MAX_BYTES,validateVoiceWave} from './chat-voice.mjs';
import {parseVideoAttachment} from './chat-video.mjs';
import {chatMessageId} from './chat-interactions.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function searchInput(query,before){
 if(typeof query!=='string')throw fail('Γράψε κείμενο αναζήτησης.');
 const q=query.trim().normalize('NFC');
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(q)||[...q].length<2||[...q].length>120)throw fail('Η αναζήτηση χρειάζεται 2 έως 120 χαρακτήρες.');
 return {q,pattern:'%'+q.replace(/[!%_]/g,'!$&')+'%',before:before==null||before===''?null:chatMessageId(before)};
}
export function forwardInput(value){
 if(!value||typeof value!=='object'||typeof value.requestId!=='string'||!/^[A-Za-z0-9_-]{16,80}$/.test(value.requestId))throw fail('Μη έγκυρη προώθηση.');
 return {targetStoreId:chatMessageId(value.targetStoreId),targetCompanyId:chatMessageId(value.targetCompanyId),requestId:value.requestId};
}
export async function searchChatMessages(db,store,query,before){
 const input=searchInput(query,before);
 const found=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '1500ms'");
  if(input.before){const pivot=await tx.$queryRawUnsafe('SELECT "id" FROM "StoreChatMessage" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3',input.before,store.companyId,store.id);if(!pivot.length)throw fail('Η σελίδα αναζήτησης δεν είναι διαθέσιμη.',404);}
  return tx.$queryRawUnsafe(`WITH candidates AS MATERIALIZED (
   SELECT m."id" FROM "StoreChatMessage" m WHERE m."companyId"=$1 AND m."storeId"=$2
   AND (m."body" ILIKE $3 ESCAPE '!' OR COALESCE(m."attachmentName",'') ILIKE $3 ESCAPE '!')
   AND ($4::text IS NULL OR (m."createdAt",m."id") < (SELECT p."createdAt",p."id" FROM "StoreChatMessage" p WHERE p."id"=$4 AND p."companyId"=$1 AND p."storeId"=$2))
   ORDER BY m."createdAt" DESC,m."id" DESC LIMIT 21
  ) SELECT m."id",m."senderId",LEFT(m."body",5000) AS "body",m."category",m."createdAt",m."forwarded",
   LEFT(COALESCE(NULLIF(u."fullName",''),NULLIF(o."displayName",''),'Χρήστης'),160) AS "senderName",
   m."attachmentName",m."attachmentMimeType",m."attachmentSize",(m."attachmentData" IS NOT NULL) AS "hasAttachment"
   FROM candidates c JOIN "StoreChatMessage" m ON m."id"=c."id" AND m."companyId"=$1 AND m."storeId"=$2
   LEFT JOIN "User" u ON u."id"=m."senderId" AND u."companyId"=m."companyId"
   LEFT JOIN "StoreOperatorCredential" o ON o."id"=m."senderId" AND o."companyId"=m."companyId" AND o."storeId"=m."storeId"
   ORDER BY m."createdAt" DESC,m."id" DESC`,store.companyId,store.id,input.pattern,input.before);
 });
 const rows=found.slice(0,20);
 return {store,q:input.q,rows,nextCursor:found.length>20?rows.at(-1).id:null};
}
export function forwardAttachment(row,{canCopyAttachment,photosEnabled,pdfEnabled}){
 if(row.attachmentData==null)return null;
 if(typeof row.attachmentData!=='string'||!row.attachmentData)throw fail('Δεν επιβεβαιώθηκε το αρχικό συνημμένο.');
 if(!canCopyAttachment)throw fail('Η προώθηση συνημμένων δεν επιτρέπεται με τις ρυθμίσεις λήψης αυτού του Chat.',403);
 const mime=row.attachmentMimeType,maximum=mime==='video/mp4'?12*1024*1024:mime==='audio/wav'?VOICE_MAX_BYTES:7*1024*1024;
 if(!['image/jpeg','image/png','image/webp','application/pdf','audio/wav','video/mp4'].includes(mime))throw fail('Το συνημμένο δεν υποστηρίζεται.');
 if((mime.startsWith('image/')||mime==='video/mp4')&&!photosEnabled||mime==='application/pdf'&&!pdfEnabled)throw fail('Τα συνημμένα αυτού του τύπου είναι ανενεργά στον προορισμό.',403);
 const bytes=Buffer.from(row.attachmentData,'base64');
 if(!bytes.length||bytes.length>maximum||bytes.toString('base64')!==row.attachmentData||bytes.length!==row.attachmentSize||crypto.createHash('sha256').update(bytes).digest('hex')!==row.attachmentChecksum)throw fail('Δεν επιβεβαιώθηκε το αρχικό συνημμένο.');
 if(mime==='audio/wav')validateVoiceWave(bytes);
 if(mime==='video/mp4')parseVideoAttachment({mimeType:mime,dataUrl:'data:video/mp4;base64,'+row.attachmentData});
 return {name:row.attachmentName,mime,size:bytes.length,checksum:row.attachmentChecksum,data:row.attachmentData};
}
// Caller checks both live store/module/session scopes before entering this transaction.
export async function forwardChatMessage(db,{source,target,user,messageId,requestId,attachmentPolicy},writeAudit){
 chatMessageId(messageId);forwardInput({targetStoreId:target.id,targetCompanyId:target.companyId,requestId});
 if(source.id===target.id)throw fail('Επίλεξε διαφορετική συνομιλία.');
 const id='chat-forward-'+crypto.createHash('sha256').update(user.id+'\0'+requestId).digest('hex');
 return db.$transaction(async tx=>{
  const scopes=await tx.$queryRawUnsafe('SELECT "id","companyId","active" FROM "Store" WHERE "id"=ANY($1::text[]) ORDER BY "id" FOR SHARE',[source.id,target.id]);
  if(scopes.length!==2||!scopes.some(s=>s.id===source.id&&s.companyId===source.companyId)||!scopes.some(s=>s.id===target.id&&s.companyId===target.companyId&&s.active))throw fail('Η συνομιλία προέλευσης ή προορισμού άλλαξε. Επίλεξε ξανά.',404);

  const rows=await tx.$queryRawUnsafe('SELECT * FROM "StoreChatMessage" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3 FOR KEY SHARE',messageId,source.companyId,source.id);
  const row=rows[0];if(!row)throw fail('Δεν βρέθηκε το μήνυμα σε αυτό το κατάστημα.',404);
  const attachment=forwardAttachment(row,attachmentPolicy);
  if(typeof row.body!=='string'||row.body.length>5000||!row.body.trim()&&!attachment)throw fail('Δεν επιβεβαιώθηκε το αρχικό μήνυμα.');
  const inserted=await tx.$queryRawUnsafe(`INSERT INTO "StoreChatForwardIntent" ("userId","requestId","sourceCompanyId","sourceStoreId","sourceMessageId","targetCompanyId","targetStoreId","messageId")
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT ("userId","requestId") DO NOTHING RETURNING "messageId"`,user.id,requestId,source.companyId,source.id,messageId,target.companyId,target.id,id);
  if(!inserted.length){
   const previous=(await tx.$queryRawUnsafe('SELECT * FROM "StoreChatForwardIntent" WHERE "userId"=$1 AND "requestId"=$2',user.id,requestId))[0];
   if(!previous||previous.sourceCompanyId!==source.companyId||previous.sourceStoreId!==source.id||previous.sourceMessageId!==messageId||previous.targetCompanyId!==target.companyId||previous.targetStoreId!==target.id)throw fail('Το αίτημα προώθησης χρησιμοποιήθηκε για διαφορετικό μήνυμα ή προορισμό.',409);
   return {ok:true,id:previous.messageId,targetStoreId:target.id,replayed:true};
  }
  await tx.$executeRawUnsafe(`INSERT INTO "StoreChatMessage" ("id","companyId","storeId","senderId","category","body","forwarded","attachmentName","attachmentMimeType","attachmentSize","attachmentChecksum","attachmentData","createdAt","updatedAt")
   VALUES ($1,$2,$3,$4,'GENERAL',$5,true,$6,$7,$8,$9,$10,NOW(),NOW())`,id,target.companyId,target.id,user.id,row.body,attachment?.name??null,attachment?.mime??null,attachment?.size??null,attachment?.checksum??null,attachment?.data??null);
  await writeAudit(tx,id);
  return {ok:true,id,targetStoreId:target.id,replayed:false};
 });
}
