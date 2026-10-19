import {salesReportCalendar} from './sales-report-calendar.js';

const invalid=message=>Object.assign(new Error(message),{status:400});
const invalidMoney=()=>Object.assign(new Error('Ο τζίρος της σύγκρισης είναι μη ασφαλής, υπερβολικά μεγάλος ή δεν συμφωνεί με τις πλήρεις γραμμές.'),{status:502});
// Conservative Number precision guard for this opt-in comparison only. At
// 2**40 EUR the ULP is 2**-12 EUR, well below one cent. This is not a
// currency, capacity or financial-finality certification.
export const SALES_COMPARISON_MAX_GROSS_CENTS=2**40*100;
const limits=['NOT_WEEKDAY_OR_SEASONAL_EQUIVALENCE','NOT_FINAL_FINANCIAL_RECONCILIATION'];
const dayCount=(from,to)=>(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000+1;
const describe=calendar=>({calendarFrom:calendar.calendarFrom,calendarTo:calendar.calendarTo,from:calendar.from.toISOString(),toExclusive:calendar.to.toISOString(),elapsedHours:(calendar.to-calendar.from)/3600000});

// Ended calendar days are not closed shifts, equivalent trading conditions or
// reconciled financial periods. One trusted server time evaluates both ranges.
export function salesComparisonPolicy(filters,now=new Date()){
  const {companyId,storeId,calendar,from,to,compareFrom,compareTo,q}=filters;
  if(typeof companyId!=='string'||!companyId.trim()||companyId!==companyId.trim()||typeof storeId!=='string'||!storeId.trim()||storeId!==storeId.trim()||calendar?.timeZone!=='Europe/Athens')throw invalid('Η σύγκριση απαιτεί συγκεκριμένο κατάστημα και Ώρα Ελλάδας.');
  if(typeof compareFrom!=='string'||typeof compareTo!=='string'||!compareFrom||!compareTo)throw invalid('Επίλεξε έγκυρες ημερομηνίες από και έως για τη σύγκριση.');
  if(q!==undefined&&q!==null&&typeof q!=='string')throw invalid('Μη έγκυρο φίλτρο αναζήτησης.');
  const current=salesReportCalendar(calendar.calendarFrom,calendar.calendarTo),previous=salesReportCalendar(compareFrom,compareTo),asOf=new Date(now);
  if(!(from instanceof Date)||!(to instanceof Date)||from.getTime()!==current.from.getTime()||to.getTime()!==current.to.getTime()||!Number.isFinite(asOf.getTime()))throw invalid('Δεν συμφωνούν τα όρια της σύγκρισης.');
  const days=dayCount(current.calendarFrom,current.calendarTo);
  if(days!==dayCount(previous.calendarFrom,previous.calendarTo))throw invalid('Επίλεξε δύο περιόδους με ίδιο πλήθος ημερολογιακών ημερών.');
  if(previous.to>current.from)throw invalid('Η περίοδος σύγκρισης πρέπει να προηγείται χωρίς επικάλυψη.');
  if(current.to>asOf||previous.to>asOf)throw invalid('Η σύγκριση απαιτεί ημερολογιακές ημέρες που έχουν ολοκληρωθεί σε ώρα Ελλάδας.');
  return {policy:'EQUAL_ENDED_ATHENS_CALENDAR_DAYS',timeZone:'Europe/Athens',companyId,storeId,query:q||null,asOf:asOf.toISOString(),dayCount:days,currentPeriod:describe(current),previousPeriod:describe(previous)};
}

function completeSource(report,period,policy){
  const c=report?.sourceCoverage,integer=v=>Number.isSafeInteger(v)&&v>=0;
  return !!(report&&report.companyId===policy.companyId&&report.storeId===policy.storeId&&report.period?.timeZone==='Europe/Athens'&&report.period.calendarFrom===period.calendarFrom&&report.period.calendarTo===period.calendarTo&&report.period.from===period.from&&report.period.toExclusive===period.toExclusive&&Array.isArray(report.items)&&report.count===report.items.length&&report.reversalAware===true&&integer(report.normalSaleCount)&&integer(report.reversalCount)&&(report.items.length?report.normalSaleCount>0||report.reversalCount>0:report.normalSaleCount===0&&report.reversalCount===0)&&c&&typeof c==='object'&&!Array.isArray(c)&&c.complete===true&&c.totalsScope==='COMPLETE_SOURCE'&&integer(c.limit)&&c.limit>0&&c.limit<=10000&&integer(c.returnedGroupCount)&&integer(c.totalGroupCount)&&c.returnedGroupCount===report.items.length&&c.totalGroupCount===c.returnedGroupCount&&c.totalGroupCount<=c.limit);
}
function cents(value){
  if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>SALES_COMPARISON_MAX_GROSS_CENTS/100)throw invalidMoney();
  const result=Math.round(value*100);
  // A row is the SQL numeric gross aggregate converted to Number, not a JS
  // addition result. Require an exact cent roundtrip; do not round uncertainty.
  if(!Number.isSafeInteger(result)||value!==result/100)throw invalidMoney();
  return Object.is(result,-0)?0:result;
}
function grossCents(report){
  if(typeof report.totalGross!=='number'||!Number.isFinite(report.totalGross))throw invalidMoney();
  const sum=report.items.reduce((total,row)=>total+BigInt(cents(row?.grossSales)),0n);
  const bound=BigInt(SALES_COMPARISON_MAX_GROSS_CENTS);
  // Canonical totalGross deliberately retains its original JS reduce, whose
  // addition noise is not a genuine sub-cent source amount. Certify exact cents
  // from complete checked SQL rows, while refusing any altered stated total.
  if(sum>bound||sum< -bound||report.totalGross!==report.items.reduce((total,row)=>total+row.grossSales,0))throw invalidMoney();
  return Number(sum);
}

