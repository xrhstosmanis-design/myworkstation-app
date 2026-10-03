import crypto from "crypto";
import {prisma} from "./prisma.js";

export async function finalizeDispatchedCashRequest(requestId){
  const rows=await prisma.$queryRaw`SELECT "id","companyId","storeId","terminalPos","clientTransactionId","paymentMethod","total","status","checkoutJson" FROM "RbsCapDriverV1Request" WHERE "id"=${requestId} LIMIT 1`;
  const request=rows[0];
  if(!request||request.status!=="DISPATCHED"||request.paymentMethod!=="CASH")return {skipped:true};
  const checkout=request.checkoutJson||{},resolved=Array.isArray(checkout.resolvedItems)?checkout.resolvedItems:[];
  if(!resolved.length)throw new Error("RBS cash auto-finalize: missing resolved checkout items.");
  return prisma.$transaction(async tx=>{
    const locked=(await tx.$queryRaw`SELECT * FROM "RbsCapDriverV1Request" WHERE "id"=${requestId} FOR UPDATE`)[0];
    if(!locked||locked.status!=="DISPATCHED"||locked.saleId)return {skipped:true};
    const existing=(await tx.$queryRaw`SELECT "id" FROM "Sale" WHERE "companyId"=${locked.companyId} AND "storeId"=${locked.storeId} AND "clientTransactionId"=${locked.clientTransactionId} LIMIT 1`)[0];
    if(existing){await tx.$executeRaw`UPDATE "RbsCapDriverV1Request" SET "status"='SALE_COMMITTED',"saleId"=${existing.id},"updatedAt"=NOW() WHERE "id"=${locked.id} AND "status"='DISPATCHED'`;return {saleId:existing.id,replay:true}}
    const saleId=crypto.randomUUID(),summary=checkout.baseSummary||{},audience=checkout.audience||"NORMAL",operationChannel=checkout.operationChannel||"COUNTER";
    await tx.$executeRaw`INSERT INTO "Sale" ("id","companyId","storeId","customerId","operatorEmployeeId","fiscalStatus","subtotal","discount","total","status","source","clientTransactionId","saleFingerprint","duplicateConfirmed","transactionMode","operationChannel","audience") VALUES (${saleId},${locked.companyId},${locked.storeId},${checkout.customerId||null},NULL,'ISSUED',${Number(summary.subtotal||locked.total)},${Number(summary.discount||0)},${Number(summary.total||locked.total)},'COMPLETED','POS',${locked.clientTransactionId},${locked.requestHash},FALSE,'NORMAL',${operationChannel},${audience})`;
    for(const item of resolved){const lineId=crypto.randomUUID(),qty=Number(item.quantity||1),unit=Number(item.effectiveUnitPrice??item.unitPrice??0),lineTotal=Number(item.lineTotal??unit*qty);await tx.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","description","quantity","unitPrice","discount","vatRate","lineTotal","promotionId","promotionType","scannedBarcode") VALUES (${lineId},${saleId},${item.productId},${item.name||""},${qty},${unit},${Number(item.discount||0)},${Number(item.vatRate||0)},${lineTotal},${item.promotionId||null},${item.promotionType||null},${item.barcode||null})`;}
    await tx.$executeRaw`INSERT INTO "Payment" ("id","saleId","method","amount") VALUES (${crypto.randomUUID()},${saleId},'CASH',${Number(summary.total||locked.total)})`;
    const shift=(await tx.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${locked.companyId} AND "storeId"=${locked.storeId} AND UPPER(TRIM("terminalPos"))=UPPER(TRIM(${locked.terminalPos})) AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1 FOR KEY SHARE`)[0];
    if(!shift)throw new Error(`RBS cash auto-finalize: no open shift for ${locked.terminalPos}.`);
    await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName") VALUES (${crypto.randomUUID()},${locked.companyId},${locked.storeId},${shift.id},'SALE_CASH',${Number(summary.total||locked.total)},${`POS πώληση ${saleId} · ΜΕΤΡΗΤΑ`},'RBS_CAPDRIVER_V1','RBS CAP Driver v1')`;
    await tx.$executeRaw`UPDATE "RbsCapDriverV1Request" SET "status"='SALE_COMMITTED',"saleId"=${saleId},"updatedAt"=NOW() WHERE "id"=${locked.id} AND "status"='DISPATCHED'`;
    return {saleId};
  });
}
