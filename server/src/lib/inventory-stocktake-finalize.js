import {lockDraftInventoryStocktake} from "./inventory-stocktake-draft.js";
import {randomUUID} from 'node:crypto';

const number=value=>Number(value||0);
const conflict=message=>Object.assign(new Error(message),{status:409});

// Call inside a transaction. Stock rows precede line rows, matching ordinary
// movements (stock update, then the live-stocktake trigger).
export async function finalizeInventoryStocktake(tx, stocktake, userId, cause) {
  const reason=typeof cause==='string'?cause.trim():'';
  if(reason.length<3||reason.length>300)throw Object.assign(new Error('Γράψε αιτιολογία οριστικοποίησης από 3 έως 300 χαρακτήρες.'),{status:400});
  await lockDraftInventoryStocktake(tx, stocktake);
  const [locked]=await tx.$queryRaw`SELECT "scopeType","scopeJson" FROM "Stocktake" WHERE "id"=${stocktake.id} AND "companyId"=${stocktake.companyId}`;
  const scopeType=locked?.scopeType || stocktake.scopeType;
  const free=scopeType==='FREE';
  const stocks=await tx.$queryRaw`SELECT sp."productId",sp."currentStock" FROM "StoreProduct" sp WHERE sp."storeId"=${stocktake.storeId} AND sp."productId" IN (SELECT "productId" FROM "StocktakeLine" WHERE "stocktakeId"=${stocktake.id} AND (${free}=false OR "countedQuantity" IS NOT NULL)) ORDER BY sp."productId" FOR UPDATE OF sp`;
  const allLines=await tx.$queryRaw`SELECT "productId","expectedQuantity","countedQuantity","unitCost","recountRequired" FROM "StocktakeLine" WHERE "stocktakeId"=${stocktake.id} AND (${free}=false OR "countedQuantity" IS NOT NULL) ORDER BY "productId" FOR UPDATE`;
  const lines=free?allLines.filter(line=>line.countedQuantity!==null):allLines;
  if(free&&!lines.length)throw conflict('Καταμέτρησε τουλάχιστον ένα προϊόν πριν την καταχώρηση.');
  const unresolved=lines.filter(line=>line.countedQuantity===null||line.recountRequired).length;
  if(unresolved)throw conflict(`Υπάρχουν ${unresolved} γραμμές χωρίς μέτρηση ή επανακαταμέτρηση.`);
  const stockIds=new Set(stocks.map(stock=>stock.productId));
  if(lines.some(line=>!stockIds.has(line.productId)))throw conflict('Το απόθεμα μίας γραμμής δεν είναι διαθέσιμο. Ανανέωσε πριν οριστικοποιήσεις.');
  const snapshot=JSON.stringify({finalizedAt:new Date().toISOString(),scopeType,scope:locked?.scopeJson || stocktake.scopeJson,reason,lineCount:lines.length,totalDifference:lines.reduce((sum,line)=>sum+number(line.countedQuantity)-number(line.expectedQuantity),0)});
  // Close before inserting adjustments: our own movement must not change the
  // expected quantities of this stocktake. Everything still commits atomically.
  await tx.$executeRaw`UPDATE "Stocktake" SET "status"='FINALIZED',"finalizedAt"=NOW(),"finalizedByUserId"=${userId},"snapshotJson"=${snapshot}::jsonb,"updatedAt"=NOW() WHERE "id"=${stocktake.id}`;
  for(const line of lines) {
    const difference=number(line.countedQuantity)-number(line.expectedQuantity);
    if(Math.abs(difference)<=0.0001)continue;
    // Apply the measured difference rather than replacing current stock; retain
    // movements committed since an offline stocktake's initial snapshot.
    await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"="currentStock"+${difference},"updatedAt"=NOW() WHERE "storeId"=${stocktake.storeId} AND "productId"=${line.productId}`;
    await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId") VALUES (${randomUUID()},${stocktake.storeId},${line.productId},'STOCKTAKE_ADJUSTMENT',${difference},${number(line.unitCost)},'INVENTORY_V2',${stocktake.id},${`${free?'Καταχώρηση ελεύθερης απογραφής':scopeType==='FULL'?'Οριστικοποίηση πλήρους Inventory 2.0':'Οριστικοποίηση μερικής Inventory 2.0'} · ${reason}`},${userId})`;
  }
}
