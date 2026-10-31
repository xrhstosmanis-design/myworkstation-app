import {sanitizeWalletReviewEvidence} from './ai-owner-wallet-review-evidence.js';
import {publicWalletActivity,reservationWalletActivity} from './ai-wallet-activity.js';
import {assertAiWalletCatalogue,createAiWalletSchema,validateAiWalletSchema} from './ai-owner-wallet-schema.js';
import {bindFreshLifecycleRead} from './store-lifecycle-generation.js';
import {randomUUID} from 'node:crypto';
import {MAX_WALLET_MICROS,positiveMicros,walletError,walletView} from './ai-owner-wallet-contract.js';
import {readWalletUsageSummary} from './ai-owner-wallet-usage.js';
import {DEFAULT_CUSTOMER_PRICING,parseCustomerPricing,customerCharge,pricingSnapshot,chargeFromSnapshot,stableWalletJson,publicCustomerCharge} from './ai-wallet-customer-pricing.js';

async function customerPricing(db,companyId){
  const rows=await db.$queryRaw`SELECT "detail" FROM "AiOwnerWalletAudit" WHERE "companyId"=${companyId} AND "event"='PRICING_CONFIGURED' ORDER BY ("detail"->>'version')::bigint DESC LIMIT 1`;
  if(!rows.length)return {version:0,...DEFAULT_CUSTOMER_PRICING};
  const detail=rows[0].detail;
  if(!Number.isSafeInteger(detail?.version)||detail.version<1)throw walletError('AI_WALLET_PRICING_INVALID');
  return {version:detail.version,...parseCustomerPricing(detail.policy)};
}

async function invoicePolicy(db,companyId,fallback){
  if(typeof fallback!=='boolean')throw walletError('AI_WALLET_INVALID_INPUT',400);
  // Wallet versions, unlike transaction timestamps, retain lock order even
  // when a waiting transaction started before the previous writer.
  const rows=await db.$queryRaw`SELECT "detail" FROM "AiOwnerWalletAudit" WHERE "companyId"=${companyId} AND "event"='CONFIGURED' AND "detail" ? 'invoiceEnabled' ORDER BY ("detail"->>'version')::bigint DESC LIMIT 1`;
  if(!rows.length)return fallback;
  const detail=rows[0].detail;
  if(typeof detail?.invoiceEnabled!=='boolean'||!Number.isSafeInteger(detail.version)||detail.version<0)throw walletError('AI_WALLET_INVOICE_CONFIG_INVALID',409);
  return detail.invoiceEnabled;
}

