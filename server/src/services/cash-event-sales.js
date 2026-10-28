// Read-only audit observations. No finding is an allocation to a cash balance.
export const unmatchedPriceApplication='Δεν επιβεβαιώθηκε εφαρμογή της αλλαγής στις διαθέσιμες πωλήσεις';
export const cashEventSalesLimits=Object.freeze({sales:2000,events:2000,lines:1000,totalLines:10000,findings:500,matchSeconds:120});
const numeric=v=>v!==null&&v!==undefined&&typeof v!=='boolean'&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
const cents=v=>{const n=numeric(v);return n!==null&&Number.isSafeInteger(Math.round(n*100))?Math.round(n*100):null};
const clean=v=>typeof v==='string'&&v.trim()?v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,500):null;
const time=v=>v?new Date(v).getTime():NaN;
const iso=v=>Number.isFinite(time(v))?new Date(v).toISOString():null;
const sameScope=(a,b)=>a.companyId===b.companyId&&a.storeId===b.storeId;
const kinds=new Set(['PRICE_CHANGE','PERMANENT_PRICE_CHANGE','DISCOUNT','DISCOUNT_SET']);

// Confirmations are specific trusted evidence, never product/category defaults.
// The caller must supply the exact sale line and amounts; a name alone cannot
// approve all beer, chocolate, BLU BAR or zero-price water transactions.
function confirmed(confirmations,scope,sale,line,kind){
 return confirmations.some(c=>Boolean(clean(c.lineId))&&Boolean(clean(c.saleId))&&sameScope(c,scope)&&c.kind===kind&&c.saleId===sale.saleId&&c.lineId===line.lineId&&c.productId===line.productId&&c.occurredAt===iso(sale.occurredAt)&&c.quantity===numeric(line.quantity)&&c.unitPriceCents===cents(line.unitPrice)&&c.lineTotalCents===cents(line.lineTotal)&&Boolean(clean(c.evidenceId)));
}

export function compareCashEventSales({scope,sales=[],events=[],confirmations=[]}){
 const empty=status=>({status,findings:[],financialAdjustmentCents:0});
 if(!scope?.companyId||!scope?.storeId||!scope?.sessionId||!Array.isArray(sales)||!Array.isArray(events)||!Array.isArray(confirmations))return empty('UNAVAILABLE');
 if(sales.length>cashEventSalesLimits.sales||events.length>cashEventSalesLimits.events)return empty('LIMITED');
 if(sales.some(s=>!sameScope(s,scope))||events.some(e=>!sameScope(e,scope)))return empty('UNAVAILABLE');
 const eligible=sales.filter(s=>sameScope(s,scope)&&s.sessionId===scope.sessionId&&s.linked===true&&s.status==='COMPLETED'&&s.source==='POS'&&s.saleId&&iso(s.occurredAt)&&numeric(s.total)!==null&&numeric(s.total)>=0);
 if(new Set(eligible.map(s=>s.saleId)).size!==eligible.length||eligible.some(s=>!Array.isArray(s.lines)||s.lines.length>cashEventSalesLimits.lines||s.lines.some(l=>numeric(l.quantity)===null||cents(l.lineTotal)===null)))return empty('LIMITED');
 if(eligible.reduce((n,s)=>n+s.lines.length,0)>cashEventSalesLimits.totalLines)return empty('LIMITED');
 const rows=[];
 for(const sale of eligible)for(const line of sale.lines){
  const quantity=numeric(line.quantity),total=cents(line.lineTotal),unit=cents(line.unitPrice);
  if(quantity===null||quantity<=0||total===null||total<0)continue; // returns are a separate audit
  const rawUnit=numeric(line.unitPrice),gross=rawUnit===null?null:Math.round(rawUnit*quantity*100);
  if(gross!==null&&!Number.isSafeInteger(gross))return empty('LIMITED');
  rows.push({sale,line,quantity,total,unit,gross});
 }
 const relevant=events.filter(e=>sameScope(e,scope)&&kinds.has(e.actionType)&&e.sessionId===scope.sessionId&&iso(e.createdAt));
 const matches=new Map(),used=new Set(),findings=[];
 for(const event of relevant){
  const quantity=numeric(event.quantity),final=cents(event.newPrice),newTotal=cents(event.newTotal);
  // Catalog edits have no sale identity/quantity. Never infer a sale from them.
  const candidates=event.actionType==='PERMANENT_PRICE_CHANGE'?[]:rows.filter(r=>{
   const seconds=(time(r.sale.occurredAt)-time(event.createdAt))/1000;
   if(seconds<0||seconds>cashEventSalesLimits.matchSeconds||!event.productId||event.productId!==r.line.productId||quantity===null||quantity!==r.quantity||final===null||newTotal===null||newTotal!==r.total||Math.round(numeric(event.newPrice)*r.quantity*100)!==r.total)return false;
   if(event.saleId&&event.saleId!==r.sale.saleId)return false;
   // Both actor IDs are from the same native audit/transaction namespace.
   if(!event.actorId||!r.sale.actorId||event.actorId!==r.sale.actorId)return false;
   return !event.lineId||event.lineId===r.line.lineId;
  });
  if(candidates.length===1){const r=candidates[0];if(!matches.has(r))matches.set(r,[]);matches.get(r).push(event);}
 }
 const fact=(r,event,code)=>{
  const original=event?cents(event.oldPrice):r.unit===0?null:r.unit;
  const final=r?Math.round(r.total/r.quantity):cents(event?.newPrice),quantity=r?.quantity??(numeric(event?.quantity)>0?numeric(event.quantity):null);
  const gross=event&&r?Math.round(numeric(event.oldPrice)*r.quantity*100):r?.gross;
  const reduction=r&&original!==null&&Number.isSafeInteger(gross)?Math.max(0,gross-r.total):null;
  return {code,eventId:clean(event?.id),saleId:clean(r?.sale.saleId),transactionNumber:clean(r?.sale.receiptNumber)||clean(r?.sale.saleId),lineId:clean(r?.line.lineId),occurredAt:iso(r?.sale.occurredAt||event?.createdAt),eventAt:iso(event?.createdAt),sessionId:clean(r?.sale.sessionId||event?.sessionId),operatorId:clean(r?.sale.actorId||event?.actorId),operatorName:clean(r?.sale.actorName||event?.actorName),productId:clean(r?.line.productId||event?.productId),productName:clean(r?.line.description||event?.productName),quantity,originalPriceCents:original,finalPriceCents:final,totalReductionCents:reduction};
 };
 for(const r of rows){
  const associated=matches.get(r)||[];
  // Multiple matching edits do not establish which price applied.
  const event=associated.length===1?associated[0]:null;
  if(event)used.add(event);
  if(r.total===0){
   if(!confirmed(confirmations,scope,r.sale,r.line,'PERMITTED_WATER_OWN_USE'))findings.push(fact(r,event,'ZERO_VALUE_SALE'));
  }else if(event||r.gross!==null&&r.gross>r.total){
   if(!confirmed(confirmations,scope,r.sale,r.line,'AUTOMATIC_DISCOUNT'))findings.push(fact(r,event,'SALE_PRICE_REDUCTION'));
  }
 }
 for(const event of relevant)if(!used.has(event))findings.push(fact(null,event,event.actionType==='PERMANENT_PRICE_CHANGE'?'CATALOG_PRICE_CHANGE_UNCONFIRMED':'PRICE_APPLICATION_UNCONFIRMED'));
 if(findings.length>cashEventSalesLimits.findings)return empty('LIMITED');
 return {status:'AVAILABLE',findings,financialAdjustmentCents:0};
}

