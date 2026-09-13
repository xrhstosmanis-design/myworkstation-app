import webpush from "web-push";
import {prisma} from "./prisma.js";

const VAPID_SUBJECT="mailto:admin@myworkstationapp.gr";

export async function ensureStoreChatPushSchema(){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreChatPushKey" ("id" TEXT PRIMARY KEY,"publicKey" TEXT NOT NULL,"privateKey" TEXT NOT NULL,"createdAt" TIMESTAMP NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreChatPushSubscription" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"userId" TEXT NOT NULL,"endpoint" TEXT NOT NULL UNIQUE,"subscriptionJson" JSONB NOT NULL,"createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMP NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreChatPushSubscription_store_idx" ON "StoreChatPushSubscription" ("companyId","storeId","updatedAt")`);
}

async function vapidKeys(){
  let row=(await prisma.$queryRaw`SELECT "publicKey","privateKey" FROM "StoreChatPushKey" WHERE "id"='STORE_CHAT' LIMIT 1`)[0];
  if(!row){
    const generated=webpush.generateVAPIDKeys();
    await prisma.$executeRaw`INSERT INTO "StoreChatPushKey" ("id","publicKey","privateKey") VALUES ('STORE_CHAT',${generated.publicKey},${generated.privateKey}) ON CONFLICT ("id") DO NOTHING`;
    row=(await prisma.$queryRaw`SELECT "publicKey","privateKey" FROM "StoreChatPushKey" WHERE "id"='STORE_CHAT' LIMIT 1`)[0];
  }
  webpush.setVapidDetails(VAPID_SUBJECT,row.publicKey,row.privateKey);
  return row;
}

export async function storeChatPushPublicKey(){return (await vapidKeys()).publicKey}

export async function saveStoreChatPushSubscription({store,user,subscription}){
  const endpoint=String(subscription?.endpoint||"");
  const p256dh=String(subscription?.keys?.p256dh||""),auth=String(subscription?.keys?.auth||"");
  if(!endpoint.startsWith("https://")||!p256dh||!auth)throw Object.assign(new Error("Μη έγκυρη συνδρομή ειδοποιήσεων."),{status:400});
  const id=`chat-push-${Date.now()}-${Math.random().toString(36).slice(2)}`,payload={endpoint,expirationTime:subscription.expirationTime||null,keys:{p256dh,auth}};
  await prisma.$executeRaw`INSERT INTO "StoreChatPushSubscription" ("id","companyId","storeId","userId","endpoint","subscriptionJson","createdAt","updatedAt") VALUES (${id},${store.companyId},${store.id},${user.id},${endpoint},${JSON.stringify(payload)}::jsonb,NOW(),NOW()) ON CONFLICT ("endpoint") DO UPDATE SET "companyId"=EXCLUDED."companyId","storeId"=EXCLUDED."storeId","userId"=EXCLUDED."userId","subscriptionJson"=EXCLUDED."subscriptionJson","updatedAt"=NOW()`;
}

export async function sendStoreChatPush({store,senderId}){
  await vapidKeys();
  const rows=await prisma.$queryRaw`SELECT "endpoint","subscriptionJson" FROM "StoreChatPushSubscription" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "userId"<>${senderId}`;
  const payload=JSON.stringify({title:"MyWorkStation · Chat",body:`Νέο μήνυμα στο ${store.name}`,url:"/",storeId:store.id});
  const results=await Promise.allSettled(rows.map(row=>webpush.sendNotification(row.subscriptionJson,payload,{TTL:300,urgency:"high"})));
  const expired=rows.filter((_,index)=>results[index].status==="rejected"&&[404,410].includes(results[index].reason?.statusCode)).map(row=>row.endpoint);
  if(expired.length)await prisma.$executeRaw`DELETE FROM "StoreChatPushSubscription" WHERE "endpoint"=ANY(${expired}::text[])`;
  return {attempted:rows.length,delivered:results.filter(result=>result.status==="fulfilled").length};
}