// Dedicated tables only. No initialization at import/startup; the runtime gate
// must be explicitly enabled before routes/provider adapters use this repository.
export function createAiOwnerWalletRepository(db){
  let ready;
  async function ensure(){
    if(!ready)ready=db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('AI_OWNER_WALLET_SCHEMA_V1'))`;
      assertAiWalletCatalogue();
      await createAiWalletSchema(tx);
      await validateAiWalletSchema(tx);
    }).catch(e=>{ready=null;throw e});
    await ready;
  }
  async function lock(tx,companyId){
    // One company row lock serializes topups, all-store reservations, settlement
    // and configuration. Global receipt uniqueness also prevents cross-wallet reuse.
    await tx.$executeRaw`INSERT INTO "AiOwnerWallet" ("companyId","cycleId") VALUES (${companyId},${randomUUID()}) ON CONFLICT ("companyId") DO NOTHING`;
    return (await tx.$queryRaw`SELECT * FROM "AiOwnerWallet" WHERE "companyId"=${companyId} FOR UPDATE`)[0];
  }
  async function notice(tx,row,kind,amount=0n){
    const owner=row.emailEnabled&&row.notificationOwnerId?(await tx.$queryRaw`SELECT u."id",u."email" FROM "User" u JOIN "Company" c ON c."id"=${row.companyId} AND c."active"=TRUE WHERE u."id"=${row.notificationOwnerId} AND (u."companyId"=c."id" OR EXISTS (SELECT 1 FROM "OwnerCompanyAccess" a WHERE a."ownerId"=u."id" AND a."companyId"=c."id")) AND u."role"::text='OWNER' AND u."mustChangePassword"=FALSE`)[0]:null;
    await tx.$executeRaw`INSERT INTO "AiOwnerWalletNotice" ("id","companyId","kind","cycleId","balanceMicros","amountMicros","ownerId","email","emailStatus") VALUES (${randomUUID()},${row.companyId},${kind},${row.cycleId},${row.balanceMicros},${amount},${owner?.id||null},${owner?.email||null},${owner?.email?'PENDING':'DISABLED'}) ON CONFLICT ("companyId","kind","cycleId") DO NOTHING`;
  }
  async function read(companyId,storeId=null){
    await ensure();
    const row=(await db.$queryRaw`SELECT * FROM "AiOwnerWallet" WHERE "companyId"=${companyId}`)[0];
    const wallet=row?walletView(row):{companyId,currency:'EUR',enabled:false,emailEnabled:false,notificationOwnerId:'',balanceMicros:'0',reservedMicros:'0',availableMicros:'0',lastCreditMicros:'0',version:0,state:'EMPTY'};
    const entries=storeId?await db.$queryRaw`SELECT "id","storeId","kind","status","creditedMicros","chargedMicros","reservedMicros","feature",(SELECT s."name" FROM "Store" s WHERE s."id"=e."storeId" AND s."companyId"=e."companyId") AS "storeName","usage"->'customerCharge' AS "customerCharge","tariff"->'activity' AS "activity","tariff"->>'model' AS "model","usage"->>'inputTokens' AS "inputTokens","usage"->>'outputTokens' AS "outputTokens","usage"->>'cachedInputTokens' AS "cachedInputTokens","usage"->>'pages' AS "pages",("resolutionReference" IS NOT NULL) AS "manuallyResolved",(SELECT jsonb_build_object('id',u."id",'name',u."fullName") FROM "User" u WHERE u."id"=e."actorId" AND (u."companyId"=e."companyId" OR u."role"::text='SUPER_ADMIN' OR EXISTS (SELECT 1 FROM "OwnerCompanyAccess" a WHERE a."ownerId"=u."id" AND a."companyId"=e."companyId"))) AS "actionUser","createdAt","settledAt" FROM "AiOwnerWalletEntry" e WHERE "companyId"=${companyId} AND ("storeId"=${storeId} OR "kind"='CREDIT') ORDER BY "createdAt" DESC,"id" DESC LIMIT 100`:await db.$queryRaw`SELECT "id","storeId","kind","status","creditedMicros","chargedMicros","reservedMicros","feature",(SELECT s."name" FROM "Store" s WHERE s."id"=e."storeId" AND s."companyId"=e."companyId") AS "storeName","usage"->'customerCharge' AS "customerCharge","tariff"->'activity' AS "activity","tariff"->>'model' AS "model","usage"->>'inputTokens' AS "inputTokens","usage"->>'outputTokens' AS "outputTokens","usage"->>'cachedInputTokens' AS "cachedInputTokens","usage"->>'pages' AS "pages",("resolutionReference" IS NOT NULL) AS "manuallyResolved",(SELECT jsonb_build_object('id',u."id",'name',u."fullName") FROM "User" u WHERE u."id"=e."actorId" AND (u."companyId"=e."companyId" OR u."role"::text='SUPER_ADMIN' OR EXISTS (SELECT 1 FROM "OwnerCompanyAccess" a WHERE a."ownerId"=u."id" AND a."companyId"=e."companyId"))) AS "actionUser","createdAt","settledAt" FROM "AiOwnerWalletEntry" e WHERE "companyId"=${companyId} ORDER BY "createdAt" DESC,"id" DESC LIMIT 100`;
    const notices=await db.$queryRaw`SELECT "id","kind","balanceMicros","amountMicros","emailStatus","createdAt" FROM "AiOwnerWalletNotice" WHERE "companyId"=${companyId} ORDER BY "createdAt" DESC,"id" DESC LIMIT 30`;
    const usage=storeId?await db.$queryRaw`SELECT "storeId",SUM("chargedMicros")::text AS "chargedMicros",COUNT(*)::int AS "requests" FROM "AiOwnerWalletEntry" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "status"='SETTLED' GROUP BY "storeId"`:await db.$queryRaw`SELECT "storeId",SUM("chargedMicros")::text AS "chargedMicros",COUNT(*)::int AS "requests" FROM "AiOwnerWalletEntry" WHERE "companyId"=${companyId} AND "status"='SETTLED' GROUP BY "storeId"`;
    const json=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v));
    const usageSummary=await readWalletUsageSummary(db,companyId,storeId);
    return {...wallet,customerPricing:await customerPricing(db,companyId),entries:json(entries.map(e=>({...e,customerCharge:publicCustomerCharge(e.customerCharge),activity:publicWalletActivity(e.activity,{companyId,storeId:e.storeId})}))),notices:json(notices),usage,usageSummary:json(usageSummary),usageScope:storeId?'SELECTED_STORE':'COMPANY',storeId};
  }
  async function configurePricing(companyId,{version,policy},actorId){
    const parsed=parseCustomerPricing(policy);
    await ensure();return db.$transaction(async tx=>{
      const row=await lock(tx,companyId);
      if(row.version!==version)throw walletError('AI_WALLET_CHANGED');
      const detail={version:row.version+1,policy:parsed,invoiceFeeScope:'FIRST_ASSISTANT_DOCUMENT'};
      await tx.$executeRaw`INSERT INTO "AiOwnerWalletAudit" ("id","companyId","actorId","event","detail") VALUES (${randomUUID()},${companyId},${actorId},'PRICING_CONFIGURED',${JSON.stringify(detail)}::jsonb)`;
      await tx.$executeRaw`UPDATE "AiOwnerWallet" SET "version"="version"+1,"updatedAt"=NOW() WHERE "companyId"=${companyId}`;
      return {version:row.version+1};
    });
  }
  async function configure(companyId,input,actorId){
    if(Object.hasOwn(input,'invoiceEnabled')&&typeof input.invoiceEnabled!=='boolean')throw walletError('AI_WALLET_INVALID_INPUT',400);
    await ensure();return db.$transaction(async tx=>{
      const row=await lock(tx,companyId);
      if(row.version!==input.version)throw walletError('AI_WALLET_CHANGED');
      if(input.emailEnabled){
        const owner=await tx.$queryRaw`SELECT u."id" FROM "User" u JOIN "Company" c ON c."id"=${companyId} AND c."active"=TRUE WHERE u."id"=${input.notificationOwnerId} AND (u."companyId"=c."id" OR EXISTS (SELECT 1 FROM "OwnerCompanyAccess" a WHERE a."ownerId"=u."id" AND a."companyId"=c."id")) AND u."role"::text='OWNER' AND u."mustChangePassword"=FALSE`;
        if(!owner.length)throw walletError('AI_WALLET_OWNER_REQUIRED',400);
      }
      await tx.$executeRaw`UPDATE "AiOwnerWallet" SET "enabled"=${input.enabled},"emailEnabled"=${input.emailEnabled},"notificationOwnerId"=${input.notificationOwnerId||null},"version"="version"+1,"updatedAt"=NOW() WHERE "companyId"=${companyId}`;
      // Revoking email configuration invalidates every unsent notice. Never
      // retarget old notices to a newly selected owner/address.
      if(!input.emailEnabled||row.notificationOwnerId!==input.notificationOwnerId)await tx.$executeRaw`UPDATE "AiOwnerWalletNotice" SET "emailStatus"='REVOKED' WHERE "companyId"=${companyId} AND "emailStatus"='PENDING'`;
      await tx.$executeRaw`INSERT INTO "AiOwnerWalletAudit" ("id","companyId","actorId","event","detail") VALUES (${randomUUID()},${companyId},${actorId},'CONFIGURED',${JSON.stringify(input)}::jsonb)`;
      return {version:row.version+1};
    });
  }
  async function credit(companyId,{amountMicros,receiptReference},actorId){
    receiptReference=receiptReference.trim().normalize('NFC').toUpperCase();
    if(receiptReference.startsWith('TRIAL/'))throw walletError('AI_WALLET_RESERVED_REFERENCE',400);
    const amount=positiveMicros(amountMicros);await ensure();
    return db.$transaction(async tx=>{
      const row=await lock(tx,companyId);
      const existing=(await tx.$queryRaw`SELECT * FROM "AiOwnerWalletEntry" WHERE "kind"='CREDIT' AND "reference"=${receiptReference}`)[0];
      if(existing){if(existing.companyId!==companyId||BigInt(existing.creditedMicros)!==amount)throw walletError('AI_WALLET_RECEIPT_CONFLICT');return {id:existing.id,replayed:true}}
      if(BigInt(row.balanceMicros)+amount>MAX_WALLET_MICROS)throw walletError('AI_WALLET_LIMIT',400);
      const id=randomUUID(),cycleId=randomUUID();
      await tx.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","kind","reference","status","creditedMicros","actorId") VALUES (${id},${companyId},'CREDIT',${receiptReference},'CREDITED',${amount},${actorId})`;
      await tx.$executeRaw`UPDATE "AiOwnerWallet" SET "balanceMicros"="balanceMicros"+${amount},"lastCreditMicros"=${amount},"cycleId"=${cycleId},"version"="version"+1,"updatedAt"=NOW() WHERE "companyId"=${companyId}`;
      await notice(tx,{...row,balanceMicros:BigInt(row.balanceMicros)+amount,cycleId},'CREDIT',amount);
      return {id,replayed:false};
    }).catch(e=>{if(e.code==='P2002'||e.meta?.code==='23505')throw walletError('AI_WALLET_RECEIPT_CONFLICT');throw e});
  }
  async function grantTrial(companyId,{amountMicros,grantReference,reason},actorId){
    const reference='TRIAL/'+grantReference.trim().normalize('NFC').toUpperCase();
    reason=reason.trim().normalize('NFC');
    const amount=positiveMicros(amountMicros);await ensure();
    return db.$transaction(async tx=>{
      const row=await lock(tx,companyId);
      const existing=(await tx.$queryRaw`SELECT * FROM "AiOwnerWalletEntry" WHERE "kind"='CREDIT' AND "reference"=${reference}`)[0];
      if(existing){
        if(existing.companyId!==companyId||existing.feature!=='TRIAL_GRANT'||BigInt(existing.creditedMicros)!==amount||existing.usage?.reason!==reason)throw walletError('AI_WALLET_TRIAL_CONFLICT');
        return {id:existing.id,replayed:true};
      }
      if(BigInt(row.balanceMicros)+amount>MAX_WALLET_MICROS)throw walletError('AI_WALLET_LIMIT',400);
      const id=randomUUID(),cycleId=randomUUID(),detail={fundingType:'TRIAL_GRANT',reason,grantReference:reference,amountMicros:String(amount)};
      await tx.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","kind","reference","status","creditedMicros","feature","usage","actorId") VALUES (${id},${companyId},'CREDIT',${reference},'CREDITED',${amount},'TRIAL_GRANT',${JSON.stringify(detail)}::jsonb,${actorId})`;
      await tx.$executeRaw`UPDATE "AiOwnerWallet" SET "balanceMicros"="balanceMicros"+${amount},"lastCreditMicros"=${amount},"cycleId"=${cycleId},"version"="version"+1,"updatedAt"=NOW() WHERE "companyId"=${companyId}`;
      await tx.$executeRaw`INSERT INTO "AiOwnerWalletAudit" ("id","companyId","actorId","event","detail") VALUES (${randomUUID()},${companyId},${actorId},'TRIAL_GRANTED',${JSON.stringify({id,...detail})}::jsonb)`;
      await notice(tx,{...row,balanceMicros:BigInt(row.balanceMicros)+amount,cycleId},'CREDIT',amount);
      return {id,replayed:false};
    }).catch(e=>{if(e.code==='P2002'||e.meta?.code==='23505')throw walletError('AI_WALLET_TRIAL_CONFLICT');throw e});
  }
  async function reserve({companyId,storeId,feature,tariff,amountMicros,reference,invoicePolicyFallback=true,invoiceDocumentId=null,activity}){
    const activitySnapshot=reservationWalletActivity(activity,{companyId,storeId});
    const baseAmount=positiveMicros(String(amountMicros));await ensure();
    return db.$transaction(async tx=>{
      const row=await lock(tx,companyId);
      if(!row.enabled)return null;
      // Recheck under the same lock as configuration. A disable which wins
      // this lock must prevent a late request from reserving a new charge.
      if(['INVOICE_OPENAI','INVOICE_AZURE'].includes(feature)&&!await invoicePolicy(tx,companyId,invoicePolicyFallback))return null;
      await bindFreshLifecycleRead(tx,{companyId,storeId});
      const store=await tx.$queryRaw`SELECT s."id" FROM "Store" s JOIN "Company" c ON c."id"=s."companyId" WHERE s."id"=${storeId} AND s."companyId"=${companyId} AND s."active"=TRUE AND c."active"=TRUE`;
      if(!store.length)throw walletError('AI_WALLET_SCOPE_DENIED',403);
      if((await tx.$queryRaw`SELECT "id" FROM "AiOwnerWalletEntry" WHERE "kind"='USAGE' AND "reference"=${reference}`).length)throw walletError('AI_WALLET_REQUEST_REPLAY');
      const {version:policyVersion,...policy}=await customerPricing(tx,companyId);
      let invoiceFeeClaimed=false;
      if(invoiceDocumentId!==null){
        if(feature!=='INVOICE_OPENAI'||typeof invoiceDocumentId!=='string'||!invoiceDocumentId.trim()||invoiceDocumentId.length>160)throw walletError('AI_WALLET_SCOPE_DENIED',403);
        const documents=await tx.$queryRaw`SELECT d."id" FROM "PurchaseDocument" d WHERE d."id"=${invoiceDocumentId} AND d."companyId"=${companyId} AND d."storeId"=${storeId} AND d."status"='DRAFT' AND d."sourceType"='POS_OCR_DRAFT' AND EXISTS (SELECT 1 FROM "PurchaseOrder" o WHERE o."sourceDocumentId"=d."id" AND o."companyId"=d."companyId" AND o."status"='NEW' AND o."sourceType"='POS_OCR_DRAFT') LIMIT 1`;
        if(!documents.length)throw walletError('AI_WALLET_SCOPE_DENIED',403);
        if(BigInt(policy.invoiceFeeMicros)>0n){
          const claimed=await tx.$queryRaw`SELECT "id" FROM "AiOwnerWalletEntry" WHERE "companyId"=${companyId} AND "kind"='USAGE' AND "tariff"->'customerPricing'->>'invoiceDocumentId'=${invoiceDocumentId} AND "tariff"->'customerPricing'->>'invoiceFeeClaimed'='true' LIMIT 1`;
          invoiceFeeClaimed=claimed.length===0;
        }
      }
      const snapshot=pricingSnapshot(policy,{version:policyVersion,invoiceDocumentId,invoiceFeeClaimed});
      const amount=BigInt(customerCharge(baseAmount,policy,invoiceFeeClaimed).totalMicros);
      if(policyVersion>0)tariff={...tariff,customerPricing:snapshot};
      if(activitySnapshot)tariff={...tariff,activity:activitySnapshot};
      if(BigInt(row.balanceMicros)-BigInt(row.reservedMicros)<amount)throw walletError('AI_WALLET_INSUFFICIENT',402);
      const id=randomUUID();
      await tx.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","storeId","kind","reference","status","reservedMicros","feature","tariff") VALUES (${id},${companyId},${storeId},'USAGE',${reference},'RESERVED',${amount},${feature},${JSON.stringify(tariff)}::jsonb)`;
      await tx.$executeRaw`UPDATE "AiOwnerWallet" SET "reservedMicros"="reservedMicros"+${amount},"version"="version"+1,"updatedAt"=NOW() WHERE "companyId"=${companyId}`;
      return {id,companyId,reservedMicros:String(amount)};
    });
  }
  async function settle(companyId,id,{amountMicros,usage={},actorId=null,resolutionReference=null}){
    let amount=BigInt(amountMicros);if(amount<0n)throw walletError('AI_WALLET_INVALID_AMOUNT',400);
    await ensure();return db.$transaction(async tx=>{
      const row=await lock(tx,companyId),entry=(await tx.$queryRaw`SELECT * FROM "AiOwnerWalletEntry" WHERE "id"=${id} AND "companyId"=${companyId} FOR UPDATE`)[0];
      if(!entry||entry.kind!=='USAGE')throw walletError('AI_WALLET_ENTRY_NOT_FOUND',404);
      // Provider settlement supplies the measured base tariff charge. A manual
      // review supplies an explicitly confirmed FINAL total and is never repriced.
      if(!actorId&&entry.tariff?.customerPricing){
        const customerCharge=chargeFromSnapshot(amount,entry.tariff.customerPricing);
        amount=BigInt(customerCharge.totalMicros);usage={...usage,customerCharge};
      }
      if(entry.status==='SETTLED'){
        if(BigInt(entry.chargedMicros)!==amount||stableWalletJson(entry.usage)!==stableWalletJson(usage))throw walletError('AI_WALLET_SETTLEMENT_CONFLICT');
        return {id,replayed:true};
      }
      await bindFreshLifecycleRead(tx,{companyId,storeId:entry.storeId});
      if(entry.status==='REVIEW'&&!actorId)throw walletError('AI_WALLET_USAGE_REVIEW',503);
      if(amount>BigInt(entry.reservedMicros))throw walletError('AI_WALLET_USAGE_REVIEW',503);
      const abandoned=entry.status==='RESERVED'&&Date.now()-new Date(entry.createdAt).getTime()>=15*60*1000;
      if(actorId&&(!resolutionReference||entry.status!=='REVIEW'&&!abandoned))throw walletError('AI_WALLET_REVIEW_REQUIRED',400);
      await tx.$executeRaw`UPDATE "AiOwnerWalletEntry" SET "status"='SETTLED',"chargedMicros"=${amount},"usage"=${JSON.stringify(usage)}::jsonb,"actorId"=${actorId},"resolutionReference"=${resolutionReference},"settledAt"=NOW() WHERE "id"=${id} AND "companyId"=${companyId}`;
      const balance=BigInt(row.balanceMicros)-amount;
      await tx.$executeRaw`UPDATE "AiOwnerWallet" SET "balanceMicros"=${balance},"reservedMicros"="reservedMicros"-${entry.reservedMicros},"version"="version"+1,"updatedAt"=NOW() WHERE "companyId"=${companyId}`;
      if(balance===0n)await notice(tx,{...row,balanceMicros:balance},'EMPTY');
      else if(balance<=BigInt(row.lastCreditMicros)/5n)await notice(tx,{...row,balanceMicros:balance},'LOW');
      if(actorId)await tx.$executeRaw`INSERT INTO "AiOwnerWalletAudit" ("id","companyId","actorId","event","detail") VALUES (${randomUUID()},${companyId},${actorId},'REVIEW_RESOLVED',${JSON.stringify({id,amountMicros:String(amount),resolutionReference})}::jsonb)`;
      return {id,replayed:false};
    });
  }
  async function review(companyId,id,evidence){await ensure();return db.$transaction(async tx=>{
    await lock(tx,companyId);
    const entry=(await tx.$queryRaw`SELECT "storeId" FROM "AiOwnerWalletEntry" WHERE "id"=${id} AND "companyId"=${companyId} AND "status"='RESERVED' FOR UPDATE`)[0];
    if(!entry)return;
    await bindFreshLifecycleRead(tx,{companyId,storeId:entry.storeId});
    await tx.$executeRaw`UPDATE "AiOwnerWalletEntry" SET "status"='REVIEW' WHERE "id"=${id} AND "companyId"=${companyId} AND "status"='RESERVED'`;
    if(evidence!==undefined)await tx.$executeRaw`INSERT INTO "AiOwnerWalletAudit" ("id","companyId","actorId","event","detail") VALUES (${randomUUID()},${companyId},'SYSTEM_AI_METER','USAGE_REVIEW',${JSON.stringify({id,evidence:sanitizeWalletReviewEvidence(evidence)})}::jsonb)`;
  })}
  async function enabledFor(companyId){await ensure();return (await db.$queryRaw`SELECT "enabled" FROM "AiOwnerWallet" WHERE "companyId"=${companyId}`)[0]?.enabled===true}
  async function invoiceEnabledFor(companyId,fallback){await ensure();return invoicePolicy(db,companyId,fallback)}
  return {ensure,read,configure,configurePricing,credit,grantTrial,reserve,settle,review,enabledFor,invoiceEnabledFor,db};
}


