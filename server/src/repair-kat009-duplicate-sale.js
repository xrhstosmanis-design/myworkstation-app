import crypto from "crypto";
import {prisma} from "./prisma.js";

async function repair(){
  const tables=await prisma.$queryRawUnsafe(`SELECT to_regclass('"OnlineOrder"') AS orders,to_regclass('"StoreTransaction"') AS tx,to_regclass('"StoreOperatorAudit"') AS audit,to_regclass('"Sale"') AS sale,to_regclass('"Payment"') AS payment`);
  if(!tables?.[0]?.orders||!tables?.[0]?.tx||!tables?.[0]?.audit||!tables?.[0]?.sale||!tables?.[0]?.payment)return;

  const order=(await prisma.$queryRawUnsafe(`SELECT "id","companyId","storeId","orderNumber","saleId","status","total" FROM "OnlineOrder" WHERE "orderNumber"='KAT-009' ORDER BY "createdAt" DESC LIMIT 1`))[0];
  if(!order)return;

  const transactions=await prisma.$queryRawUnsafe(`
    SELECT "id","companyId","storeId","sessionId","type","amount","description","actorId","actorName","createdAt"
    FROM "StoreTransaction"
    WHERE "companyId"=$1 AND "storeId"=$2
      AND "description" ILIKE '%ONLINE ΠΑΡΑΓΓΕΛΙΑ KAT-009%'
      AND "type" IN ('SALE_CASH','SALE_CARD')
    ORDER BY "createdAt" ASC,"id" ASC
  `,order.companyId,order.storeId);
  if(transactions.length<2)return;

  const matched=[];
  for(const tx of transactions){
    const audits=await prisma.$queryRawUnsafe(`
      SELECT a."id",a."createdAt",a."details",a."details"->>'saleId' AS "saleId"
      FROM "StoreOperatorAudit" a
      WHERE a."companyId"=$1 AND a."storeId"=$2 AND a."eventType"='POS_SALE_COMPLETED'
        AND a."details"->>'saleId' IS NOT NULL
        AND ABS(EXTRACT(EPOCH FROM (a."createdAt"-$3::timestamptz)))<=30
      ORDER BY ABS(EXTRACT(EPOCH FROM (a."createdAt"-$3::timestamptz))) ASC
      LIMIT 1
    `,order.companyId,order.storeId,tx.createdAt);
    const audit=audits[0];
    if(audit?.saleId)matched.push({tx,audit,saleId:String(audit.saleId)});
  }
  const unique=[];const seen=new Set();for(const row of matched){if(!seen.has(row.saleId)){seen.add(row.saleId);unique.push(row)}}
  if(unique.length<2)return;

  const canonical=unique[0];
  const canonicalSale=(await prisma.$queryRawUnsafe(`SELECT "id","total","status" FROM "Sale" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3 LIMIT 1`,canonical.saleId,order.companyId,order.storeId))[0];
  if(!canonicalSale)return;
  if(Math.abs(Number(canonicalSale.total||0)-Number(order.total||0))>0.011)return;

  await prisma.$transaction(async tx=>{
    await tx.$executeRawUnsafe(`UPDATE "OnlineOrder" SET "saleId"=$1,"updatedAt"=NOW() WHERE "id"=$2`,canonical.saleId,order.id);
    for(const duplicate of unique.slice(1)){
      const sale=(await tx.$queryRawUnsafe(`SELECT "id","total","status" FROM "Sale" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3 LIMIT 1`,duplicate.saleId,order.companyId,order.storeId))[0];
      if(!sale||Math.abs(Number(sale.total||0)-Number(order.total||0))>0.011)continue;
      await tx.$executeRawUnsafe(`DELETE FROM "Payment" WHERE "saleId"=$1`,duplicate.saleId);
      await tx.$executeRawUnsafe(`UPDATE "Sale" SET "status"='CANCELLED' WHERE "id"=$1`,duplicate.saleId);
      await tx.$executeRawUnsafe(`DELETE FROM "StoreTransaction" WHERE "id"=$1`,duplicate.tx.id);
      await tx.$executeRawUnsafe(`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES ($1,$2,$3,NULL,$4,'ONLINE_DUPLICATE_SALE_REPAIRED',jsonb_build_object('orderNumber','KAT-009','canonicalSaleId',$5,'duplicateSaleId',$6,'removedStoreTransactionId',$7,'stockChanged',false))`,crypto.randomUUID(),order.companyId,order.storeId,String(duplicate.tx.actorId||"SYSTEM"),canonical.saleId,duplicate.saleId,duplicate.tx.id);
    }
  });
  console.log(`KAT-009 duplicate repair completed. Canonical sale: ${canonical.saleId}`);
}

try{await repair()}catch(error){console.warn("KAT-009 duplicate repair skipped:",error?.message||error)}finally{await prisma.$disconnect()}
