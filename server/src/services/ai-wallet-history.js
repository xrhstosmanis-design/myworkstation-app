import {walletError} from './ai-owner-wallet-contract.js';
const invalid=()=>{throw walletError('AI_WALLET_INVALID_INPUT',400)};
const validScope=v=>typeof v==='string'&&v.length>0&&v.length<=160&&v.trim()===v;
export function historyCursor(scope,raw){
  if(!validScope(scope.companyId)||(scope.storeId!==null&&!validScope(scope.storeId)))invalid();
  if(raw===null)return null;
  if(typeof raw!=='string'||!raw.length||raw.length>4096||!/^[A-Za-z0-9_-]+$/.test(raw))invalid();
  let value;try{const bytes=Buffer.from(raw,'base64url');if(bytes.toString('base64url')!==raw)invalid();value=JSON.parse(bytes.toString('utf8'));}catch{invalid()}
  if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!=='companyId,createdAt,id,storeId,v'||value.v!==1||value.companyId!==scope.companyId||value.storeId!==scope.storeId||typeof value.id!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(value.id)||typeof value.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value.createdAt))invalid();
  const seconds=value.createdAt.slice(0,19);const date=new Date(seconds+'.000Z');
  if(!Number.isFinite(date.getTime())||date.getUTCFullYear()<1||date.toISOString().slice(0,19)!==seconds)invalid();
  return value;
}
export async function readWalletHistoryPage(db,companyId,storeId=null,cursor=null){
  const scope={companyId,storeId},after=historyCursor(scope,cursor);
  const rows=await db.$queryRaw`SELECT "id","storeId","kind","status","creditedMicros","chargedMicros","reservedMicros","feature",(SELECT s."name" FROM "Store" s WHERE s."id"=e."storeId" AND s."companyId"=e."companyId") AS "storeName","usage"->'customerCharge' AS "customerCharge","usage"->'postpaid' AS "postpaid","usage"->'commercialWaiver' AS "commercialWaiver","tariff"->'activity' AS "activity","tariff"->>'model' AS "model","usage"->>'inputTokens' AS "inputTokens","usage"->>'outputTokens' AS "outputTokens","usage"->>'cachedInputTokens' AS "cachedInputTokens","usage"->>'pages' AS "pages",("resolutionReference" IS NOT NULL) AS "manuallyResolved",(SELECT jsonb_build_object('id',u."id",'name',u."fullName") FROM "User" u WHERE u."id"=e."actorId" AND (u."companyId"=e."companyId" OR u."role"::text='SUPER_ADMIN' OR EXISTS (SELECT 1 FROM "OwnerCompanyAccess" a WHERE a."ownerId"=u."id" AND a."companyId"=e."companyId"))) AS "actionUser","createdAt","settledAt",to_char(e."createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorCreatedAt"
    FROM "AiOwnerWalletEntry" e WHERE e."companyId"=${companyId}
    AND (${storeId}::text IS NULL OR e."storeId"=${storeId} OR e."kind"='CREDIT')
    AND (${after?.createdAt??null}::timestamptz IS NULL OR (e."createdAt",e."id")<(${after?.createdAt??null}::timestamptz,${after?.id??null}::text))
    ORDER BY e."createdAt" DESC,e."id" DESC LIMIT 101`;
  const page=rows.slice(0,100),last=page.at(-1);
  const nextCursor=rows.length>100?Buffer.from(JSON.stringify({v:1,...scope,createdAt:last.cursorCreatedAt,id:last.id})).toString('base64url'):null;
  return {entries:page.map(({cursorCreatedAt,...entry})=>entry),nextCursor};
}

