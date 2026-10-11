// Read-only account activity. Sale documents describe activity; CustomerLedger
// alone changes debt, so a credit sale must not appear a second time as a Sale.
const cents=value=>Math.round(Number(value||0)*100);
const money=value=>value/100;
function invalid(message){const e=new Error(message);e.status=400;return e}

export async function readCustomerActivityLedger(db,companyId,customerId,query={}){
  const from=query.from?new Date(String(query.from)):new Date('2000-01-01T00:00:00Z');
  const to=query.to?new Date(String(query.to)):new Date();
  if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to)throw invalid('Μη έγκυρο διάστημα ημερομηνίας και ώρας.');
  return db.$transaction(async tx=>{
    const [customer]=await tx.$queryRaw`SELECT "id","name","balance" FROM "Customer" WHERE "id"=${customerId} AND "companyId"=${companyId} LIMIT 1`;
    if(!customer)return null;
    const [later]=await tx.$queryRaw`SELECT COALESCE(SUM("amount"),0) AS "amount" FROM "CustomerLedger" WHERE "customerId"=${customerId} AND "createdAt">=${from}`;
    const opening=cents(customer.balance)-cents(later.amount);
    const rows=await tx.$queryRaw`
      SELECT * FROM (
        SELECT s."id",s."occurredAt" AS "at",
          CASE WHEN s."source"='POS_REVERSAL' AND s."reversalKind"='CANCEL' THEN 'SALE_CANCEL'
               WHEN s."source"='POS_REVERSAL' AND s."reversalKind" IN ('RETURN','RETURN_ITEMS') THEN 'SALE_RETURN'
               WHEN s."transactionMode"='DELAYED' THEN 'SALE_DELAYED' ELSE 'SALE' END AS "type",
          s."total" AS "amount",COALESCE(s."receiptNumber",s."id") AS "reference",st."name" AS "storeName",
          CASE WHEN s."source"='POS_REVERSAL' THEN COALESCE(a."reason",'Αντίστροφη εγγραφή POS')
               WHEN s."transactionMode"='DELAYED' THEN COALESCE(s."delayedReason",'Ετεροχρονισμένη συναλλαγή') ELSE NULL END AS "note",
          s."originalSaleId",s."source" AS "saleSource",s."transactionMode",s."reversalKind",
          COALESCE(p."methods",'') AS "paymentMethod",COALESCE(s."operatorEmployeeId"::text,'') AS "actorId",
          COALESCE(li."items",'') AS "items",0::numeric AS "debtDelta",'SALE_ACTIVITY'::text AS "recordKind"
        FROM "Sale" s JOIN "Store" st ON st."id"=s."storeId" AND st."companyId"=s."companyId"
        LEFT JOIN LATERAL (SELECT pa."reason" FROM "PosSaleActionAudit" pa WHERE pa."companyId"=s."companyId" AND pa."storeId"=s."storeId" AND pa."saleId"=s."id" ORDER BY pa."createdAt" DESC LIMIT 1) a ON true
        LEFT JOIN LATERAL (SELECT STRING_AGG(DISTINCT py."method",', ' ORDER BY py."method") AS "methods" FROM "Payment" py WHERE py."saleId"=s."id") p ON true
        LEFT JOIN LATERAL (SELECT STRING_AGG(CONCAT(sl."quantity",' × ',sl."description",' @ ',sl."unitPrice",' € · ',sl."lineTotal",' €'),' · ' ORDER BY sl."createdAt",sl."id") AS "items" FROM "SaleLine" sl WHERE sl."saleId"=s."id") li ON true
        WHERE s."companyId"=${companyId} AND s."customerId"=${customerId} AND s."status"='COMPLETED'
          AND NOT EXISTS (SELECT 1 FROM "CustomerLedger" cl WHERE cl."customerId"=${customerId} AND cl."entryType"='SALE_CREDIT' AND cl."referenceId"=s."id")
        UNION ALL
        SELECT l."id",l."createdAt" AS "at",l."entryType" AS "type",l."amount",
          COALESCE(l."referenceId",l."id") AS "reference",st."name" AS "storeName",l."note",
          NULL::text AS "originalSaleId",NULL::text AS "saleSource",
          CASE WHEN l."entryType"='SALE_CREDIT' THEN 'CREDIT' ELSE NULL END AS "transactionMode",NULL::text AS "reversalKind",
          COALESCE(to_jsonb(l)->>'paymentMethod',CASE WHEN l."entryType"='SALE_CREDIT' THEN 'CREDIT' ELSE '' END) AS "paymentMethod",
          COALESCE(to_jsonb(l)->>'actorName',l."actorId",'') AS "actorId",COALESCE(li."items",'') AS "items",
          l."amount" AS "debtDelta",'ACCOUNT'::text AS "recordKind"
        FROM "CustomerLedger" l LEFT JOIN "Store" st ON st."id"=l."storeId" AND st."companyId"=${companyId}
        LEFT JOIN LATERAL (SELECT STRING_AGG(CONCAT(sl."quantity",' × ',sl."description",' @ ',sl."unitPrice",' € · ',sl."lineTotal",' €'),' · ' ORDER BY sl."createdAt",sl."id") AS "items" FROM "SaleLine" sl JOIN "Sale" sa ON sa."id"=sl."saleId" WHERE sl."saleId"=l."referenceId" AND sa."companyId"=${companyId} AND sa."customerId"=${customerId}) li ON true
        WHERE l."customerId"=${customerId}
      ) x WHERE x."at">=${from} AND x."at"<=${to} ORDER BY x."at" ASC,x."id" ASC LIMIT 5001`;
    if(rows.length>5000)throw invalid('Περιορίστε το διάστημα σε έως 5.000 κινήσεις για πλήρη αναλυτική καρτέλα.');
    let running=opening;
    const mapped=rows.map(row=>{
      const amount=cents(row.amount),delta=cents(row.debtDelta);
      running+=delta;
      const account=row.recordKind==='ACCOUNT';
      return {...row,amount:money(amount),debtDelta:money(delta),
        debit:money(account?Math.max(0,amount):amount),
        credit:money(account?Math.max(0,-amount):(row.transactionMode==='CREDIT'?0:amount)),
        runningBalance:money(running)};
    });
    return {customer:{id:customer.id,name:customer.name,balance:money(cents(customer.balance))},from,to,
      openingBalance:money(opening),closingBalance:money(running),rows:mapped.reverse(),reversalAware:true};
  },{isolationLevel:'RepeatableRead'});
}
