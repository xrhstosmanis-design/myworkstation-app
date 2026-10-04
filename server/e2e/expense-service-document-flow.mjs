import assert from 'node:assert/strict';
import crypto from 'node:crypto';
export async function verifyExpenseServiceDocument({request,prisma,token,storeId,foreignStoreId}){
 const marker=crypto.randomUUID();
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const body={documentNumber:`EXPENSE-${marker}`,documentDate:date,issuer:'Isolated CI Supplier',description:'Cleaning service',totalNet:100,totalVat:24,totalGross:124,idempotencyKey:`expense-${marker}`};
 const path=`/api/transactions/stores/${storeId}/expense-documents`;
 const stockBefore=await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "StockMovement"`;
 const draft=await request(path,{method:'POST',token,body});assert.equal(draft.response.status,201,JSON.stringify(draft.payload));assert.equal(draft.payload.status,'DRAFT');
 const replay=await request(path,{method:'POST',token,body});assert.equal(replay.response.status,200,JSON.stringify(replay.payload));assert.equal(replay.payload.id,draft.payload.id);
 assert.equal((await request(path,{method:'POST',token,body:{...body,totalNet:99,totalVat:25}})).response.status,409);
 assert.equal((await request(path,{method:'POST',token,body:{...body,idempotencyKey:`different-${marker}`}})).response.status,409);
 assert.equal((await request(`/api/transactions/stores/${foreignStoreId}/expense-documents/${draft.payload.id}/approve`,{method:'POST',token,body:{}})).response.status,404);
 const approved=await request(`${path}/${draft.payload.id}/approve`,{method:'POST',token,body:{}});assert.equal(approved.response.status,200,JSON.stringify(approved.payload));assert.equal(approved.payload.stockUpdated,false);
 const approvalReplay=await request(`${path}/${draft.payload.id}/approve`,{method:'POST',token,body:{}});assert.equal(approvalReplay.response.status,200);assert.equal(approvalReplay.payload.replayed,true);
 const audit=await prisma.$queryRaw`SELECT "eventType" FROM "StoreOperatorAudit" WHERE "details"->>'documentId'=${draft.payload.id}`;assert.equal(audit.length,2);
 const lines=await prisma.$queryRaw`SELECT "productId","netAmount","vatAmount","grossAmount" FROM "PurchaseDocumentLine" WHERE "purchaseDocumentId"=${draft.payload.id}`;assert.equal(lines.length,1);assert.equal(lines[0].productId,null);assert.equal(Number(lines[0].netAmount),100);assert.equal(Number(lines[0].vatAmount),24);
 assert.deepEqual(await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "StockMovement"`,stockBefore);
 const paymentBody={type:'OTHER_EXPENSE',amount:124,description:`Isolated expense ${marker}`,evidenceMode:'DOCUMENT',purchaseDocumentId:draft.payload.id,paymentSource:'EXTERNAL',idempotencyKey:`payment-${marker}`};
 const payment=await request(`/api/transactions/stores/${storeId}`,{method:'POST',token,body:paymentBody});assert.equal(payment.response.status,201,JSON.stringify(payment.payload));assert.equal(payment.payload.sessionId,null);
 const paymentReplay=await request(`/api/transactions/stores/${storeId}`,{method:'POST',token,body:paymentBody});assert.equal(paymentReplay.response.status,409,JSON.stringify(paymentReplay.payload));
 const savedPayments=await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "StoreTransaction" WHERE "companyId"=(SELECT "companyId" FROM "Store" WHERE "id"=${storeId}) AND "storeId"=${storeId} AND "id"=${payment.payload.id}`;assert.equal(savedPayments[0].count,1);
 const report=await request(`/api/owner-payments/business-picture?storeId=${storeId}&from=${date}&to=${date}`,{token});assert.equal(report.response.status,200,JSON.stringify(report.payload));assert.equal(report.payload.totals.expenseGross,124);assert.equal(report.payload.totals.expenses,100);assert.equal(report.payload.totals.expenseVat,24);assert.equal(report.payload.totals.missingExpenseVatPayments,0);
 console.log('Isolated service expense draft/approval/payment/VAT and no-stock flow passed');
}
