export function invoiceAuditMonth(month){
 if(typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Object.assign(new Error('Επίλεξε έγκυρο μήνα.'),{status:400,code:'INVOICE_MONTH_AUDIT_INVALID'});
 const first=month+'-01',next=new Date(first+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
 return {month,fromDay:first,toDayExclusive:next.toISOString().slice(0,10),basis:'DOCUMENT_ISSUE_DATE',timeZone:'Europe/Athens'};
}
