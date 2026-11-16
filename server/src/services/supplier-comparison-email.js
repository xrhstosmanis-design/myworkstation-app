import {createHash} from 'node:crypto';
import {invoiceAuditMonth} from "./invoice-audit-month.js";
import {readSupplierComparison} from './supplier-comparison-report.js';

const text=(value,max=160)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';

export function supplierComparisonEmailLines(supplierComparison){
  const unitCost=new Intl.NumberFormat('el-GR',{style:'currency',currency:'EUR',maximumFractionDigits:6});
  const lines=['Μηνιαία σύγκριση προμηθευτών',`Προϊόντα από τουλάχιστον δύο προμηθευτές: ${supplierComparison.length}`];
  for(const product of supplierComparison){
   lines.push(text(product.productName));
   for(const supplier of product.suppliers){
    const cost=supplier.lastCost===null?'Κόστος μη διαθέσιμο':`${unitCost.format(supplier.lastCost)} ανά ${text(product.unitLabel,32)}`;
    const difference=supplier.differenceFromLowestCost;
    const comparison=difference===null?'':difference===0?' · Χαμηλότερο συγκρίσιμο κόστος':` · +${unitCost.format(difference)} ανά ${text(product.unitLabel,32)}`;
    lines.push(`  ${text(supplier.supplierName)} · ${cost}${comparison}`);
   }
  }
  return lines;
}

export async function readMonthlySupplierEmail(db,{companyId,storeId,storeName,month=completedSupplierReportMonth(new Date())}){
  invoiceAuditMonth(month);
  const comparison=await readSupplierComparison(db,{companyId,storeId,month});
  const name=text(storeName||storeId);
  const message = {
    subject:`Σύγκριση προμηθευτών ${month} - ${name}`,
    body:[`Κατάστημα: ${name}`,`Μήνας αγορών: ${month}`,'',...supplierComparisonEmailLines(comparison)].join('\n')
  };
  const fingerprint=createHash('sha256')
    .update(JSON.stringify([companyId,storeId,month,message.subject,message.body]))
    .digest('hex');
  return {...message,month,fingerprint};
}

const athensMonth = new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Europe/Athens',year:'numeric',month:'2-digit'
});

export function completedSupplierReportMonth(now){
  const parts=athensMonth.formatToParts(now);
  const year=Number(parts.find(part=>part.type==='year').value);
  const month=Number(parts.find(part=>part.type==='month').value);
  return new Date(Date.UTC(year,month-2,1)).toISOString().slice(0,7);
}

export const SUPPLIER_COMPARISON_PAYLOAD_FORMAT='MWS_AUTOMATIC_SUPPLIER_COMPARISON_PAYLOAD_V1';

export async function buildAutomaticSupplierPayload(db,{companyId,storeId,storeName,month,period,settingsVersion}){
  const message=await readMonthlySupplierEmail(db,{companyId,storeId,storeName,month});
  const content={
    format:SUPPLIER_COMPARISON_PAYLOAD_FORMAT,
    scope:{companyId,storeId},
    frequency:'MONTHLY',
    period,
    settingsVersion,
    sourceFingerprint:message.fingerprint,
    financialFinality:'PROVISIONAL',
    financialLimitations:['Κόστος από τις καταχωρισμένες αγορές του μήνα.'],
    financialReconciliationComplete:false,
    employeeLiabilityAdjusted:false,
    subject:message.subject,
    text:message.body
  };
  const body=JSON.stringify(content);
  const {format,scope,frequency,sourceFingerprint,financialFinality,financialLimitations}=content;
  return {format,scope,frequency,period,sourceFingerprint,financialFinality,financialLimitations,
    contentType:'application/json; charset=utf-8',body,byteLength:Buffer.byteLength(body),
    payloadFingerprint:createHash('sha256').update(body).digest('hex')};
}
