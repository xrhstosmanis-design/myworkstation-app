import {businessReportAnswer} from '../../../../shared/assistant-business-answer.mjs';
import {formatAssistantEuroText} from "./formatAssistantEuroText.js";
export const assistantMoney=n=>Number(n).toLocaleString("el-GR",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2});
export const assistantQuantity=n=>Number(n).toLocaleString("el-GR",{maximumFractionDigits:3});
export const assistantUnit=u=>({PIECE:"τεμάχια",KG:"κιλά",LITER:"λίτρα",PACKAGE:"συσκευασίες"})[u]||"μη καταγεγραμμένη μονάδα";
const finite=(r,keys)=>keys.every(k=>typeof r[k]==="number"&&Number.isFinite(r[k]));
export function presentAssistantAnswer(result){
  if(!result)return null;
  const fallback={answer:formatAssistantEuroText(result.answer),highlights:(result.highlights||[]).map(formatAssistantEuroText),limitations:formatAssistantEuroText(result.limitations)};
  const evidence=result.evidence||[];
  if(evidence.length===1&&evidence[0].kind==="business_records")return businessReportAnswer(evidence[0]);
  if(evidence.length===1&&evidence[0].kind==="consumption"){
    const r=evidence[0],label=r.consumptionKind==="PRODUCT_DESTRUCTION"?"Καταστροφή προϊόντων":"Ιδιοκατανάλωση",period=`${r.storeName} · ${r.from} έως ${r.to}`;
    if(r.result==="source_limited")return {...fallback,answer:`${label} · ${period}.\n${r.reason} Δεν εξάγεται πλήρες ή μηδενικό αποτέλεσμα.`,highlights:[],limitations:"Απαιτείται μικρότερη περίοδος ή έλεγχος της κανονικής αναφοράς Συμβάντων."};
    if(r.result==="no_records")return {...fallback,answer:`${label} · ${period}. Δεν βρέθηκαν καταχωρημένα συμβάντα${r.productQuery?` με φίλτρο «${r.productQuery}»`:""}.`,highlights:[],limitations:"Μόνο το επιλεγμένο κατάστημα και το συγκεκριμένο διάστημα."};
    if(r.result==="matched"&&Array.isArray(r.rows)&&r.rows.length)return {...fallback,answer:`${label} · ${period}.\nΒρέθηκαν ${r.rows.length} καταχωρημένες γραμμές ειδών. Δες τη λίστα παρακάτω.`,highlights:[],limitations:"Μόνο το επιλεγμένο κατάστημα. Η αξία αναφοράς δεν είναι τζίρος, πληρωμή ή κόστος αγοράς."};
  }
  if(evidence.length===1&&evidence[0].kind==="sales_by_store"){
    const report=evidence[0];
    fallback.limitations=result.sourceOnly?"Η σύνοψη του AI δεν ολοκληρώθηκε· εμφανίζονται μόνο τα στοιχεία της αναγνωσμένης πηγής.":"";
    if(report.result==="ambiguous")return {...fallback,answer:`Διευκρίνισε την ονομασία ή συσκευασία για «${report.unresolvedName}»: ${(report.candidates||[]).join(" · ")}. Δεν χρειάζεται να γνωρίζεις SKU.`,highlights:[]};
    if(report.result==="no_match")return {...fallback,answer:report.reason==="catalog_name_not_found"?`Δεν βρέθηκε αντιστοίχιση στον κατάλογο των επιλεγμένων καταστημάτων. Αυτό δεν αποδεικνύει μηδενικές πωλήσεις.${report.categoryCandidates?.length?` Καταγεγραμμένες κατηγορίες: ${report.categoryCandidates.join(" · ")}.`:""}`:"Δεν βρέθηκε αντίστοιχη ονομασία ή διαθέσιμο εξουσιοδοτημένο κατάστημα. Έλεγξε την ονομασία. Αυτό δεν αποδεικνύει μηδενικές πωλήσεις.",highlights:[]};
    if(report.result==="source_limited")return {...fallback,answer:report.reason||"Η αναζήτηση έφτασε το όριο ασφαλούς ανάγνωσης. Επίλεξε λιγότερα καταστήματα ή στενότερο φίλτρο· δεν εμφανίζεται πλήρες σύνολο.",highlights:[]};
    if(["matched","no_sales"].includes(report.result)&&Array.isArray(report.stores)&&report.stores.length&&report.stores.every(s=>s.grossSales===null||typeof s.grossSales==="number"&&Number.isFinite(s.grossSales))){
      const period=`${report.from} έως ${report.to}${report.incompletePeriod?` · μη ολοκληρωμένη περίοδος, στοιχεία έως ${report.asOf}`:""}`;
      const summary=report.totals&&typeof report.totals.grossSales==="number"&&Number.isFinite(report.totals.grossSales)?`Συνολικός τζίρος: ${assistantMoney(report.totals.grossSales)}.`:"Υπάρχουν μη διαθέσιμες πηγές· δεν εμφανίζεται πλήρες σύνολο.";
      return {...fallback,answer:`Πωλήσεις ανά κατάστημα · ${period}.\n${summary} Δες τη λίστα καταστημάτων και ειδών παρακάτω.`,highlights:[],limitations:"Μόνο καταγεγραμμένες ολοκληρωμένες μη πιστωτικές πωλήσεις, με επιστροφές / ακυρώσεις συνυπολογισμένες. Οι ποσότητες διαφορετικών μονάδων εμφανίζονται χωριστά. "+(report.mode==="offers"?"Μόνο πωλήσεις με καταγεγραμμένη εφαρμοσμένη προσφορά· παλιότερες πωλήσεις δεν αποδίδονται αναδρομικά. ":"")+(report.mode==="family"?"Όλες οι καταγεγραμμένες συσκευασίες που ταιριάζουν στην ονομασία, χωριστά ανά είδος. ":"")+(fallback.limitations||"")};
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
