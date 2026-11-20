import {greeceRangeDate} from '../../../../shared/greece-time.mjs';
import {exact,shape,near} from './companyInventoryReportValidation.js';
const unique=(rows,key)=>Array.isArray(rows)&&new Set(rows.map(row=>row?.[key])).size===rows.length;
export function partyDirectoryValid(data,companyId,customer){
 const fields=customer?{id:'s',name:'s',phone:'s?',email:'s?',discountPercent:'n?',creditLimit:'n?',balance:'n?',active:'b'}:{id:'s',name:'s',taxId:'s?',email:'s?',phone:'s?',city:'s?',active:'b'};
 const numeric=value=>value===null||typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value));
 return exact(data,['scope','companyId','items'])&&data.scope==='COMPANY'&&data.companyId===companyId&&unique(data.items,'id')&&data.items.length<=10000&&data.items.every(row=>shape(customer?{...row,discountPercent:null,creditLimit:null,balance:null}:row,fields)&&(!customer||['discountPercent','creditLimit','balance'].every(key=>Object.hasOwn(row,key)&&numeric(row[key])))&&row.id.length>0&&row.name.length>0);
}
const invoice={id:'s',documentType:'s',status:'s',sourceType:'s',storeName:'s',documentNumber:'s?',supplierId:'s?',supplierName:'s?',supplierCategory:'s?',documentDate:'t',totalNet:'n',totalVat:'n',totalGross:'n'};
const payment={id:'s',storeName:'s',description:'s?',actorName:'s?',attachmentFilename:'s?',supplierId:'s?',supplierName:'s?',taxId:'s?',occurredAt:'t',reversedAt:'t?',amount:'n'};
const purchase={supplierId:'s',supplierName:'s',documents:'i',net:'n',vat:'n',gross:'n',percentOfTotal:'n?'};
const turnover={customerId:'s',customerName:'s',taxId:'s?',visits:'i',reversalCount:'i',subtotal:'n',discount:'n',turnover:'n',returns:'n'};
export function partyReportValid(data,{companyId,capability,from,to,partyId,q,choices}){
 const customer=capability==='reports-customer-turnover.read',invoices=capability==='reports-supplier-invoices.read',payments=capability==='reports-supplier-payments.read',purchases=capability==='reports-supplier-purchases.read';
 const key=customer?'customerId':'supplierId',windowed=invoices||payments,extra=purchases?['basis','note']:customer?['reversalAware']:['q'];
 if(!exact(data,['scope','companyId','from','to',key,'items','count','summary','window',...extra])||data.scope!=='COMPANY'||data.companyId!==companyId||data.from!==from||data.to!==to||data[key]!==partyId||(windowed&&data.q!==q)||!Array.isArray(data.items)||data.count!==data.items.length||!exact(data.window,['limit','kind'])||data.window.limit!==(windowed?3000:10000)||data.window.kind!==(windowed?'NATIVE_WINDOW':'COMPLETE_FILTERED_GROUPS')||data.items.length>data.window.limit)return false;
 const fields=invoices?invoice:payments?payment:purchases?purchase:turnover,start=greeceRangeDate(from).getTime(),end=greeceRangeDate(to,true).getTime();
 if(!unique(data.items,windowed?'id':key)||!data.items.every(row=>shape(row,fields)&&(!windowed||row.id.length>0)&&(row[key]===null?partyId===null:row[key].length>0&&choices.some(party=>party.id===row[key])&&(!partyId||row[key]===partyId))&&(!windowed||Date.parse(row[invoices?'documentDate':'occurredAt'])>=start&&Date.parse(row[invoices?'documentDate':'occurredAt'])<=end)))return false;
 const sum=field=>data.items.reduce((total,row)=>total+row[field],0),summary=data.summary;
 if(invoices)return shape(summary,{count:'i',net:'n',vat:'n',gross:'n'})&&summary.count===data.count&&[['net','totalNet'],['vat','totalVat'],['gross','totalGross']].every(([total,field])=>near(summary[total],sum(field)));
 if(payments)return shape(summary,{count:'i',total:'n',reversed:'i'})&&summary.count===data.count&&summary.reversed===data.items.filter(row=>row.reversedAt!==null).length&&near(summary.total,data.items.reduce((total,row)=>total+(row.reversedAt===null?row.amount:0),0));
 if(purchases)return data.basis==='APPROVED_DOCUMENT_AMOUNTS'&&data.note==='Τα ποσά διατηρούν το πρόσημο των εγκεκριμένων παραστατικών της πηγής· δεν αποτελούν συμφωνημένο υπόλοιπο προμηθευτή.'&&shape(summary,{documents:'i',net:'n',vat:'n',gross:'n'})&&['documents','net','vat','gross'].every(field=>near(summary[field],sum(field)))&&data.items.every(row=>summary.gross===0?row.percentOfTotal===null:near(row.percentOfTotal,row.gross/summary.gross*100));
 return customer&&data.reversalAware===true&&shape(summary,{customers:'i',visits:'i',turnover:'n',discount:'n',returns:'n',reversalCount:'i'})&&summary.customers===data.count&&['visits','turnover','discount','returns','reversalCount'].every(field=>near(summary[field],sum(field)));
}
