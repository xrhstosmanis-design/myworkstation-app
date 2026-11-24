/**
 * One-time historical review-state reconciliation for cash payments.
 * Default: read-only preview. Requires explicit --apply and acknowledgement.
 * NEVER touches StoreTransaction, PurchaseDocument, amounts or cash shifts.
 */
import crypto from 'node:crypto';
import {prisma} from '../src/prisma.js';

const stores = [
  {id:'cmw0pwyvo000uokg2jrjm1p0c',name:'Αχαρνών 309',suppliers:12,expenses:18},
  {id:'cmvgtyt6d000zh7gtbsp1en3p',name:'Ριζαρείου',suppliers:13,expenses:10}
];
const apply=process.argv.includes('--apply');
const runId=crypto.randomUUID();
const eligibleSupplier=async(db,storeId)=>db.$queryRaw`
  SELECT ss."id",ss."companyId",ss."storeId",ss."transactionId",t."amount"
  FROM "SupplierPaymentSettlement" ss
  JOIN "StoreTransaction" t ON t."id"=ss."transactionId" AND t."companyId"=ss."companyId" AND t."storeId"=ss."storeId"
  WHERE ss."storeId"=${storeId} AND ss."status"='PENDING_REVIEW' AND ss."paymentMethod"='CASH_SHIFT'
    AND t."type"='SUPPLIER_PAYMENT' AND t."paymentMethod"='CASH_SHIFT'
    AND t."reversedAt" IS NULL AND t."sessionId" IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" be WHERE be."sourceTransactionId"=t."id")
    AND EXISTS(SELECT 1 FROM "SupplierPaymentAllocation" a WHERE a."settlementId"=ss."id")
    AND ABS(t."amount" - (SELECT COALESCE(SUM(a."amount"),0) FROM "SupplierPaymentAllocation" a WHERE a."settlementId"=ss."id"))<=1.00
  ORDER BY ss."id"`;
const eligibleExpense=async(db,storeId)=>db.$queryRaw`
  SELECT er."id",er."companyId",er."storeId",er."transactionId",t."amount"
  FROM "OtherExpenseReview" er
  JOIN "StoreTransaction" t ON t."id"=er."transactionId" AND t."companyId"=er."companyId" AND t."storeId"=er."storeId"
  WHERE er."storeId"=${storeId} AND er."status"='PENDING_REVIEW'
    AND t."type"='OTHER_EXPENSE' AND t."paymentMethod"='CASH_SHIFT'
    AND t."reversedAt" IS NULL AND t."sessionId" IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" be WHERE be."sourceTransactionId"=t."id")
  ORDER BY er."id"`;

try {
  const snapshot=[];
  for(const store of stores){
    const suppliers=await eligibleSupplier(prisma,store.id);
    const expenses=await eligibleExpense(prisma,store.id);
    snapshot.push({store:store.name,storeId:store.id,suppliers:suppliers.length,expenses:expenses.length,
      expectedSuppliers:store.suppliers,expectedExpenses:store.expenses});
  }
  process.stdout.write(JSON.stringify({mode:apply?'APPLY':'PREVIEW',runId,snapshot},null,2)+'\n');
  if(!apply)process.exitCode=0;
  else {
    if(process.env.MWS_CASH_RECONCILE_ACK!=='APPROVE_20261124_53_RECORDS')throw Error('Missing explicit approval guard');
    if(snapshot.some((s,i)=>s.suppliers!==stores[i].suppliers||s.expenses!==stores[i].expenses))
      throw Error('Live candidates changed: refuse all writes and re-audit');
    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('cash-review-reconcile-20261124'))::text AS lock`;
      for(const store of stores){
        const suppliers=await eligibleSupplier(tx,store.id),expenses=await eligibleExpense(tx,store.id);
        if(suppliers.length!==store.suppliers||expenses.length!==store.expenses)throw Error('Concurrent change detected');
        for(const row of suppliers){
          const n=await tx.$executeRaw`UPDATE "SupplierPaymentSettlement" SET "status"='CONFIRMED',
            "reviewedBy"=NULL,"reviewedAt"=NULL,
            "reviewNote"='Αυτόματη συμφωνία παλαιάς πληρωμής με κανόνα 24/11/2026: μετρητά, χωρίς απόκλιση >1€'
            WHERE "id"=${row.id} AND "companyId"=${row.companyId} AND "storeId"=${store.id} AND "status"='PENDING_REVIEW'`;
          if(n!==1)throw Error('Supplier row changed');
          await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details")
            VALUES (${crypto.randomUUID()},${row.companyId},${store.id},NULL,'SYSTEM','HISTORICAL_CASH_REVIEW_RECONCILED',
            ${JSON.stringify({runId,kind:'SUPPLIER',settlementId:row.id,transactionId:row.transactionId,previousStatus:'PENDING_REVIEW',newStatus:'CONFIRMED',amount:String(row.amount)})}::jsonb)`;
        }
        for(const row of expenses){
          const n=await tx.$executeRaw`UPDATE "OtherExpenseReview" SET "status"='CONFIRMED',
            "reviewedBy"=NULL,"reviewedAt"=NULL,
            "reviewNote"='Αυτόματη συμφωνία παλαιού εξόδου με κανόνα 24/11/2026: μετρητά'
            WHERE "id"=${row.id} AND "companyId"=${row.companyId} AND "storeId"=${store.id} AND "status"='PENDING_REVIEW'`;
          if(n!==1)throw Error('Expense row changed');
          await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details")
            VALUES (${crypto.randomUUID()},${row.companyId},${store.id},NULL,'SYSTEM','HISTORICAL_CASH_REVIEW_RECONCILED',
            ${JSON.stringify({runId,kind:'EXPENSE',reviewId:row.id,transactionId:row.transactionId,previousStatus:'PENDING_REVIEW',newStatus:'CONFIRMED',amount:String(row.amount)})}::jsonb)`;
        }
      }
    },{timeout:30000});
    process.stdout.write('COMMITTED '+runId+'\n');
  }
} catch(error){
  console.error('RECONCILIATION STOPPED:',error.message);
  process.exitCode=1;
} finally {
  await prisma.$disconnect();
}
