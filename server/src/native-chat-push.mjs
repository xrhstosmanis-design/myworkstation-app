import {nativeRecipientAllowed} from './native-fcm-policy.mjs';
import {createHash} from 'node:crypto';
import {prisma} from './prisma.js';
import {mobileChatStores,chatEnabled} from './chat-mobile.mjs';
import {authorizeChatOperator} from './chat-operator-auth.mjs';
import {assertCustomerDemoOutboundAllowed} from './customer-demo-runtime.js';
import {createNativeFcmProvider,nativeToken} from './native-fcm-provider.mjs';
const provider=createNativeFcmProvider();
export const nativeBinding=token=>createHash('sha256').update(token).digest('hex');
let schema;
export function ensureNativeChatPushSchema(){
 if(!schema)schema=prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "StoreChatNativePush" ("tokenHash" TEXT PRIMARY KEY,"token" TEXT NOT NULL,"userId" TEXT NOT NULL,"sessionId" TEXT NOT NULL,"binding" TEXT NOT NULL,"identityJson" JSONB NOT NULL,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())').catch(e=>{schema=undefined;throw e});
 return schema;
}
export async function nativeStores(user,storeId){
 if(user.tokenType==='STORE_OPERATOR'){
  if(!user.chatSessionId||!storeId||storeId!==user.storeId)throw Object.assign(new Error('Μη έγκυρη σύνδεση Chat.'),{status:403});
  const store=await prisma.store.findUnique({where:{id:storeId},select:{id:true,companyId:true,active:true,company:{select:{active:true}}}});
  if(!store?.active||!store.company.active||store.companyId!==user.companyId||!await chatEnabled(store))throw Object.assign(new Error('Το Chat δεν είναι διαθέσιμο.'),{status:403});
  return [store];
 }
 return (await mobileChatStores(user)).stores;
}
export async function registerNativePush(user,token,bearer,storeId,notificationVersion){
 if(!provider.configured())throw Object.assign(new Error('Οι ειδοποιήσεις εφαρμογής δεν έχουν ρυθμιστεί ακόμη.'),{status:503,code:'NATIVE_PUSH_NOT_CONFIGURED'});
 nativeToken(token);const stores=await nativeStores(user,storeId);
 if(!stores.length||!(user.chatSessionId||user.sessionId))throw Object.assign(new Error('Συνδέσου ξανά για ειδοποιήσεις.'),{status:403});
 for(const s of stores)assertCustomerDemoOutboundAllowed({companyId:s.companyId,storeId:s.id});
 const identity={notificationVersion:notificationVersion===2?2:1,id:user.id,employeeId:user.employeeId,companyId:user.companyId,storeId:user.storeId,role:user.role,platformRole:user.platformRole||user.role,tokenType:user.tokenType,sessionVersion:user.sessionVersion,chatSessionId:user.chatSessionId,credentialStamp:user.chatCredentialStamp,supportContext:Boolean(user.supportContext)};
 const hash=nativeBinding(token),binding=nativeBinding(bearer),sessionId=user.chatSessionId||user.sessionId;
 await ensureNativeChatPushSchema();await prisma.$transaction(async tx=>{
  await tx.$queryRawUnsafe('SELECT (pg_advisory_xact_lock(hashtext($1)) IS NULL) AS locked',hash);
  await tx.$executeRawUnsafe('INSERT INTO "StoreChatNativePush" ("tokenHash","token","userId","sessionId","binding","identityJson") VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT ("tokenHash") DO UPDATE SET "token"=EXCLUDED."token","userId"=EXCLUDED."userId","sessionId"=EXCLUDED."sessionId","binding"=EXCLUDED."binding","identityJson"=EXCLUDED."identityJson","updatedAt"=NOW()',hash,token,user.id,sessionId,binding,JSON.stringify(identity));
 });return {ok:true,stores:stores.length,binding};
}
export async function revokeNativePush(user,token){
 nativeToken(token);if(!provider.configured())return {ok:true};
 await ensureNativeChatPushSchema();
 await prisma.$executeRawUnsafe('DELETE FROM "StoreChatNativePush" WHERE "tokenHash"=$1 AND "userId"=$2 AND "sessionId"=$3',nativeBinding(token),user.id,user.chatSessionId||user.sessionId||'');
 return {ok:true};
}
export async function sendNativeChatPush({store,senderId}){
 if(!provider.configured())return {attempted:0,delivered:0};
 assertCustomerDemoOutboundAllowed({companyId:store.companyId,storeId:store.id});await ensureNativeChatPushSchema();
 const rows=await prisma.$queryRawUnsafe(`SELECT * FROM "StoreChatNativePush" WHERE "userId"<>$1 AND "updatedAt">NOW()-INTERVAL '30 days' ORDER BY "updatedAt" DESC LIMIT 2000`,senderId);
 let attempted=0,delivered=0;
 // Revalidate immediately before each send; never trust stored store lists or role claims.
 for(const row of rows){try{
  if(!await nativeRecipientAllowed(row,store,{db:prisma,storesFor:mobileChatStores,enabled:chatEnabled,authorize:authorizeChatOperator}))continue;
  attempted++;const result=await provider.send({token:row.token,binding:row.binding,storeId:store.id,companyId:store.companyId,...(row.identityJson?.notificationVersion===2?{storeName:store.name}:{})});
  if(result.delivered)delivered++;
  if(result.unregistered)await prisma.$executeRawUnsafe('DELETE FROM "StoreChatNativePush" WHERE "tokenHash"=$1 AND "binding"=$2',row.tokenHash,row.binding);
 }catch{/* Fail closed without logging credentials, recipients or private data. */}}
 return {attempted,delivered};
}
export function nativePushStatus(){return {configured:provider.configured()};}
