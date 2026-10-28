import {invoiceAuditMonth} from './monthly-invoice-audit.js';

const timeZone='Europe/Athens';
const parts=date=>Object.fromEntries(new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
export function invoiceAuditEmailPeriod(month){
 const period=invoiceAuditMonth(month),day=new Date(Date.parse(period.toDayExclusive+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 const target=Date.parse(day+'T23:59:00Z');let instant=target;
 for(let n=0;n<4;n++){const p=parts(new Date(instant));instant+=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)}
 const p=parts(new Date(instant));
 if(`${p.year}-${p.month}-${p.day}`!==day||p.hour!=='23'||p.minute!=='59')throw Object.assign(new Error('Δεν προσδιορίστηκε η ώρα Ελλάδας της μηνιαίας αναφοράς.'),{status:400});
 return {...period,nominalScheduledAt:new Date(instant).toISOString(),nominalLocalTime:day+' 23:59',observationBasis:'PROVISIONAL_AS_OBSERVED'};
}
