import {weeklyStockAlarmReadiness} from './weekly-stock-alarm-schema.js';
import {randomUUID} from 'node:crypto';
import {calculateWeeklyStockAlarm,stockAlarmDefaults,stockAlarmPolicy,stockAlarmWeek} from '../lib/weekly-stock-alarm.js';
export async function readStockAlarmPolicy(db,companyId,storeId){
 const rows=await db.$queryRaw`SELECT "scope","settings","version" FROM "WeeklyStockAlarmPolicy" WHERE "companyId"=${companyId} AND "scope" IN ('COMPANY',${storeId})`;
 const company=rows.find(r=>r.scope==='COMPANY'),store=rows.find(r=>r.scope===storeId);
 const settings=stockAlarmPolicy({...stockAlarmDefaults,...company?.settings,...store?.settings});
 if(company?.settings?.enabled===false)settings.enabled=false;
 return {settings,companySettings:stockAlarmPolicy(company?.settings||{}),companyDisabled:company?.settings?.enabled===false,companyVersion:company?.version||0,storeVersion:store?.version||0,inherited:!store};
}
export async function stockAlarmRows(db,{companyId,storeId,settings,now=new Date(),limit=100,onlyUnprocessed=false,query='',after=''}){
 const from=new Date(now-settings.historyDays*86400000),week=stockAlarmWeek(now);
 return db.$queryRaw`
 SELECT p."id" AS "productId",p."name",p."sku",p."unit",GREATEST(p."createdAt",sp."createdAt") AS "createdAt",sp."currentStock",sp."minStock",r."mode",r."floor",r."leadDays",r."lastApplied",r."baselineMinimum",
 EXISTS(SELECT 1 FROM "Recipe" x WHERE x."companyId"=${companyId} AND x."productId"=p."id" AND x."active"=TRUE) OR EXISTS(SELECT 1 FROM "PreparationRecipeLine" x WHERE x."companyId"=${companyId} AND x."productId"=p."id" AND x."automatic"=TRUE) AS "hasRecipe",
 COALESCE(v."soldQuantity",0) AS "soldQuantity",COALESCE(v."returnedQuantity",0) AS "returnedQuantity"
 FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId}
 LEFT JOIN "WeeklyStockAlarmProduct" r ON r."companyId"=${companyId} AND r."storeId"=sp."storeId" AND r."productId"=p."id"
 LEFT JOIN LATERAL (
 SELECT SUM(GREATEST(l."quantity",0)) FILTER(WHERE s."source" NOT IN ('POS_REVERSAL','WASTE','SELF_CONSUMPTION','PRODUCT_DESTRUCTION')) AS "soldQuantity",
 SUM(CASE WHEN s."source"='POS_REVERSAL' THEN ABS(l."quantity") ELSE GREATEST(-l."quantity",0) END) FILTER(WHERE s."source" NOT IN ('WASTE','SELF_CONSUMPTION','PRODUCT_DESTRUCTION')) AS "returnedQuantity"
 FROM "SaleLine" l JOIN "Sale" s ON s."id"=l."saleId" WHERE l."productId"=p."id" AND s."companyId"=${companyId} AND s."storeId"=${storeId} AND s."status"='COMPLETED' AND s."occurredAt">=${from.toISOString().slice(0,-1)}::timestamp AND s."occurredAt"<${now.toISOString().slice(0,-1)}::timestamp
 ) v ON TRUE
 WHERE sp."storeId"=${storeId} AND sp."active"=TRUE AND p."active"=TRUE AND p."trackStock"=TRUE
 AND p."id">${after} AND (${query}='' OR p."name" ILIKE ${'%'+query+'%'} OR COALESCE(p."sku",'') ILIKE ${'%'+query+'%'})
 AND (NOT ${onlyUnprocessed} OR NOT EXISTS(SELECT 1 FROM "WeeklyStockAlarmHistory" h WHERE h."companyId"=${companyId} AND h."storeId"=${storeId} AND h."productId"=p."id" AND h."week"=${week} AND h."status" IN ('APPLY','HELD','UNCHANGED')))
 ORDER BY p."id" LIMIT ${limit}`;
}
export async function runWeeklyStockAlarmBatch(db,{companyId,storeId,now=new Date()}){
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}),0)`;
  const [store]=await tx.$queryRaw`SELECT s."id" FROM "Store" s JOIN "Company" c ON c."id"=s."companyId" WHERE s."id"=${storeId} AND s."companyId"=${companyId} AND s."active"=TRUE AND c."active"=TRUE AND c."licenseStatus" NOT IN ('SUSPENDED','EXPIRED') AND (c."subscriptionEndsAt" IS NULL OR c."subscriptionEndsAt">=${now})`;
  if(!store)return {status:'INACTIVE',processed:0};
  const [entitlement]=await tx.$queryRaw`SELECT COALESCE((SELECT (m."active"=TRUE AND (m."startsAt" IS NULL OR m."startsAt"<=${now}) AND (m."endsAt" IS NULL OR m."endsAt">=${now})) FROM "StorePaidModule" m WHERE m."storeId"=${storeId} AND m."moduleKey"='ORDER_SUGGESTIONS'),EXISTS(SELECT 1 FROM "CompanyModule" m WHERE m."companyId"=${companyId} AND m."moduleKey"='ORDER_SUGGESTIONS' AND m."active"=TRUE AND (m."startsAt" IS NULL OR m."startsAt"<=${now}) AND (m."endsAt" IS NULL OR m."endsAt">=${now}))) AS "enabled"`;
  if(entitlement?.enabled!==true)return {status:'MODULE_OFF',processed:0};
  const policy=await readStockAlarmPolicy(tx,companyId,storeId);if(!policy.settings.enabled)return {status:'OFF',processed:0};
  const rows=await stockAlarmRows(tx,{companyId,storeId,settings:policy.settings,now,onlyUnprocessed:true});
  for(const row of rows){
   const [locked]=await tx.$queryRaw`SELECT "minStock","currentStock" FROM "StoreProduct" WHERE "storeId"=${storeId} AND "productId"=${row.productId} AND "active"=TRUE FOR UPDATE`;
   if(!locked)continue;
   const current={...row,minStock:locked.minStock,currentStock:locked.currentStock};
   const result=calculateWeeklyStockAlarm(current,{...policy.settings,leadDays:row.leadDays==null?policy.settings.leadDays:Number(row.leadDays)},now);
   if(result.reason==='MANUAL_CHANGE_DETECTED')await tx.$executeRaw`UPDATE "WeeklyStockAlarmProduct" SET "mode"='MANUAL' WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "productId"=${row.productId}`;
   if(result.status==='APPLY'||result.status==='UNCHANGED'){
    await tx.$executeRaw`UPDATE "StoreProduct" SET "minStock"=${result.nextMinimum},"updatedAt"=NOW() WHERE "storeId"=${storeId} AND "productId"=${row.productId}`;
    await tx.$executeRaw`INSERT INTO "WeeklyStockAlarmProduct" ("companyId","storeId","productId","baselineMinimum","lastApplied") VALUES (${companyId},${storeId},${row.productId},${result.previousMinimum},${result.nextMinimum}) ON CONFLICT("companyId","storeId","productId") DO UPDATE SET "baselineMinimum"=COALESCE("WeeklyStockAlarmProduct"."baselineMinimum",EXCLUDED."baselineMinimum"),"lastApplied"=EXCLUDED."lastApplied"`;
   }
   await tx.$executeRaw`INSERT INTO "WeeklyStockAlarmHistory" ("id","companyId","storeId","productId","week","previousMinimum","nextMinimum","status","details") VALUES (${randomUUID()},${companyId},${storeId},${row.productId},${stockAlarmWeek(now)},${result.previousMinimum},${result.nextMinimum},${result.status},${JSON.stringify({...result,name:row.name,sku:row.sku,policy})}::jsonb)`;
  }
  return {status:'COMPLETE',processed:rows.length};
 },{timeout:30000});
}

export async function readWeeklyStockAlarmState(db,scope){
 const readiness=await weeklyStockAlarmReadiness(db);if(!readiness.ready)return {available:false,enabled:false,reason:readiness.reason};
 const policy=await readStockAlarmPolicy(db,scope.companyId,scope.storeId);return {available:true,enabled:policy.settings.enabled,reason:null};
}
