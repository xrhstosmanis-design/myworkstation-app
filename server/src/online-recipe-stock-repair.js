import crypto from "crypto";
import {prisma} from "./prisma.js";

// Real ONLINE_ORDER_RECIPE movements were introduced before this cutoff.
// Keep a generous deployment buffer and never touch older historical orders,
// because older builds could change StoreProduct without writing StockMovement.
const REPAIR_CUTOFF=new Date("2026-08-20T06:45:00.000Z");
const KAT_STORE_NAME="Κυλικείο ΚΑΤ";
const n=value=>Number(value||0);

async function recipeForLine(tx,{companyId,storeId,line}){
  let rows=await tx.$queryRaw`
    SELECT r."productId" AS "recipeProductId",r."ingredientProductId",r."quantity",p."name" AS "ingredientName",
           sp."id" AS "storeProductId",sp."productId" AS "stockProductId"
    FROM "PreparationRecipeLine" r
    JOIN "Product" p ON p."id"=r."ingredientProductId" AND p."companyId"=r."companyId" AND p."active"=TRUE
    LEFT JOIN "StoreProduct" sp ON sp."storeId"=${storeId} AND sp."productId"=r."ingredientProductId" AND sp."active"=TRUE
    WHERE r."companyId"=${companyId} AND r."productId"=${line.productId} AND r."automatic"=TRUE
    ORDER BY r."id"`;
  if(!rows.length){
    const fallback=await tx.$queryRaw`
      SELECT r."productId" AS "recipeProductId",r."ingredientProductId",r."quantity",p."name" AS "ingredientName",
             sp."id" AS "storeProductId",sp."productId" AS "stockProductId"
      FROM "PreparationRecipeLine" r
      JOIN "Product" rp ON rp."id"=r."productId" AND rp."companyId"=r."companyId"
      JOIN "Product" p ON p."id"=r."ingredientProductId" AND p."companyId"=r."companyId" AND p."active"=TRUE
      LEFT JOIN "StoreProduct" sp ON sp."storeId"=${storeId} AND sp."productId"=r."ingredientProductId" AND sp."active"=TRUE
      WHERE r."companyId"=${companyId} AND r."automatic"=TRUE
        AND LOWER(TRIM(rp."name"))=LOWER(TRIM(${line.productName}))
      ORDER BY r."productId",r."id"`;
    const products=[...new Set(fallback.map(row=>row.recipeProductId))];
    rows=products.length===1?fallback:[];
  }
  const resolved=[];
  for(const row of rows){
    if(row.storeProductId){resolved.push(row);continue}
    const sameName=(await tx.$queryRaw`
      SELECT sp."id" AS "storeProductId",sp."productId" AS "stockProductId"
      FROM "StoreProduct" sp
      JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId} AND p."active"=TRUE
      WHERE sp."storeId"=${storeId} AND sp."active"=TRUE
        AND LOWER(TRIM(p."name"))=LOWER(TRIM(${row.ingredientName}))
      ORDER BY CASE WHEN COALESCE(sp."currentStock",0)>0 THEN 0 ELSE 1 END,COALESCE(sp."currentStock",0) DESC,p."id"
      LIMIT 1`)[0];
    resolved.push(sameName?{...row,...sameName}:row);
  }
  return resolved;
}

async function repairOrder(order){
  return prisma.$transaction(async tx=>{
    // Lock the order so two server starts cannot repair it concurrently.
    const locked=(await tx.$queryRaw`
      SELECT "id","orderNumber","storeId","companyId","status","saleId","commercialPostedAt","deliveredAt"
      FROM "OnlineOrder" WHERE "id"=${order.id} FOR UPDATE`)[0];
    if(!locked||locked.status!=="DELIVERED"||!locked.saleId)return{orderNumber:order.orderNumber,repaired:0,skipped:"not-delivered"};
    const postedAt=new Date(locked.deliveredAt||locked.commercialPostedAt||0);
    if(!Number.isFinite(postedAt.getTime())||postedAt<REPAIR_CUTOFF)return{orderNumber:locked.orderNumber,repaired:0,skipped:"before-cutoff"};

    const lines=await tx.$queryRaw`
      SELECT l."productId",l."productName",l."quantity"
      FROM "OnlineOrderLine" l WHERE l."orderId"=${locked.id} ORDER BY l."createdAt"`;
    const expected=new Map();
    for(const line of lines){
      const recipe=await recipeForLine(tx,{companyId:locked.companyId,storeId:locked.storeId,line});
      for(const ingredient of recipe){
        if(!ingredient.storeProductId||!ingredient.stockProductId)continue;
        const qty=n(line.quantity)*n(ingredient.quantity);
        if(!(qty>0))continue;
        const key=ingredient.stockProductId;
        const current=expected.get(key)||{stockProductId:key,storeProductId:ingredient.storeProductId,ingredientName:ingredient.ingredientName,quantity:0};
        current.quantity+=qty;expected.set(key,current);
      }
    }

    let repaired=0;
    for(const item of expected.values()){
      const movement=(await tx.$queryRaw`
        SELECT COALESCE(SUM(ABS("quantity")),0) AS consumed
        FROM "StockMovement"
        WHERE "storeId"=${locked.storeId} AND "productId"=${item.stockProductId}
          AND "sourceType"='ONLINE_ORDER_RECIPE' AND "sourceId"=${locked.id}`)[0];
      const missing=Math.max(0,item.quantity-n(movement?.consumed));
      if(missing<=0.000001)continue;
      const changed=await tx.$executeRaw`
        UPDATE "StoreProduct" SET "currentStock"=COALESCE("currentStock",0)-${missing},"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${item.storeProductId} AND "storeId"=${locked.storeId} AND "active"=TRUE`;
      if(!changed)continue;
      await tx.$executeRaw`UPDATE "Product" SET "trackStock"=TRUE,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${item.stockProductId} AND "companyId"=${locked.companyId}`;
      await tx.$executeRaw`
        INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId")
        VALUES (${crypto.randomUUID()},${locked.storeId},${item.stockProductId},'RECIPE_CONSUMPTION',${-missing},${null},'ONLINE_ORDER_RECIPE',${locked.id},${`ONLINE ΠΑΡΑΓΓΕΛΙΑ · ${locked.orderNumber} · Αυτόματη αποκατάσταση κατανάλωσης συνταγής`},${null})`;
      repaired++;
    }
    return{orderNumber:locked.orderNumber,repaired};
  });
}

async function main(){
  try{
    const orders=await prisma.$queryRaw`
      SELECT o."id",o."orderNumber"
      FROM "OnlineOrder" o
      JOIN "Store" s ON s."id"=o."storeId" AND s."companyId"=o."companyId"
      WHERE o."status"='DELIVERED' AND o."saleId" IS NOT NULL
        AND LOWER(s."name")=LOWER(${KAT_STORE_NAME})
        AND COALESCE(o."deliveredAt",o."commercialPostedAt",o."updatedAt")>=${REPAIR_CUTOFF}
      ORDER BY COALESCE(o."deliveredAt",o."commercialPostedAt",o."updatedAt") ASC`;
    let repaired=0;
    for(const order of orders){const result=await repairOrder(order);repaired+=result.repaired||0}
    if(repaired)console.log(`Online recipe stock repair: ${repaired} missing ingredient movement(s) restored.`);
  }catch(error){
    // Startup repair must never take the POS offline. It is deliberately best-effort and idempotent.
    console.warn("Online recipe stock repair skipped:",error?.message||error);
  }finally{
    await prisma.$disconnect().catch(()=>{});
  }
}

await main();
