import {chatCredentialStamp} from "./chat-operator-auth.mjs";
import {chatEnabled,ensureChatMobileSchema,mobilePushRecipients,removeMobilePushEndpoints,retireMobilePushEndpoint} from "./chat-mobile.mjs";
import {assertCustomerDemoOutboundAllowed} from "./customer-demo-runtime.js";
import webpush from "web-push";
import {prisma} from "./prisma.js";
import {isApplePushEndpoint} from "./store-chat-push-policy.js";

const VAPID_SUBJECT="mailto:admin@myworkstationapp.gr";

export async function ensureStoreChatPushSchema(){
  await ensureChatMobileSchema();
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreChatPushKey" ("id" TEXT PRIMARY KEY,"publicKey" TEXT NOT NULL,"privateKey" TEXT NOT NULL,"createdAt" TIMESTAMP NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreChatPushSubscription" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"userId" TEXT NOT NULL,"endpoint" TEXT NOT NULL UNIQUE,"subscriptionJson" JSONB NOT NULL,"createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMP NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe('ALTER TABLE "StoreChatPushSubscription" ADD COLUMN IF NOT EXISTS "chatSessionId" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE "StoreChatPushSubscription" ADD COLUMN IF NOT EXISTS "credentialStamp" TEXT');
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
  assertCustomerDemoOutboundAllowed({companyId:store.companyId,storeId:store.id});
  const endpoint=String(subscription?.endpoint||"");
  const p256dh=String(subscription?.keys?.p256dh||""),auth=String(subscription?.keys?.auth||"");
  if(!endpoint.startsWith("https://")||!p256dh||!auth)throw Object.assign(new Error("Μη έγκυρη συνδρομή ειδοποιήσεων."),{status:400});
  const id=`chat-push-${Date.now()}-${Math.random().toString(36).slice(2)}`,payload={endpoint,expirationTime:subscription.expirationTime||null,keys:{p256dh,auth}};
  await ensureChatMobileSchema();
  await prisma.$transaction(async tx=>{
  await tx.$queryRawUnsafe('SELECT (pg_advisory_xact_lock(hashtext($1)) IS NULL) AS locked',endpoint);
  await retireMobilePushEndpoint(endpoint,tx);
  await tx.$executeRaw`INSERT INTO "StoreChatPushSubscription" ("id","companyId","storeId","userId","endpoint","subscriptionJson","createdAt","updatedAt","chatSessionId","credentialStamp") VALUES (${id},${store.companyId},${store.id},${user.id},${endpoint},${JSON.stringify(payload)}::jsonb,NOW(),NOW(),${user.chatSessionId||null},${user.chatCredentialStamp||null}) ON CONFLICT ("endpoint") DO UPDATE SET "companyId"=EXCLUDED."companyId","storeId"=EXCLUDED."storeId","userId"=EXCLUDED."userId","subscriptionJson"=EXCLUDED."subscriptionJson","chatSessionId"=EXCLUDED."chatSessionId","credentialStamp"=EXCLUDED."credentialStamp","updatedAt"=NOW()`;
  });
}

export async function sendStoreChatPush({store,senderId}){
  assertCustomerDemoOutboundAllowed({companyId:store.companyId,storeId:store.id});
  await vapidKeys();
  const legacyRows=await prisma.$queryRaw`SELECT "endpoint","subscriptionJson","chatSessionId","credentialStamp" FROM "StoreChatPushSubscription" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "userId"<>${senderId}`;
  const verifiedLegacy=[];
  for(const row of legacyRows){
    if(!row.chatSessionId){verifiedLegacy.push(row);continue}
    const credentials=await prisma.$queryRawUnsafe('SELECT c."id",c."pinHash",c."cardCodeHash",c."role" FROM "StoreChatMobileSession" sm JOIN "StoreOperatorCredential" c ON c."id"=sm."operatorId" AND c."storeId"=sm."storeId" AND c."companyId"=sm."companyId" AND c."active"=TRUE JOIN "Employee" e ON e."id"=c."employeeId" AND e."active"=TRUE JOIN "Store" s ON s."id"=c."storeId" AND s."active"=TRUE JOIN "Company" co ON co."id"=c."companyId" AND co."active"=TRUE WHERE sm."id"=$1 AND sm."storeId"=$2 AND sm."companyId"=$3 AND sm."revokedAt" IS NULL',row.chatSessionId,store.id,store.companyId);
    if(credentials[0]&&chatCredentialStamp(credentials[0])===row.credentialStamp&&await chatEnabled(store))verifiedLegacy.push(row);
  }
  const mobileRows=await mobilePushRecipients(store,senderId).catch(error=>{console.error("Chat mobile recipient lookup unavailable",error?.code||"unknown");return []});
  const rows=[...new Map([...verifiedLegacy,...mobileRows].map(row=>[row.endpoint,row])).values()];
  const payload={title:"MyWorkStation · Chat",body:`Νέο μήνυμα στο ${store.name}`,url:"/",storeId:store.id};
  const results=await Promise.allSettled(rows.map(row=>webpush.sendNotification(row.subscriptionJson,JSON.stringify({...payload,requiresSystemNotification:isApplePushEndpoint(row.endpoint)}),{TTL:300,urgency:"high"})));
  const expired=rows.filter((_,index)=>results[index].status==="rejected"&&[404,410].includes(results[index].reason?.statusCode)).map(row=>row.endpoint);
  if(expired.length)await prisma.$executeRaw`DELETE FROM "StoreChatPushSubscription" WHERE "endpoint"=ANY(${expired}::text[])`;
  await removeMobilePushEndpoints(expired);
  return {attempted:rows.length,delivered:results.filter(result=>result.status==="fulfilled").length};
}
