const amount=value=>Number(value||0);
const round=value=>Number(amount(value).toFixed(2));

export function buildKatShiftReconciliation({sessions=[],auditEvents=[],paymentAttempts=[],fiscalDocuments=[],actionEvents=[]}={}){
  const sessionById=new Map(sessions.map(row=>[row.id,row]));
  const fiscalBySale=new Map();
  for(const row of fiscalDocuments)fiscalBySale.set(row.saleId,(fiscalBySale.get(row.saleId)||0)+1);
  const attemptBySale=new Map();
  for(const row of paymentAttempts)if(!attemptBySale.has(row.saleId))attemptBySale.set(row.saleId,row);
  const totals={store:0,delivery:0,online:0,cash:0,cards:0,returns:0,voids:0,pendingFiscalizations:0};
  const eftposByDevice={},issues=[],sales=[];
  for(const event of auditEvents){
    const details=event.details&&typeof event.details==='object'?event.details:{},saleId=details.saleId;
    if(!saleId)continue;
    const session=sessionById.get(details.sessionId),attempt=attemptBySale.get(saleId),total=round(details.total);
    const online=Boolean(details.onlineOrderId),delivery=attempt?.role==='DELIVERY'||String(attempt?.channel||'').includes('DELIVERY');
    totals[online?'online':delivery?'delivery':'store']=round(totals[online?'online':delivery?'delivery':'store']+total);
    const payments=Array.isArray(details.payments)?details.payments:[];
    for(const payment of payments){if(payment.method==='CASH')totals.cash=round(totals.cash+amount(payment.amount));if(payment.method==='CARD')totals.cards=round(totals.cards+amount(payment.amount))}
    const fiscalCount=fiscalBySale.get(saleId)||0;
    if(fiscalCount!==1){totals.pendingFiscalizations+=1;issues.push({code:fiscalCount>1?'DUPLICATE_FISCAL_DOCUMENT':'PENDING_FISCALIZATION',saleId,count:fiscalCount})}
    if(!session)issues.push({code:'SHIFT_SESSION_MISSING',saleId,sessionId:details.sessionId||null});
    else if(details.terminalPos&&String(session.terminalPos)!==String(details.terminalPos))issues.push({code:'SHIFT_TERMINAL_MISMATCH',saleId,sessionId:session.id,expected:session.terminalPos,actual:details.terminalPos});
    const cardAmount=payments.filter(row=>row.method==='CARD').reduce((sum,row)=>sum+amount(row.amount),0);
    if(cardAmount>0&&!attempt)issues.push({code:'EFTPOS_ATTEMPT_MISSING',saleId});
    if(attempt){eftposByDevice[attempt.eftposDeviceCode||'UNKNOWN']=round((eftposByDevice[attempt.eftposDeviceCode||'UNKNOWN']||0)+amount(attempt.amount));if(attempt.sessionId!==details.sessionId)issues.push({code:'SHIFT_SESSION_MISMATCH',saleId,expected:details.sessionId,actual:attempt.sessionId});if(details.terminalPos&&attempt.terminalPos!==details.terminalPos)issues.push({code:'EFTPOS_TERMINAL_MISMATCH',saleId,expected:details.terminalPos,actual:attempt.terminalPos});if(attempt.status!=='SUCCESS')issues.push({code:'EFTPOS_NOT_SETTLED',saleId,status:attempt.status})}
    sales.push({saleId,sessionId:details.sessionId||null,terminalPos:details.terminalPos||null,total,fiscalCount,eftposAttemptId:attempt?.id||null,status:issues.some(row=>row.saleId===saleId)?'NEEDS_REVIEW':'AGREEMENT'});
  }
  for(const event of actionEvents){const type=String(event.actionType||event.eventType||'').toUpperCase(),value=Math.abs(amount(event.amount||event.details?.reversalTotal||event.details?.total));if(type.includes('RETURN'))totals.returns=round(totals.returns+value);if(type.includes('VOID')||type.includes('CANCEL'))totals.voids=round(totals.voids+value)}
  const terminals=sessions.map(row=>({sessionId:row.id,terminalPos:row.terminalPos,status:row.status,cashSales:amount(row.cashSales),cardSales:amount(row.cardSales),eftposTotal:amount(row.eftposTotal),variance:amount(row.variance),cardVariance:amount(row.cardVariance),closedAt:row.closedAt||null}));
  for(const row of terminals){if(row.status!=='CLOSED')issues.push({code:'SHIFT_NOT_CLOSED',sessionId:row.sessionId,terminalPos:row.terminalPos});if(Math.abs(row.variance)>0.009)issues.push({code:'SHIFT_VARIANCE',sessionId:row.sessionId,terminalPos:row.terminalPos,amount:row.variance});if(Math.abs(row.cardVariance)>0.009)issues.push({code:'POS_EFTPOS_VARIANCE',sessionId:row.sessionId,terminalPos:row.terminalPos,amount:row.cardVariance})}
  return {status:issues.length?'NEEDS_REVIEW':'AGREEMENT',totals:{...totals,eftposByDevice},terminals,sales,issues};
}
