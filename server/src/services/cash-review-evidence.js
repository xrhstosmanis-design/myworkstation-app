// Read-only evidence. Candidates never change a ledger, review or employee balance.
import {readRecordedCorrections} from './cash-correction-links.js';
import {readCashChatEvidence} from './cash-chat-evidence.js';
const number=value=>Number(value);
const cents=value=>Math.round(number(value)*100);
const instant=value=>new Date(value).getTime();
export const cashEvidenceLimits=Object.freeze({sales:2000,linesPerSale:1000,duplicateSeconds:120});

export function consecutiveSaleCandidates(sales){
  const ordered=[...sales].sort((a,b)=>instant(a.occurredAt)-instant(b.occurredAt)||String(a.saleId).localeCompare(String(b.saleId)));
  const signature=s=>{
    if(!Array.isArray(s.lines)||!s.lines.length||s.lines.length>cashEvidenceLimits.linesPerSale||!Number.isFinite(number(s.total))||number(s.total)<=0)return null;
    const lines=s.lines.map(l=>{
      if(!l.productId||![l.quantity,l.unitPrice,l.discount,l.lineTotal].every(v=>v!=null&&Number.isFinite(number(v)))||number(l.quantity)<=0)return null;
      return [l.productId,String(number(l.quantity)),String(number(l.unitPrice)),String(number(l.discount)),String(number(l.lineTotal))];
    });
    if(lines.some(l=>l===null))return null;
    return JSON.stringify([cents(s.total),lines.map(l=>JSON.stringify(l)).sort()]);
  };
  const findings=[];
  for(let i=1;i<ordered.length;i++){
    const first=ordered[i-1],second=ordered[i],seconds=(instant(second.occurredAt)-instant(first.occurredAt))/1000;
    const basket=signature(first);
    if(first.linked!==true||second.linked!==true||!basket||basket!==signature(second)||!Number.isFinite(seconds)||seconds<0||seconds>cashEvidenceLimits.duplicateSeconds)continue;
    findings.push({code:'SALE_LINE_DUPLICATE_CANDIDATE',at:second.occurredAt,amount:number(second.total),secondsApart:seconds,requiresConfirmation:true,transactions:[first,second].map(s=>({saleId:s.saleId,receiptNumber:s.receiptNumber||null,occurredAt:s.occurredAt,total:number(s.total),payments:s.payments||[],products:s.lines.map(l=>({productId:l.productId,description:l.description,quantity:number(l.quantity),unitPrice:number(l.unitPrice),discount:number(l.discount),lineTotal:number(l.lineTotal)}))}))});
  }
  return findings;
}

export function shiftChainEvidence(session,adjacent){
  const same=row=>row.companyId===session.companyId&&row.storeId===session.storeId&&row.terminalPos===session.terminalPos;
  const rows=[...adjacent.filter(same),session].sort((a,b)=>instant(a.openedAt)-instant(b.openedAt)||String(a.sessionId).localeCompare(String(b.sessionId)));
  const index=rows.findIndex(r=>r.sessionId===session.sessionId),context=rows.map(r=>({sessionId:r.sessionId,terminalPos:r.terminalPos,openedAt:r.openedAt,closedAt:r.closedAt,status:r.status||'CLOSED',operator:r.openedByName||null,variance:r.variance==null?null:number(r.variance),contextOnly:r.sessionId!==session.sessionId}));
  const findings=[];
  if(session.auditRule&&session.auditRule.mode!=='FULL')return {context,findings,nextClosedCount:0};
  for(let j=Math.max(0,index-2);j<=Math.min(rows.length-1,index+2);j++){
    if(j===index)continue;
    const between=rows.slice(Math.min(j,index),Math.max(j,index)+1);
    const linked=between.every((r,k)=>r.closedAt&&r.status!=='OPEN'&&Number.isFinite(number(r.variance))&&(k===0||instant(between[k-1].closedAt)<=instant(r.openedAt)));
    if(!linked)continue;
    const other=rows[j],a=cents(session.variance),b=cents(other.variance),net=a+b;
    if(a*b>=0||Math.abs(net)>Math.max(2,Math.max(Math.abs(a),Math.abs(b))*.2))continue;
    findings.push({code:'SHIFT_CHAIN_OFFSET_CANDIDATE',at:other.openedAt,sessionId:session.sessionId,relatedSessionId:other.sessionId,relatedOperator:other.openedByName||null,originalVariance:a/100,relatedVariance:b/100,netVariance:net/100,shiftDistance:Math.abs(j-index),requiresConfirmation:true,contextOnly:true});
  }
  return {context,findings,nextClosedCount:rows.slice(index+1).filter(r=>r.closedAt&&r.status!=='OPEN').length};
}

