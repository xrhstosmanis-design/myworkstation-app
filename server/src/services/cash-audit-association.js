// Shared read-only attribution. Time, equal amounts and operator names are not identities.
const text=value=>typeof value==='string'?value.trim():'';
const detailsOf=event=>event?.details&&typeof event.details==='object'&&!Array.isArray(event.details)?event.details:{};
const primarySaleId=transaction=>text(transaction.saleId)||text(String(transaction.description||'').match(/^POS (?:πώληση|ΕΠΙΣΤΡΟΦΗ ΕΙΔΩΝ|ΕΣΩΤΕΡΙΚΗ ΕΠΙΣΤΡΟΦΗ|ΑΚΥΡΩΣΗ)\s+([^\s·]+)\s+·/u)?.[1]);

export function cashAuditAssociationContext(session,transactions=[]){
  const sessionId=text(session.sessionId)||text(session.id),companyId=text(session.companyId),storeId=text(session.storeId),terminalPos=text(session.terminalPos);
  const own=transactions.filter(t=>(!text(t.companyId)||t.companyId===companyId)&&(!text(t.storeId)||t.storeId===storeId)&&(!text(t.sessionId)||t.sessionId===sessionId));
  return {sessionId,companyId,storeId,terminalPos,transactionIds:new Set(own.map(t=>text(t.id)).filter(Boolean)),saleIds:new Set(own.filter(t=>["SALE_CASH","SALE_CARD","SALE_IRIS"].includes(t.type)).map(primarySaleId).filter(Boolean))};
}

export function classifyCashAuditEvent(context,event){
  const details=detailsOf(event),unassigned=reason=>({scope:'UNASSIGNED',reason}),other=reason=>({scope:'OTHER_SESSION',reason});
  if(!context.sessionId||!context.companyId||!context.storeId)return unassigned('MISSING_SESSION_IDENTITY');
  for(const [key,value] of [['companyId',context.companyId],['storeId',context.storeId]]){
    if([event?.[key],details[key]].some(v=>text(v)&&text(v)!==value))return other('FOREIGN_'+key.toUpperCase());
  }
  const terminals=[event?.terminalPos,details.terminalPos].map(text).filter(Boolean);
  if(terminals.some(v=>!context.terminalPos||v!==context.terminalPos))return other('DIFFERENT_TERMINAL');
  const sessions=[event?.sessionId,details.sessionId].map(text).filter(Boolean);
  if(sessions.some(id=>id!==context.sessionId))return other('DIFFERENT_SESSION');
  if(sessions.length)return {scope:'SESSION',reason:'EXPLICIT_SESSION'};
  const transactionId=text(details.transactionId)||text(event?.transactionId);
  if(transactionId){
    if(context.transactionIds.has(transactionId))return {scope:'SESSION',reason:'LEDGER_TRANSACTION'};
    return unassigned('UNKNOWN_TRANSACTION');
  }
  // Never use relatedSaleId/originalSaleId: they may reference a different shift.
  const primaryIds=[event?.saleId,details.saleId,details.reversalSaleId].map(text).filter(Boolean);
  if(new Set(primaryIds).size>1)return unassigned('CONFLICTING_PRIMARY_SALE');
  if(primaryIds.length&&context.saleIds.has(primaryIds[0]))return {scope:'SESSION',reason:'PRIMARY_SALE_IN_LEDGER'};
  return unassigned(primaryIds.length?'UNLINKED_PRIMARY_SALE':'NO_EXPLICIT_LINK');
}

export function partitionCashAuditEvents(session,transactions,events){
  const context=cashAuditAssociationContext(session,transactions),linked=[],unassigned=[],excluded=[];
  for(const event of events){const association=classifyCashAuditEvent(context,event);if(association.scope==='SESSION')linked.push(event);else if(association.scope==='OTHER_SESSION')excluded.push({...event,association});else unassigned.push({...event,association});}
  return {linked,unassigned,excluded};
}
