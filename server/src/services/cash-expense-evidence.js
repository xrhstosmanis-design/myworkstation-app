// Read-only evidence. Settlement totals never alter a shift's cash or review balance.
export const purchaseDocumentMime='application/vnd.myworkstation.purchase-document';
const expenseTypes=new Set(['SUPPLIER_PAYMENT','OTHER_EXPENSE']);
const cents=value=>{
  if(value==null||typeof value==='boolean'||String(value).trim()==='')return null;
  const n=Number(value),rounded=Math.round(n*100);
  return Number.isFinite(n)&&Number.isSafeInteger(rounded)&&Math.abs(n*100-rounded)<0.000001?rounded:null;
};
const money=value=>value==null?null:value/100;
export function expenseDocumentCheck(row,document,sourceStatus='AVAILABLE'){
  const amount=cents(row.amount),linked=Boolean(row.purchaseDocumentId);
  const base={...row,amount:money(amount),documentTotal:null,documentPaymentTotal:null,cashPaymentTotal:null,externalPaymentTotal:null,paymentCount:null,difference:null,remainingDocumentAmount:null,paymentSource:row.subtractFromShift===true?'CASH_SHIFT':row.subtractFromShift===false?'EXTERNAL':'UNKNOWN',hasEvidence:Boolean(row.hasAttachment),status:'NO_DOCUMENT'};
  if(row.reversedAt)return {...base,status:'REVERSED'};
  if(!linked)return {...base,status:row.hasAttachment?'ATTACHMENT_ONLY':'NO_DOCUMENT'};
  if(sourceStatus!=='AVAILABLE')return {...base,status:'SOURCE_UNAVAILABLE'};
  if(!document)return {...base,status:'DOCUMENT_UNRESOLVED'};
  const gross=cents(document.documentTotal),paid=cents(document.documentPaymentTotal),cash=cents(document.cashPaymentTotal),external=cents(document.externalPaymentTotal),count=Number(document.paymentCount);
  if(document.documentStatus!=='APPROVED'||gross==null||gross<=0||amount==null||amount<=0||paid==null||cash==null||external==null||paid<amount||cash<0||external<0||cash+external!==paid||!Number.isSafeInteger(count)||count<1||Number(document.invalidPaymentCount)!==0||base.paymentSource==='UNKNOWN'||(row.subtractFromShift===true&&!row.sessionId))return {...base,status:'DOCUMENT_RECHECK'};
  const difference=paid-gross;
  return {...base,hasEvidence:true,documentNumber:document.documentNumber,documentTotal:money(gross),documentPaymentTotal:money(paid),cashPaymentTotal:money(cash),externalPaymentTotal:money(external),paymentCount:count,difference:money(difference),remainingDocumentAmount:money(Math.max(0,-difference)),status:difference===0?'MATCHED':difference<0?'PARTIALLY_PAID':'AMOUNT_MISMATCH'};
}
export async function readCashExpenseEvidence(db,scope,transactions){
  const expenses=transactions.filter(row=>expenseTypes.has(row.type));
  const ids=[...new Set(expenses.filter(row=>!row.reversedAt&&row.purchaseDocumentId).map(row=>row.purchaseDocumentId))];
  let documents=[],status='AVAILABLE';
  if(ids.length){
    if(!scope.companyId||!scope.storeId||ids.length>500)status='UNAVAILABLE';
    else try{
      documents=await db.$queryRaw`
        SELECT p."id",p."documentNumber",p."status" AS "documentStatus",p."totalGross" AS "documentTotal",
          a."paymentCount",a."invalidPaymentCount",a."documentPaymentTotal",a."cashPaymentTotal",a."externalPaymentTotal"
        FROM "PurchaseDocument" p
        CROSS JOIN LATERAL (
          SELECT COUNT(*)::int AS "paymentCount",
            COUNT(*) FILTER (WHERE NOT COALESCE(t."amount">0 AND t."amount"::text NOT IN ('NaN','Infinity','-Infinity') AND t."amount"=ROUND(t."amount",2) AND t."subtractFromShift" IS NOT NULL AND (t."subtractFromShift"=false OR t."sessionId" IS NOT NULL),false))::int AS "invalidPaymentCount",
            COALESCE(SUM(t."amount"),0) AS "documentPaymentTotal",
            COALESCE(SUM(t."amount") FILTER (WHERE t."subtractFromShift"=true),0) AS "cashPaymentTotal",
            COALESCE(SUM(t."amount") FILTER (WHERE t."subtractFromShift"=false),0) AS "externalPaymentTotal"
          FROM "StoreTransaction" t
          WHERE t."companyId"=p."companyId" AND t."storeId"=p."storeId"
            AND t."attachmentMimeType"=${purchaseDocumentMime} AND t."attachmentFilename"=p."id"
            AND t."type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE') AND t."reversedAt" IS NULL
        ) a
        WHERE p."companyId"=${scope.companyId} AND p."storeId"=${scope.storeId} AND p."id"=ANY(${ids}::text[])`;
    }catch{status='UNAVAILABLE'}
  }
  const byId=new Map(documents.map(doc=>[doc.id,doc]));
  return expenses.map(row=>expenseDocumentCheck(row,byId.get(row.purchaseDocumentId),status));
}
export function cashExpenseFindings(checks){
  return checks.filter(row=>!['MATCHED','REVERSED'].includes(row.status)).map(row=>({
    code:row.status==='NO_DOCUMENT'?'EXPENSE_WITHOUT_DOCUMENT':row.status==='AMOUNT_MISMATCH'?'EXPENSE_DOCUMENT_MISMATCH':row.status==='PARTIALLY_PAID'?'EXPENSE_DOCUMENT_PARTIAL':'EXPENSE_DOCUMENT_UNVERIFIED',
    severity:row.status==='PARTIALLY_PAID'?'LOW':'MEDIUM',transactionId:row.id,amount:row.amount,documentStatus:row.status,documentTotal:row.documentTotal,documentPaymentTotal:row.documentPaymentTotal,cashPaymentTotal:row.cashPaymentTotal,externalPaymentTotal:row.externalPaymentTotal,paymentCount:row.paymentCount,difference:row.difference,remainingDocumentAmount:row.remainingDocumentAmount,paymentSource:row.paymentSource,actorName:row.actorName,at:row.occurredAt
  }));
}