// Only immediate same-terminal neighbours are handoffs. Equal variances do not
// establish a counting error and these facts never alter any employee balance.
export function cashHandoffEvidence(session,adjacent){
  if(session.auditRule && session.auditRule.mode!=='FULL')return {status:'NOT_APPLICABLE',rows:[]};
  const same=r=>r.companyId===session.companyId&&r.storeId===session.storeId&&r.terminalPos===session.terminalPos;
  const rows=[...adjacent.filter(same),session].sort((a,b)=>instant(a.openedAt)-instant(b.openedAt)||String(a.sessionId).localeCompare(String(b.sessionId)));
  if(rows.some(r=>!r.sessionId||!r.openedAt||!Number.isFinite(instant(r.openedAt)))||new Set(rows.map(r=>r.sessionId)).size!==rows.length)return {status:'UNAVAILABLE',rows:[]};
  const index=rows.findIndex(r=>r.sessionId===session.sessionId),handoffs=[];
  const amount=v=>v!==null&&v!==undefined&&typeof v!=='boolean'&&String(v).trim()!==''&&Number.isSafeInteger(cents(v))?cents(v):null;
  for(const [previous,next] of [[rows[index-1],session],[session,rows[index+1]]]){
    if(!previous)continue;
    if(!next){handoffs.push({previousSessionId:previous.sessionId,nextSessionId:null,status:'AWAITING_NEXT_SHIFT',difference:null});continue;}
    const closing=amount(previous.actualOperational),opening=amount(next.openingOperational);
    let status='MATCHED',difference=null;
    if((previous.status&&previous.status!=='CLOSED')||!previous.closedAt||!Number.isFinite(instant(previous.closedAt)))status='PREVIOUS_SHIFT_NOT_CLOSED';
    else if(instant(previous.closedAt)>instant(next.openedAt))status='OVERLAP';
    else if(closing===null||opening===null)status='MISSING_AMOUNTS';
    else{difference=(opening-closing)/100;status=difference===0?'MATCHED':'MISMATCH';}
    handoffs.push({previousSessionId:previous.sessionId,nextSessionId:next.sessionId,previousOperator:previous.openedByName||null,
      nextOperator:next.openedByName||null,closedAt:previous.closedAt,openedAt:next.openedAt,
      closingOperational:closing===null?null:closing/100,openingOperational:opening===null?null:opening/100,difference,status,
      nextShiftClosed:(next.status||(next.closedAt?'CLOSED':null))==='CLOSED'&&Boolean(next.closedAt),requiresConfirmation:true});
  }
  return {status:'CONTEXT_ONLY',rows:handoffs,employeeLiabilityAdjusted:false};
}