const money=v=>v===null?'δεν προκύπτει':(v/100).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
export function cashEventSalesText(evidence,{storeName,shiftLabel}={}){
 if(!evidence)return [];
 if(evidence.status!=='AVAILABLE')return ['Ο έλεγχος συμβάντων τιμών και μηδενικών χρεώσεων δεν ολοκληρώθηκε από τις διαθέσιμες πηγές.'];
 return evidence.findings.map(f=>{
  const when=f.occurredAt?new Date(f.occurredAt).toLocaleString('el-GR',{timeZone:'Europe/Athens',dateStyle:'short',timeStyle:'medium',hour12:false}):'χωρίς επιβεβαιωμένη ώρα';
  const subject=f.code==='ZERO_VALUE_SALE'?'Μηδενική χρέωση':f.code==='CATALOG_PRICE_CHANGE_UNCONFIRMED'?'Μόνιμη αλλαγή τιμοκαταλόγου':f.code==='PRICE_APPLICATION_UNCONFIRMED'?'Συμβάν αλλαγής τιμής / έκπτωσης':'Αλλαγή τιμής / έκπτωση πώλησης';
  const details=`${subject}: ${storeName||'κατάστημα μη διαθέσιμο'} · ${when} · ${shiftLabel||'βάρδια'} (${f.sessionId||'χωρίς αντιστοίχιση'}) · ${f.operatorName||'χειριστής μη επιβεβαιωμένος'} (${f.operatorId||'κωδικός μη διαθέσιμος'}) · ${f.productName||f.productId||'είδος μη διαθέσιμο'} · ποσότητα ${f.quantity??'μη διαθέσιμη'} · αρχική τιμή ${money(f.originalPriceCents)} · τελική τιμή ${money(f.finalPriceCents)} · συνολική μείωση ${money(f.totalReductionCents)} · συναλλαγή ${f.transactionNumber||'δεν αντιστοιχίστηκε'}.`;
  return details+(f.code.endsWith('UNCONFIRMED')?' '+unmatchedPriceApplication+'.':f.code==='ZERO_VALUE_SALE'?` Να διευκρινιστεί η μηδενική χρέωση και η διάθεση του είδους. Ώρα για έλεγχο κάμερας: ${when}.`:` Να διευκρινιστεί η αλλαγή τιμής ή έκπτωση. Ώρα για έλεγχο κάμερας: ${when}.`);
 });
}
