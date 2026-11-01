import {createHash} from 'node:crypto';
import {z} from 'zod';
import {lifecycleContext} from './store-lifecycle-context.js';
import {lockAutomaticReportBoundary} from './automatic-report-lock-boundary.js';
import {dispatchSchemaReady,readLockedDispatchAuthorization} from './automatic-report-dispatch-policy.js';
import {reportRecipientAuthority} from './automatic-report-administrator-authorization.js';
import {walletError} from './ai-owner-wallet-contract.js';

export const postpaidRecipientMarker='wallet-postpaid:';
export const postpaidHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const postpaidGeneration=storeId=>lifecycleContext()[storeId];

// The lifecycle/Store/report locks precede the company wallet lock everywhere.
// This reader never provisions schemas or changes report approvals.
export async function lockPostpaidStore(tx,{companyId,storeId,generation}){
 const [scoped]=await tx.$queryRaw`SELECT s."id" FROM "Store" s JOIN "Company" c ON c."id"=s."companyId" WHERE s."id"=${storeId} AND s."companyId"=${companyId} AND s."active"=TRUE AND c."active"=TRUE`;
 if(!scoped)throw walletError('AI_WALLET_SCOPE_DENIED',404);
 if(!await dispatchSchemaReady(tx))throw walletError('AI_WALLET_POSTPAID_RECIPIENTS_UNAVAILABLE');
 const state=await lockAutomaticReportBoundary(tx,{companyId,storeId,...(generation===undefined?{}:{expectedGeneration:generation})});
 const [store]=await tx.$queryRaw`SELECT s."id",s."name",s."companyId" FROM "Store" s JOIN "Company" c ON c."id"=s."companyId" WHERE s."id"=${storeId} AND s."companyId"=${companyId} AND s."active"=TRUE AND c."active"=TRUE FOR SHARE OF s,c NOWAIT`;
 if(!store)throw walletError('AI_WALLET_SCOPE_DENIED',404);
 return {store,generation:state.generation};
}
export async function lockPostpaidActor(tx,actorId,session){
 const [actor]=await tx.$queryRaw`SELECT "id","role","sessionVersion","mustChangePassword" FROM "User" WHERE "id"=${actorId} FOR SHARE NOWAIT`;
 if(actor?.role!=='SUPER_ADMIN'||actor.mustChangePassword!==false||!Number.isSafeInteger(session?.sessionVersion)||actor.sessionVersion!==session.sessionVersion)throw walletError('AI_WALLET_ROLE_DENIED',403);
 if(session.establishedAuthority!==true){
  if(typeof session.sessionId!=='string'||!session.sessionId)throw walletError('AI_WALLET_SESSION_REQUIRED',401);
  const [current]=await tx.$queryRaw`SELECT "id" FROM "UserSession" WHERE "id"=${session.sessionId} AND "userId"=${actorId} AND "revokedAt" IS NULL AND "expiresAt">NOW() FOR SHARE NOWAIT`;
  if(!current)throw walletError('AI_WALLET_SESSION_REQUIRED',401);
 }
 return actor;
}
export async function readPostpaidRecipients(tx,{companyId,storeId,generation}){
 const records=await readLockedDispatchAuthorization(tx,{companyId,storeId});
 const grant=records.grant;
 const [principal]=grant?await tx.$queryRaw`SELECT "id","role","sessionVersion","mustChangePassword" FROM "User" WHERE "id"=${grant.principalId} FOR SHARE NOWAIT`:[];
 const current=grant?.active===true&&!grant.revokedAt&&String(grant.lifecycleGeneration)===String(generation)&&principal?.role==='SUPER_ADMIN'&&principal.mustChangePassword===false&&String(principal.sessionVersion)===String(grant.principalSessionVersion);
 const recipients=current?records.recipients.flatMap(({recipient:r,consent:c})=>{
  const authority=reportRecipientAuthority(r,c,{generation,principalId:principal.id});
  if(!authority||!z.string().email().max(254).safeParse(r.email).success||/[\r\n,;]/.test(r.email))return [];
  return [{recipientId:r.recipientId,email:r.email,recipientVersion:String(r.version),authorizationRevision:String(c.revision),proofHash:c.proofHash,basis:authority.basis}];
 }):[];
 const fingerprint=postpaidHash(['MWS_AI_POSTPAID_RECIPIENTS_V1',companyId,storeId,String(generation),grant?String(grant.revision):null,principal?.id||null,principal?.sessionVersion??null,recipients]);
 return {fingerprint,recipients};
}
export function publicPostpaidRecipients({store,generation},source){
 return {storeId:store.id,storeName:store.name,generation:String(generation),fingerprint:source.fingerprint,recipients:source.recipients.map(r=>({recipientId:r.recipientId,email:r.email}))};
}