export async function readCashReviewEvidence(db,session,{includeChat=true}={}){
  if(!session.companyId||!session.storeId||!session.sessionId||!session.terminalPos||!session.openedAt||!session.closedAt)return {findings:[],salesStatus:'UNAVAILABLE',chainStatus:'UNAVAILABLE',context:[],pendingChecks:['SALE_LINE_DUPLICATES','CROSS_PERIOD_SHIFT_CHAIN']};
  const [salesResult,chainResult,chatResult]=await Promise.allSettled([
    db.$queryRaw`
      SELECT s."id" AS "saleId",s."receiptNumber",s."occurredAt",s."total",
        EXISTS (SELECT 1 FROM "StoreTransaction" t WHERE t."companyId"=${session.companyId} AND t."storeId"=${session.storeId} AND t."sessionId"=${session.sessionId} AND t."type" IN ('SALE_CASH','SALE_CARD','SALE_IRIS') AND t."reversedAt" IS NULL AND t."description" LIKE ('POS πώληση ' || s."id" || ' ·%')) AS "linked",
        (SELECT jsonb_agg(jsonb_build_object('productId',l."productId",'description',l."description",'quantity',l."quantity",'unitPrice',l."unitPrice",'discount',l."discount",'lineTotal',l."lineTotal") ORDER BY l."id") FROM (SELECT * FROM "SaleLine" sl WHERE sl."saleId"=s."id" ORDER BY sl."id" LIMIT 1001) l) AS "lines",
        (SELECT jsonb_agg(jsonb_build_object('method',p."method",'amount',p."amount") ORDER BY p."id") FROM "Payment" p WHERE p."saleId"=s."id") AS "payments"
      FROM "Sale" s
      WHERE s."companyId"=${session.companyId} AND s."storeId"=${session.storeId} AND s."status"='COMPLETED' AND s."source"='POS'
        AND s."occurredAt">=${session.openedAt} AND s."occurredAt"<=${session.closedAt}
      ORDER BY s."occurredAt",s."id" LIMIT 2001`,
    db.$queryRaw`
      (SELECT s."id" AS "sessionId",s."companyId",s."storeId",s."terminalPos",s."openedAt",s."closedAt",s."status",s."openedByName",s."variance",s."openingOperational",s."actualOperational"
       FROM "CashShiftSession" s WHERE s."companyId"=${session.companyId} AND s."storeId"=${session.storeId} AND s."terminalPos"=${session.terminalPos} AND s."id"<>${session.sessionId} AND s."openedAt"<${session.openedAt} ORDER BY s."openedAt" DESC,s."id" DESC LIMIT 2)
      UNION ALL
      (SELECT s."id" AS "sessionId",s."companyId",s."storeId",s."terminalPos",s."openedAt",s."closedAt",s."status",s."openedByName",s."variance",s."openingOperational",s."actualOperational"
       FROM "CashShiftSession" s WHERE s."companyId"=${session.companyId} AND s."storeId"=${session.storeId} AND s."terminalPos"=${session.terminalPos} AND s."id"<>${session.sessionId} AND s."openedAt">=${session.openedAt} ORDER BY s."openedAt",s."id" LIMIT 2)`,
    includeChat?readCashChatEvidence(db,session):Promise.resolve({status:'NOT_AUTHORIZED',sources:[],readOnly:true})
  ]);
  const sales=salesResult.status==='fulfilled'?salesResult.value:[];
  const salesStatus=salesResult.status!=='fulfilled'?'UNAVAILABLE':sales.length>cashEvidenceLimits.sales||sales.some(s=>!Array.isArray(s.lines)||!s.lines.length||s.lines.length>cashEvidenceLimits.linesPerSale)?'LIMITED':'LINKED_POS_SCOPE';
  const chain=shiftChainEvidence(session,chainResult.status==='fulfilled'?chainResult.value:[]);
  const chainStatus=chainResult.status!=='fulfilled'?'UNAVAILABLE':chain.nextClosedCount<2?'AWAITING_NEXT_SHIFTS':'CONTEXT_AVAILABLE';
  const candidates=await readRecordedCorrections(db,session,salesStatus==='LINKED_POS_SCOPE'?consecutiveSaleCandidates(sales):[]);
  const handoffs=chainResult.status==='fulfilled'?cashHandoffEvidence(session,chainResult.value):{status:'UNAVAILABLE',rows:[]};
  const chatEvidence=chatResult.status==='fulfilled'?chatResult.value:{status:'UNAVAILABLE',sources:[],readOnly:true};
  return {salesStatus,chainStatus,handoffs,chatEvidence,checkedSales:salesStatus==='LINKED_POS_SCOPE'?sales.filter(s=>s.linked).length:null,duplicateWindowSeconds:cashEvidenceLimits.duplicateSeconds,context:chain.context,findings:[...candidates,...chain.findings],pendingChecks:['SALE_LINE_DUPLICATES','CROSS_PERIOD_SHIFT_CHAIN','CHAT_DOCUMENT_READING_AND_ASSOCIATION'],scope:'LINKED_COMPLETED_POS_SALES_IN_SESSION',readOnly:true};
}
