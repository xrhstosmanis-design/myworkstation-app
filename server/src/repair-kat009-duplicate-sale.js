import crypto from "crypto";
import {prisma} from "./prisma.js";

async function repair(){
  const tables=await prisma.$queryRawUnsafe(`SELECT to_regclass('"OnlineOrder"') AS orders,to_regclass('"StoreTransaction"') AS tx,to_regclass('"StoreOperatorAudit"') AS audit,to_regclass('"Sale"') AS sale,to_regclass('"Payment"') AS payment`);
  if(!tables?.[0]?.orders||!tables?.[0]?.tx)return;

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

  if(transactions.length>1){
    const keepId=transactions[0].id;
    await prisma.$executeRawUnsafe(`
      DELETE FROM "StoreTransaction"
      WHERE "companyId"=$1 AND "storeId"=$2
        AND "description" ILIKE '%ONLINE ΠΑΡΑΓΓΕΛΙΑ KAT-009%'
        AND "type" IN ('SALE_CASH','SALE_CARD')
        AND "id"<>$3
    `,order.companyId,order.storeId,keepId);
    console.log(`KAT-009 shift dedupe completed. Kept transaction: ${keepId}; removed: ${transactions.length-1}`);
  }

  if(!tables?.[0]?.audit||!tables?.[0]?.sale||!tables?.[0]?.payment)return;

  let saleAudits=await prisma.$queryRawUnsafe(`
    SELECT a."id",a."createdAt",a."details",a."details"->>'saleId' AS "saleId"
    FROM "StoreOperatorAudit" a
    WHERE a."companyId"=$1 AND a."storeId"=$2 AND a."eventType"='POS_SALE_COMPLETED'
      AND a."details"->>'saleId' IS NOT NULL
      AND (
        a."details"->>'onlineOrderId'=$3
        OR a."details"->>'onlineOrderNumber'='KAT-009'
        OR a."details"->>'orderNumber'='KAT-009'
      )
    ORDER BY a."createdAt" ASC,a."id" ASC
  `,order.companyId,order.storeId,order.id);

  const uniqueAudits=[];const seen=new Set();
  for(const audit of saleAudits){const saleId=String(audit.saleId||"");if(saleId&&!seen.has(saleId)){seen.add(saleId);uniqueAudits.push({...audit,saleId})}}
  if(uniqueAudits.length<2)return;

  const canonicalAudit=uniqueAudits[0];
  const canonicalSale=(await prisma.$queryRawUnsafe(`SELECT "id","total","status" FROM "Sale" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3 LIMIT 1`,canonicalAudit.saleId,order.companyId,order.storeId))[0];
  if(!canonicalSale||Math.abs(Number(canonicalSale.total||0)-Number(order.total||0))>0.011)return;

  await prisma.$transaction(async tx=>{
    await tx.$executeRawUnsafe(`UPDATE "OnlineOrder" SET "saleId"=$1,"updatedAt"=NOW() WHERE "id"=$2`,canonicalAudit.saleId,order.id);
    for(const duplicateAudit of uniqueAudits.slice(1)){
      const sale=(await tx.$queryRawUnsafe(`SELECT "id","total","status" FROM "Sale" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3 LIMIT 1`,duplicateAudit.saleId,order.companyId,order.storeId))[0];
      if(!sale||Math.abs(Number(sale.total||0)-Number(order.total||0))>0.011)continue;
      await tx.$executeRawUnsafe(`DELETE FROM "Payment" WHERE "saleId"=$1`,duplicateAudit.saleId);
      await tx.$executeRawUnsafe(`UPDATE "Sale" SET "status"='CANCELLED' WHERE "id"=$1`,duplicateAudit.saleId);
      await tx.$executeRawUnsafe(`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES ($1,$2,$3,NULL,$4,'ONLINE_DUPLICATE_SALE_REPAIRED',jsonb_build_object('orderNumber','KAT-009','canonicalSaleId',$5,'duplicateSaleId',$6,'stockChanged',false))`,crypto.randomUUID(),order.companyId,order.storeId,String(transactions[0]?.actorId||"SYSTEM"),canonicalAudit.saleId,duplicateAudit.saleId);
    }
  });
  console.log(`KAT-009 sale dedupe completed. Canonical sale: ${canonicalAudit.saleId}`);
}

try{await repair()}catch(error){console.warn("KAT-009 duplicate repair skipped:",error?.message||error)}finally{await prisma.$disconnect()}
