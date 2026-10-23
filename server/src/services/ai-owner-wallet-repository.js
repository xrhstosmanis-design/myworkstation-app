import {randomUUID} from 'node:crypto';
import {MAX_WALLET_MICROS,positiveMicros,walletError,walletView} from './ai-owner-wallet-contract.js';
import {readWalletUsageSummary} from './ai-owner-wallet-usage.js';

// Dedicated tables only. No initialization at import/startup; the runtime gate
// must be explicitly enabled before routes/provider adapters use this repository.
export function createAiOwnerWalletRepository(db){
  let ready;
  async function ensure(){
    if(!ready)ready=db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('AI_OWNER_WALLET_SCHEMA_V1'))`;
      await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AiOwnerWallet" (
        "companyId" TEXT PRIMARY KEY,"enabled" BOOLEAN NOT NULL DEFAULT FALSE,
        "emailEnabled" BOOLEAN NOT NULL DEFAULT FALSE,"notificationOwnerId" TEXT,
        "balanceMicros" BIGINT NOT NULL DEFAULT 0 CHECK ("balanceMicros">=0 AND "balanceMicros"<=1000000000000),
        "reservedMicros" BIGINT NOT NULL DEFAULT 0 CHECK ("reservedMicros">=0 AND "reservedMicros"<="balanceMicros"),
        "lastCreditMicros" BIGINT NOT NULL DEFAULT 0,"cycleId" TEXT NOT NULL,
        "version" INTEGER NOT NULL DEFAULT 0,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AiOwnerWalletEntry" (
        "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "AiOwnerWallet"("companyId"),"storeId" TEXT,
        "kind" TEXT NOT NULL CHECK ("kind" IN ('CREDIT','USAGE')),"reference" TEXT NOT NULL,
        "status" TEXT NOT NULL CHECK ("status" IN ('CREDITED','RESERVED','SETTLED','REVIEW')),
        "creditedMicros" BIGINT NOT NULL DEFAULT 0,"reservedMicros" BIGINT NOT NULL DEFAULT 0,"chargedMicros" BIGINT NOT NULL DEFAULT 0,
        "feature" TEXT,"tariff" JSONB,"usage" JSONB,"actorId" TEXT,"resolutionReference" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"settledAt" TIMESTAMPTZ,
        UNIQUE("kind","reference"),CHECK ("creditedMicros">=0 AND "reservedMicros">=0 AND "chargedMicros">=0 AND "chargedMicros"<="reservedMicros"))`);
      await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AiOwnerWalletNotice" (
        "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "AiOwnerWallet"("companyId"),
        "kind" TEXT NOT NULL CHECK ("kind" IN ('CREDIT','LOW','EMPTY')),"cycleId" TEXT NOT NULL,
        "balanceMicros" BIGINT NOT NULL,"amountMicros" BIGINT NOT NULL DEFAULT 0,
        "ownerId" TEXT,"email" TEXT,"emailStatus" TEXT NOT NULL DEFAULT 'DISABLED',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"attemptedAt" TIMESTAMPTZ,"messageId" TEXT,
        UNIQUE("companyId","kind","cycleId"))`);
      await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AiOwnerWalletAudit" (
        "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"actorId" TEXT NOT NULL,"event" TEXT NOT NULL,"detail" JSONB NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "AiOwnerWalletEntry_company_created" ON "AiOwnerWalletEntry"("companyId","createdAt")');
      await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "AiOwnerWalletEntry_provider_response" ON "AiOwnerWalletEntry" (("usage"->>'providerResponseId')) WHERE "status"='SETTLED' AND "usage" ? 'providerResponseId'`);
      await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "AiOwnerWalletNotice_pending" ON "AiOwnerWalletNotice"("emailStatus","createdAt")');
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
    const owner=row.emailEnabled&&row.notificationOwnerId?(await tx.$queryRaw`SELECT "id","email" FROM "User" WHERE "id"=${row.notificationOwnerId} AND "companyId"=${row.companyId} AND "role"::text='OWNER' AND "mustChangePassword"=FALSE`)[0]:null;
    await tx.$executeRaw`INSERT INTO "AiOwnerWalletNotice" ("id","companyId","kind","cycleId","balanceMicros","amountMicros","ownerId","email","emailStatus") VALUES (${randomUUID()},${row.companyId},${kind},${row.cycleId},${row.balanceMicros},${amount},${owner?.id||null},${owner?.email||null},${owner?.email?'PENDING':'DISABLED'}) ON CONFLICT ("companyId","kind","cycleId") DO NOTHING`;
  }
  async function read(companyId,storeId=null){
    await ensure();
    const row=(await db.$queryRaw`SELECT * FROM "AiOwnerWallet" WHERE "companyId"=${companyId}`)[0];
    const wallet=row?walletView(row):{companyId,currency:'EUR',enabled:false,emailEnabled:false,notificationOwnerId:'',balanceMicros:'0',reservedMicros:'0',availableMicros:'0',lastCreditMicros:'0',version:0,state:'EMPTY'};
    const entries=storeId?await db.$queryRaw`SELECT "id","storeId","kind","status","creditedMicros","chargedMicros","reservedMicros","feature","createdAt","settledAt" FROM "AiOwnerWalletEntry" WHERE "companyId"=${companyId} AND ("storeId"=${storeId} OR "kind"='CREDIT') ORDER BY "createdAt" DESC,"id" DESC LIMIT 100`:await db.$queryRaw`SELECT "id","storeId","kind","status","creditedMicros","chargedMicros","reservedMicros","feature","createdAt","settledAt" FROM "AiOwnerWalletEntry" WHERE "companyId"=${companyId} ORDER BY "createdAt" DESC,"id" DESC LIMIT 100`;
    const notices=await db.$queryRaw`SELECT "id","kind","balanceMicros","amountMicros","emailStatus","createdAt" FROM "AiOwnerWalletNotice" WHERE "companyId"=${companyId} ORDER BY "createdAt" DESC,"id" DESC LIMIT 30`;
    const usage=storeId?await db.$queryRaw`SELECT "storeId",SUM("chargedMicros")::text AS "chargedMicros",COUNT(*)::int AS "requests" FROM "AiOwnerWalletEntry" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "status"='SETTLED' GROUP BY "storeId"`:await db.$queryRaw`SELECT "storeId",SUM("chargedMicros")::text AS "chargedMicros",COUNT(*)::int AS "requests" FROM "AiOwnerWalletEntry" WHERE "companyId"=${companyId} AND "status"='SETTLED' GROUP BY "storeId"`;
    const json=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v));
    const usageSummary=await readWalletUsageSummary(db,companyId,storeId);
    return {...wallet,entries:json(entries),notices:json(notices),usage,usageSummary:json(usageSummary),usageScope:storeId?'SELECTED_STORE':'COMPANY',storeId};
  }
  async function configure(companyId,input,actorId){
    await ensure();return db.$transaction(async tx=>{
      const row=await lock(tx,companyId);
      if(row.version!==input.version)throw walletError('AI_WALLET_CHANGED');
      if(input.emailEnabled){
        const owner=await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${input.notificationOwnerId} AND "companyId"=${companyId} AND "role"::text='OWNER' AND "mustChangePassword"=FALSE`;
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
  async function reserve({companyId,storeId,feature,tariff,amountMicros,reference}){
    const amount=positiveMicros(String(amountMicros));await ensure();
    return db.$transaction(async tx=>{
      const row=await lock(tx,companyId);
      if(!row.enabled)return null;
      const store=await tx.$queryRaw`SELECT s."id" FROM "Store" s JOIN "Company" c ON c."id"=s."companyId" WHERE s."id"=${storeId} AND s."companyId"=${companyId} AND s."active"=TRUE AND c."active"=TRUE`;
      if(!store.length)throw walletError('AI_WALLET_SCOPE_DENIED',403);
      if((await tx.$queryRaw`SELECT "id" FROM "AiOwnerWalletEntry" WHERE "kind"='USAGE' AND "reference"=${reference}`).length)throw walletError('AI_WALLET_REQUEST_REPLAY');
      if(BigInt(row.balanceMicros)-BigInt(row.reservedMicros)<amount)throw walletError('AI_WALLET_INSUFFICIENT',402);
      const id=randomUUID();
      await tx.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","storeId","kind","reference","status","reservedMicros","feature","tariff") VALUES (${id},${companyId},${storeId},'USAGE',${reference},'RESERVED',${amount},${feature},${JSON.stringify(tariff)}::jsonb)`;
      await tx.$executeRaw`UPDATE "AiOwnerWallet" SET "reservedMicros"="reservedMicros"+${amount},"version"="version"+1,"updatedAt"=NOW() WHERE "companyId"=${companyId}`;
      return {id,companyId,reservedMicros:String(amount)};
    });
  }
  async function settle(companyId,id,{amountMicros,usage={},actorId=null,resolutionReference=null}){
    const amount=BigInt(amountMicros);if(amount<0n)throw walletError('AI_WALLET_INVALID_AMOUNT',400);
    await ensure();return db.$transaction(async tx=>{
      const row=await lock(tx,companyId),entry=(await tx.$queryRaw`SELECT * FROM "AiOwnerWalletEntry" WHERE "id"=${id} AND "companyId"=${companyId} FOR UPDATE`)[0];
      if(!entry||entry.kind!=='USAGE')throw walletError('AI_WALLET_ENTRY_NOT_FOUND',404);
      if(entry.status==='SETTLED'){
        const stable=v=>JSON.stringify(v,Object.keys(v||{}).sort());
        if(BigInt(entry.chargedMicros)!==amount||stable(entry.usage)!==stable(usage))throw walletError('AI_WALLET_SETTLEMENT_CONFLICT');
        return {id,replayed:true};
      }
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
  async function review(companyId,id){await ensure();await db.$executeRaw`UPDATE "AiOwnerWalletEntry" SET "status"='REVIEW' WHERE "id"=${id} AND "companyId"=${companyId} AND "status"='RESERVED'`}
  async function enabledFor(companyId){await ensure();return (await db.$queryRaw`SELECT "enabled" FROM "AiOwnerWallet" WHERE "companyId"=${companyId}`)[0]?.enabled===true}
  return {ensure,read,configure,credit,grantTrial,reserve,settle,review,enabledFor,db};
}