export function summarizeSalesComparison(current,previous,policy){
  const base={...policy,coverage:{current:current?.sourceCoverage??null,previous:previous?.sourceCoverage??null},financialFinality:'PROVISIONAL',financialReconciliationComplete:false,basisLimitations:[...limits]};
  if(!completeSource(current,policy.currentPeriod,policy)||!completeSource(previous,policy.previousPeriod,policy))return {...base,status:'SOURCE_LIMITED',unavailableReason:'SOURCE_LIMITED'};
  const currentGrossCents=grossCents(current),previousGrossCents=grossCents(previous),delta=BigInt(currentGrossCents)-BigInt(previousGrossCents);
  if(delta>BigInt(Number.MAX_SAFE_INTEGER)||delta<BigInt(-Number.MAX_SAFE_INTEGER))throw invalidMoney();
  const deltaGrossCents=Number(delta),revenueChangePercent=previousGrossCents>0?(deltaGrossCents/previousGrossCents)*100:null;
  if(revenueChangePercent!==null&&!Number.isFinite(revenueChangePercent))throw invalidMoney();
  return {...base,status:'AVAILABLE',currentGrossCents,previousGrossCents,deltaGrossCents,revenueChangePercent,percentUnavailableReason:previousGrossCents===0?'ZERO_BASE':previousGrossCents<0?'NEGATIVE_BASE':null};
}

export async function readSalesReportComparison(filters,{db,readReport,now=new Date()}){
  const policy=salesComparisonPolicy(filters,now);
  const {compareFrom,compareTo,...currentFilters}=filters;
  const {includeHourly,...previousFilters}=currentFilters;
  const previousCalendar=salesReportCalendar(compareFrom,compareTo);
  return db.$transaction(async tx=>{
    const owned=await tx.store.findFirst({where:{id:policy.storeId,companyId:policy.companyId,active:true},select:{id:true,companyId:true}});
    if(!owned||owned.id!==policy.storeId||owned.companyId!==policy.companyId)throw Object.assign(new Error('Δεν βρέθηκε ενεργό κατάστημα στην επιλεγμένη εταιρεία.'),{status:404});
    const current=await readReport(currentFilters,{db:tx});
    const previous=await readReport({...previousFilters,calendar:previousCalendar,from:previousCalendar.from,to:previousCalendar.to},{db:tx});
    return {...current,comparison:summarizeSalesComparison(current,previous,policy)};
  },{isolationLevel:'RepeatableRead',maxWait:5000,timeout:15000});
}
