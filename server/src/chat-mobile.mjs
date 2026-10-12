import {prisma} from "./prisma.js";
import {companyModuleState,effectiveModuleEnabled,isPlatformSuperAdmin} from "./middleware/module-access.js";
import {assertCustomerDemoOutboundAllowed} from "./customer-demo-runtime.js";
let schema;
export function ensureChatMobileSchema(){
 if(!schema)schema=(async()=>{
  await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "StoreChatMobilePush" ("endpoint" TEXT PRIMARY KEY,"userId" TEXT NOT NULL,"role" TEXT NOT NULL,"sessionId" TEXT NOT NULL,"sessionVersion" INTEGER NOT NULL,"supportCompanyId" TEXT,"storeIds" JSONB NOT NULL,"subscriptionJson" JSONB NOT NULL,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "StoreChatMobilePush_stores_idx" ON "StoreChatMobilePush" USING GIN ("storeIds")');
  await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "StoreChatMobileSession" ("id" TEXT PRIMARY KEY,"operatorId" TEXT NOT NULL,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"expiresAt" TIMESTAMPTZ NOT NULL,"revokedAt" TIMESTAMPTZ,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 })().catch(e=>{schema=undefined;throw e});return schema;
}
export async function chatEnabled(store){
 const state=await companyModuleState(store.companyId);
 if(!state?.licenseAllowed)return false;
 const rows=await prisma.$queryRawUnsafe('SELECT "active","startsAt","endsAt" FROM "StorePaidModule" WHERE "storeId"=$1 AND "moduleKey"=$2 LIMIT 1',store.id,"STORE_CHAT");
 return effectiveModuleEnabled(state.activeModules.includes("STORE_CHAT"),rows[0]?{...rows[0],configured:true}:{configured:false});
}
export async function mobileChatStores(user){
 if(user.tokenType!=="BACKOFFICE_USER"||!["OWNER","ADMIN","MANAGER"].includes(user.role)&&!isPlatformSuperAdmin(user))throw Object.assign(new Error("Η λίστα αφορά τον Ιδιοκτήτη ή εξουσιοδοτημένο λογαριασμό διαχείρισης."),{status:403});
 let companyIds=[user.companyId];
 if(user.role==="OWNER"&&!isPlatformSuperAdmin(user)&&!user.supportContext){
  const row=await prisma.user.findUnique({where:{id:user.id},select:{companyId:true}});
  if(!row)throw Object.assign(new Error("Η συνεδρία έληξε."),{status:401});
  const access=await prisma.$queryRawUnsafe('SELECT "companyId" FROM "OwnerCompanyAccess" WHERE "ownerId"=$1',user.id);
  companyIds=[...new Set([row.companyId,...access.map(r=>r.companyId)])];
 }
 const platform=isPlatformSuperAdmin(user)&&!user.supportContext;
 const stores=await prisma.store.findMany({where:{active:true,company:{active:true},...(platform?{}:{companyId:{in:companyIds}})},select:{id:true,name:true,companyId:true,company:{select:{name:true}}},orderBy:[{companyId:"asc"},{name:"asc"}]});
 const enabled=[];for(const store of stores)if(platform||await chatEnabled(store))enabled.push({id:store.id,name:store.name,companyId:store.companyId,companyName:store.company.name});
 const ids=enabled.map(s=>s.id);
 const unread=ids.length?await prisma.$queryRawUnsafe('SELECT m."storeId",COUNT(*)::int AS unread FROM "StoreChatMessage" m JOIN "Store" s ON s."id"=m."storeId" AND s."companyId"=m."companyId" LEFT JOIN "StoreChatRead" r ON r."messageId"=m."id" AND r."userId"=$1 WHERE m."storeId"=ANY($2::text[]) AND m."senderId"<>$1 AND r."messageId" IS NULL GROUP BY m."storeId"',user.id,ids):[];
 return {stores:enabled.map(s=>({...s,unread:unread.find(r=>r.storeId===s.id)?.unread||0})),currentCompanyId:user.companyId,canSwitchCompany:user.role==="OWNER"&&!isPlatformSuperAdmin(user)&&!user.supportContext};
}
export function validateMobileSubscription(value){
 let url;try{url=new URL(value?.endpoint)}catch{throw Object.assign(new Error("Μη έγκυρη υπηρεσία Push."),{status:400})}
 if(url.protocol!=="https:"||url.username||url.password||url.port||!["fcm.googleapis.com","updates.push.services.mozilla.com","web.push.apple.com"].includes(url.hostname))throw Object.assign(new Error("Η υπηρεσία Push δεν υποστηρίζεται."),{status:400});
 if(!/^[A-Za-z0-9_-]{12,200}$/.test(value?.keys?.p256dh||"")||!/^[A-Za-z0-9_-]{12,200}$/.test(value?.keys?.auth||""))throw Object.assign(new Error("Μη έγκυρα κλειδιά Push."),{status:400});
 return {endpoint:url.href,expirationTime:value.expirationTime||null,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth}};
}
export async function saveMobilePush(user,value){
 const subscription=validateMobileSubscription(value),{stores}=await mobileChatStores(user);
 if(!stores.length)throw Object.assign(new Error("Δεν υπάρχουν διαθέσιμα καταστήματα Chat."),{status:403});
 for(const store of stores)assertCustomerDemoOutboundAllowed({companyId:store.companyId,storeId:store.id});
 if(!user.sessionId||!Number.isInteger(user.sessionVersion))throw Object.assign(new Error("Συνδέσου ξανά για ειδοποιήσεις."),{status:401});
 await ensureChatMobileSchema();
 await prisma.$transaction(async tx=>{
  await tx.$queryRawUnsafe('SELECT (pg_advisory_xact_lock(hashtext($1)) IS NULL) AS locked',subscription.endpoint);
  await tx.$executeRawUnsafe('DELETE FROM "StoreChatPushSubscription" WHERE "endpoint"=$1',subscription.endpoint);
  await tx.$executeRawUnsafe('INSERT INTO "StoreChatMobilePush" ("endpoint","userId","role","sessionId","sessionVersion","supportCompanyId","storeIds","subscriptionJson") VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) ON CONFLICT ("endpoint") DO UPDATE SET "userId"=EXCLUDED."userId","role"=EXCLUDED."role","sessionId"=EXCLUDED."sessionId","sessionVersion"=EXCLUDED."sessionVersion","supportCompanyId"=EXCLUDED."supportCompanyId","storeIds"=EXCLUDED."storeIds","subscriptionJson"=EXCLUDED."subscriptionJson","updatedAt"=NOW()',subscription.endpoint,user.id,user.platformRole||user.role,user.sessionId,user.sessionVersion,user.supportContext?user.companyId:null,JSON.stringify(stores.map(s=>s.id)),JSON.stringify(subscription));
 });
 return {stores:stores.length};
}
export async function mobilePushRecipients(store,senderId){
 await ensureChatMobileSchema();const enabled=await chatEnabled(store);
 return prisma.$queryRawUnsafe('SELECT p."endpoint",p."subscriptionJson" FROM "StoreChatMobilePush" p JOIN "User" u ON u."id"=p."userId" AND u."sessionVersion"=p."sessionVersion" AND u."role"::text=p."role" JOIN "UserSession" ss ON ss."id"=p."sessionId" AND ss."userId"=u."id" AND ss."revokedAt" IS NULL JOIN "Store" st ON st."id"=$1 AND st."companyId"=$2 AND st."active"=TRUE JOIN "Company" c ON c."id"=st."companyId" AND c."active"=TRUE WHERE p."userId"<>$3 AND p."storeIds" @> $4::jsonb AND (p."supportCompanyId" IS NULL OR p."supportCompanyId"=st."companyId") AND (u."role"::text=$5 OR ($6::boolean AND ((u."role"::text=$7 AND (u."companyId"=st."companyId" OR EXISTS(SELECT 1 FROM "OwnerCompanyAccess" a WHERE a."ownerId"=u."id" AND a."companyId"=st."companyId"))) OR (u."role"::text IN ($8,$9) AND u."companyId"=st."companyId"))))',store.id,store.companyId,senderId,JSON.stringify([store.id]),"SUPER_ADMIN",enabled,"OWNER","ADMIN","MANAGER");
}
export async function removeMobilePushEndpoints(endpoints){if(endpoints.length)await prisma.$executeRawUnsafe('DELETE FROM "StoreChatMobilePush" WHERE "endpoint"=ANY($1::text[])',endpoints)}
export async function retireMobilePushEndpoint(endpoint,db=prisma){await ensureChatMobileSchema();await db.$executeRawUnsafe('DELETE FROM "StoreChatMobilePush" WHERE "endpoint"=$1',endpoint)}
