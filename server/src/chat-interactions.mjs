// Additive store Chat interactions. All callers retain the existing auth/module gate.
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const CHAT_REACTIONS=Object.freeze(['👍','✅','❤️']);
export function chatMessageId(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value))throw fail('Μη έγκυρο μήνυμα.');
 return value;
}
export function deliveryIds(value){
 if(!Array.isArray(value)||value.length>200)throw fail('Μη έγκυρη επιβεβαίωση παραλαβής.');
 return [...new Set(value.map(chatMessageId))];
}
export function chatReaction(value){
 if(value===null)return null;
 if(!CHAT_REACTIONS.includes(value))throw fail('Επίλεξε μία από τις διαθέσιμες αντιδράσεις.');
 return value;
}
export async function ensureStoreChatInteractions(db){
 await db.$executeRawUnsafe('ALTER TABLE "StoreChatMessage" ADD COLUMN IF NOT EXISTS "replyToId" TEXT');
 await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreChatMessage_pinned_announcements_idx" ON "StoreChatMessage" ("storeId","createdAt" DESC) WHERE "pinned"=true AND "category"='ANNOUNCEMENT'`);
 await db.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "StoreChatDelivery" ("messageId" TEXT NOT NULL,"userId" TEXT NOT NULL,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"deliveredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY ("messageId","userId"))');
 await db.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "StoreChatReaction" ("messageId" TEXT NOT NULL,"userId" TEXT NOT NULL,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"reaction" TEXT NOT NULL CHECK ("reaction" IN (\'👍\',\'✅\',\'❤️\')),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY ("messageId","userId"))');
}
export async function requireChatReply(tx,store,value){
 const id=chatMessageId(value);
 const rows=await tx.$queryRaw`SELECT "id" FROM "StoreChatMessage" WHERE "id"=${id} AND "companyId"=${store.companyId} AND "storeId"=${store.id} FOR KEY SHARE`;
 if(rows.length!==1)throw fail('Δεν βρέθηκε το μήνυμα σε αυτό το κατάστημα.',404);
 return id;
}
export async function acknowledgeChatDelivery(db,store,user,value){
 const ids=deliveryIds(value);if(!ids.length)return {ok:true,received:0};
 return db.$transaction(async tx=>{
  const found=await tx.$queryRaw`SELECT "id" FROM "StoreChatMessage" WHERE "id"=ANY(${ids}::text[]) AND "companyId"=${store.companyId} AND "storeId"=${store.id} FOR KEY SHARE`;
  if(found.length!==ids.length)throw fail('Δεν βρέθηκαν τα μηνύματα σε αυτό το κατάστημα.',404);
  const inserted=await tx.$queryRaw`INSERT INTO "StoreChatDelivery" ("messageId","userId","companyId","storeId") SELECT "id",${user.id},"companyId","storeId" FROM "StoreChatMessage" WHERE "id"=ANY(${ids}::text[]) AND "companyId"=${store.companyId} AND "storeId"=${store.id} AND "senderId"<>${user.id} ON CONFLICT ("messageId","userId") DO NOTHING RETURNING "messageId"`;
  return {ok:true,received:inserted.length};
 });
}
export async function setChatReaction(db,store,user,messageId,value){
 const reaction=chatReaction(value);
 return db.$transaction(async tx=>{
  const id=await requireChatReply(tx,store,messageId);
  const changed=reaction===null
   ?await tx.$executeRaw`DELETE FROM "StoreChatReaction" WHERE "messageId"=${id} AND "userId"=${user.id} AND "companyId"=${store.companyId} AND "storeId"=${store.id}`
   :await tx.$executeRaw`INSERT INTO "StoreChatReaction" ("messageId","userId","companyId","storeId","reaction") VALUES (${id},${user.id},${store.companyId},${store.id},${reaction}) ON CONFLICT ("messageId","userId") DO UPDATE SET "reaction"=EXCLUDED."reaction","updatedAt"=NOW() WHERE "StoreChatReaction"."companyId"=EXCLUDED."companyId" AND "StoreChatReaction"."storeId"=EXCLUDED."storeId" AND "StoreChatReaction"."reaction" IS DISTINCT FROM EXCLUDED."reaction"`;
  return {ok:true,reaction,changed:Number(changed)};
 });
}
