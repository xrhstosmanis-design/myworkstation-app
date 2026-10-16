// Recorded monetary evidence only. Never adjusts a ledger, review or variance.
const cent=value=>value==null||!Number.isFinite(Number(value))?null:Math.round(Number(value)*100);
const validCent=value=>Number.isSafeInteger(value);
const link=description=>String(description||'').match(/^POS (ΑΚΥΡΩΣΗ|ΕΠΙΣΤΡΟΦΗ) ([^ ]+) · αρχική ([^ ]+) ·/);
const method=type=>({SALE_CASH:'CASH',SALE_CARD:'CARD',SALE_IRIS:'IRIS'})[type];

export function linkRecordedCorrections(finding,rows,session,status='AVAILABLE'){
  const origins=new Map();
  for(const row of rows){
    if(row.companyId!==session.companyId||row.storeId!==session.storeId||row.sessionId!==session.sessionId||row.reversedAt!=null)continue;
    const match=link(row.description);if(!match)continue;
    const ids=origins.get(match[2])||new Set();ids.add(match[3]);origins.set(match[2],ids);
  }
  const transactions=(finding.transactions||[]).map(sale=>{
    const original=cent(sale.total),groups=new Map();let invalid=false;
    for(const row of rows){
      if(row.companyId!==session.companyId||row.storeId!==session.storeId||row.sessionId!==session.sessionId||row.reversedAt!=null)continue;
      const match=link(row.description);if(!match||match[3]!==sale.saleId)continue;
      const amount=cent(row.amount),at=new Date(row.occurredAt).getTime(),originalAt=new Date(sale.occurredAt).getTime();
      if(origins.get(match[2])?.size!==1||!row.transactionId||row.correctionSaleId!==match[2]||row.source!=='POS_REVERSAL'||row.status!=='COMPLETED'||!method(row.type)||!validCent(amount)||amount>=0||!Number.isFinite(at)||!Number.isFinite(originalAt)||at<originalAt){invalid=true;continue;}
      const group=groups.get(match[2])||{saleId:match[2],kind:match[1],occurredAt:row.occurredAt,total:cent(row.total),payments:row.payments,rows:[]};
      if(group.rows.some(r=>r.transactionId===row.transactionId)||group.total!==cent(row.total)||new Date(group.occurredAt).getTime()!==at||JSON.stringify(group.payments)!==JSON.stringify(row.payments)){invalid=true;continue;}
      group.rows.push(row);groups.set(match[2],group);
    }
    const corrections=[];
    for(const group of groups.values()){
      const ledger=new Map(),payments=new Map();let sum=0,paySum=0;
      for(const r of group.rows){const n=cent(r.amount);sum+=n;ledger.set(method(r.type),(ledger.get(method(r.type))||0)+n);}
      if(!Array.isArray(group.payments)||!group.payments.length){invalid=true;continue;}
      for(const p of group.payments){const n=cent(p.amount);if(!['CASH','CARD','IRIS'].includes(p.method)||!validCent(n)||n>=0){invalid=true;continue;}paySum+=n;payments.set(p.method,(payments.get(p.method)||0)+n);}
      if(!validCent(sum)||!validCent(group.total)||group.total>=0||sum!==group.total||paySum!==sum||ledger.size!==payments.size||[...ledger].some(([m,n])=>payments.get(m)!==n)){invalid=true;continue;}
      corrections.push({saleId:group.saleId,kind:group.kind,occurredAt:group.occurredAt,amount:sum/100,transactionIds:group.rows.map(r=>r.transactionId),payments:group.payments.map(p=>({method:p.method,amount:Number(p.amount)}))});
    }
    const recorded=corrections.reduce((sum,r)=>sum+cent(r.amount),0),net=original+recorded;
    const state=status!=='AVAILABLE'?status:invalid||!validCent(original)||original<=0||!validCent(recorded)||net<0?'RECHECK_REQUIRED':recorded===0?'NO_RECORDED_CORRECTION':net===0?'FULL_AMOUNT_CORRECTED':'PARTIAL_AMOUNT_CORRECTED';
    const known=['NO_RECORDED_CORRECTION','FULL_AMOUNT_CORRECTED','PARTIAL_AMOUNT_CORRECTED'].includes(state);
    return {...sale,recordedCorrections:{status:state,entries:corrections,originalAmount:validCent(original)?original/100:null,correctionAmount:known?recorded/100:null,recordedNet:known?net/100:null,scope:'SAME_COMPANY_STORE_SESSION',readOnly:true}};
  });
  const known=transactions.length>0&&transactions.every(s=>s.recordedCorrections.recordedNet!==null);
  return {...finding,transactions,recordedCorrectionSummary:{status:known?'AVAILABLE':'RECHECK_REQUIRED',recordedNet:known?transactions.reduce((n,s)=>n+cent(s.recordedCorrections.recordedNet),0)/100:null,readOnly:true}};
}

export async function readRecordedCorrections(db,session,findings){
  if(!findings.length)return findings;
  let rows=[],status='AVAILABLE';
  try{
    rows=await db.$queryRaw`
      SELECT t."id" AS "transactionId",t."companyId",t."storeId",t."sessionId",t."type",t."amount",t."description",t."reversedAt",
        c."id" AS "correctionSaleId",c."source",c."status",c."total",c."occurredAt",
        (SELECT jsonb_agg(jsonb_build_object('method',p."method",'amount',p."amount") ORDER BY p."id") FROM "Payment" p WHERE p."saleId"=c."id") AS "payments"
      FROM "StoreTransaction" t
      CROSS JOIN LATERAL regexp_match(t."description",'^POS (ΑΚΥΡΩΣΗ|ΕΠΙΣΤΡΟΦΗ) ([^ ]+) · αρχική ([^ ]+) ·') AS m(parts)
      LEFT JOIN "Sale" c ON c."id"=m.parts[2] AND c."companyId"=t."companyId" AND c."storeId"=t."storeId"
      JOIN "Sale" o ON o."id"=m.parts[3] AND o."companyId"=t."companyId" AND o."storeId"=t."storeId"
      WHERE t."companyId"=${session.companyId} AND t."storeId"=${session.storeId} AND t."sessionId"=${session.sessionId}
        AND t."type" IN ('SALE_CASH','SALE_CARD','SALE_IRIS') AND t."reversedAt" IS NULL
        AND o."source"='POS' AND o."status"='COMPLETED' AND o."occurredAt">=${session.openedAt} AND o."occurredAt"<=${session.closedAt}
      ORDER BY t."id" LIMIT 2001`;
    if(rows.length>2000)status='LIMITED';
  }catch{status='UNAVAILABLE';}
  return findings.map(f=>linkRecordedCorrections(f,rows,session,status));
}
