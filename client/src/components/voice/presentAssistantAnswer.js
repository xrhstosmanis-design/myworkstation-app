import {formatAssistantEuroText} from "./formatAssistantEuroText.js";
export const assistantMoney=n=>Number(n).toLocaleString("el-GR",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2});
export const assistantQuantity=n=>Number(n).toLocaleString("el-GR",{maximumFractionDigits:3});
export const assistantUnit=u=>({PIECE:"τεμάχια",KG:"κιλά",LITER:"λίτρα",PACKAGE:"συσκευασίες"})[u]||"μη καταγεγραμμένη μονάδα";
const finite=(r,keys)=>keys.every(k=>typeof r[k]==="number"&&Number.isFinite(r[k]));
export function presentAssistantAnswer(result){
  if(!result)return null;
  const fallback={answer:formatAssistantEuroText(result.answer),highlights:(result.highlights||[]).map(formatAssistantEuroText),limitations:formatAssistantEuroText(result.limitations)};
  const evidence=result.evidence||[];
  if(evidence.length===1&&evidence[0].kind==="sales_by_store"){
    const report=evidence[0];
    if(report.result==="ambiguous")return {...fallback,answer:`Διευκρίνισε την ονομασία ή συσκευασία για «${report.unresolvedName}»: ${(report.candidates||[]).join(" · ")}. Δεν χρειάζεται να γνωρίζεις SKU.`,highlights:[]};
    if(report.result==="no_match")return {...fallback,answer:"Δεν βρέθηκε αντίστοιχη ονομασία ή διαθέσιμο εξουσιοδοτημένο κατάστημα. Έλεγξε την ονομασία. Αυτό δεν αποδεικνύει μηδενικές πωλήσεις.",highlights:[]};
    if(report.result==="source_limited")return {...fallback,answer:report.reason||"Η αναζήτηση έφτασε το όριο ασφαλούς ανάγνωσης. Επίλεξε λιγότερα καταστήματα ή στενότερο φίλτρο· δεν εμφανίζεται πλήρες σύνολο.",highlights:[]};
    if(["matched","no_sales"].includes(report.result)&&Array.isArray(report.stores)&&report.stores.length&&report.stores.every(s=>s.grossSales===null||typeof s.grossSales==="number"&&Number.isFinite(s.grossSales))){
      const period=`${report.from} έως ${report.to}${report.incompletePeriod?` · μη ολοκληρωμένη περίοδος, στοιχεία έως ${report.asOf}`:""}`;
      const summary=report.totals&&typeof report.totals.grossSales==="number"&&Number.isFinite(report.totals.grossSales)?`Συνολικός τζίρος: ${assistantMoney(report.totals.grossSales)}.`:"Υπάρχουν μη διαθέσιμες πηγές· δεν εμφανίζεται πλήρες σύνολο.";
      return {...fallback,answer:`Πωλήσεις ανά κατάστημα · ${period}.\n${summary} Δες τη λίστα καταστημάτων και ειδών παρακάτω.`,highlights:[],limitations:"Μόνο καταγεγραμμένες ολοκληρωμένες μη πιστωτικές πωλήσεις, με επιστροφές / ακυρώσεις συνυπολογισμένες. Οι ποσότητες διαφορετικών μονάδων εμφανίζονται χωριστά. "+(report.mode==="offers"?"Μόνο πωλήσεις με καταγεγραμμένη εφαρμοσμένη προσφορά· παλιότερες πωλήσεις δεν αποδίδονται αναδρομικά. ":"")+(fallback.limitations||"")};
    }
  }
  // Only complete, single-product canonical sources replace model prose.
  // Cash, mixed, ambiguous, capped and malformed evidence keep their answer.
  if(!evidence.length||evidence.some(e=>!["product_sales","product_stock"].includes(e.kind)||e.result!=="matched"||e.truncated||!Array.isArray(e.rows)||e.rows.length!==1||!e.companyId||!e.storeId||typeof e.rows[0].name!=="string"))return fallback;
  const first=evidence[0];if(evidence.some(e=>e.companyId!==first.companyId||e.storeId!==first.storeId||e.rows[0].productId!==first.rows[0].productId))return fallback;
  const lines=[];
  for(const e of evidence){const r=e.rows[0],name=`${r.name}${r.sku?` (SKU ${r.sku})`:""}`;
    if(e.kind==="product_sales"){
      if(!finite(r,["salesQuantity","grossSales","netSales","vatValue"]))return fallback;
      lines.push(`${name}, ${e.from} έως ${e.to}: ποσότητα πωλήσεων ${assistantQuantity(r.salesQuantity)}, τζίρος ${assistantMoney(r.grossSales)}, καθαρή αξία ${assistantMoney(r.netSales)}, ΦΠΑ ${assistantMoney(r.vatValue)}.`);
    }else{
      if(!finite(r,["currentStock"])||typeof r.unit!=="string")return fallback;
      lines.push(`${name}: τρέχον καταγεγραμμένο απόθεμα ${assistantQuantity(r.currentStock)} ${assistantUnit(r.unit)}.`);
    }
  }
  return {...fallback,answer:`${first.companyName?first.companyName+" · ":""}${first.storeName}\n${lines.join("\n")}`,highlights:[]};
}
