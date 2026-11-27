import {consumptionFinancialFilters,readStoreConsumptionFinancialReport} from './store-consumption-financial-report.js';
import {consumptionMonthlyFormat,consumptionTextHash,consumptionMonthlySection,validateConsumptionMonthly} from './consumption-monthly-presentation.js';
import {operationalFinancialReports} from '../../../shared/financial-consumption.mjs';

export async function readMonthlyConsumptionSupplement(db,{companyId,storeId,fromDay,toDay,now=new Date()},reader=readStoreConsumptionFinancialReport){
  const filters=consumptionFinancialFilters({from:fromDay,to:toDay});
  if(fromDay.slice(8)!=='01'||filters.end>now||new Date(Date.parse(toDay)+86400000).toISOString().slice(8,10)!=='01')throw new Error('Απαιτείται ολόκληρος κλεισμένος ημερολογιακός μήνας.');
  const sections=[`ΜΗΝΙΑΙΑ ΑΝΑΛΥΣΗ ΚΑΤΑΣΤΡΟΦΩΝ ΚΑΙ ΙΔΙΟΚΑΤΑΝΑΛΩΣΗΣ · ${fromDay} έως ${toDay}`,
    'Ημερολογιακές ημέρες Ελλάδας, 00:00 έως 24:00. Οι αξίες αναφοράς δεν αποτελούν τζίρο, πληρωμή ή φορολογικό παραστατικό.'];
  for(const [report,{label}] of Object.entries(operationalFinancialReports)){
    let result;
    try{result=await reader(db,{companyId,storeId,report,filters,now})}catch{result=null}
    sections.push(consumptionMonthlySection(label,result));
  }
  let text=sections.join('\n\n');
  if(Buffer.byteLength(text,'utf8')>700000)text=`ΜΗΝΙΑΙΑ ΑΝΑΛΥΣΗ · ${fromDay} έως ${toDay}\nΗ ανάλυση υπερβαίνει το μέγεθος email. Άνοιξε τις Οικονομικές αναφορές για μικρότερο διάστημα. Δεν εμφανίζεται ελλιπές τελικό σύνολο.`;
  return validateConsumptionMonthly({format:consumptionMonthlyFormat,companyId,storeId,fromDay,toDay,text,fingerprint:consumptionTextHash(text)},{companyId,storeId,fromDay,toDay});
}
