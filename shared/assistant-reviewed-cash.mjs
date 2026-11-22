import {normalizeBusinessText,businessQuestionParts} from './assistant-business.mjs';
export const reviewedCashToolName='cash_review';
export const reviewedCashKind='cash_reviewed';
export function reviewedCashQuestion(question){
 const p=businessQuestionParts(question),q=normalizeBusinessText([p.current,p.topic].join(' '));
 return /ταμει|μετρητ|\bpos\b|\beftpos\b|\bcash\b/.test(q)&&/ελεγχ|ελενξ|αναφορ|αναλυσ|επανυπολογισ|συμψηφ|ελλειμ|πλεονασ|διαφορ/.test(q);
}
export function explicitlyReviewedCashQuestion(question){return reviewedCashQuestion(question)&&/επανυπολογισ|συμψηφ|τελικ|μετα (?:απο )?ελεγχο/.test(normalizeBusinessText(question));}
export function reviewedCashAnswer(evidence){
 const reports=Array.isArray(evidence)?evidence.filter(r=>r?.kind===reviewedCashKind):[];if(!reports.length)return null;
 if(reports.length>2||reports.some(r=>typeof r.text!=='string'||!r.text||r.text.length>150000||!r.companyId||!r.storeId||!r.from||!r.to||r.financialFinality!=='REVIEWED_CASH_ROWS_ONLY'))return {answer:'Δεν επιβεβαιώθηκε η αναφορά ελέγχου ταμείων. Ανανέωσε την ίδια αναζήτηση.',highlights:[],sources:[],limitations:'Δεν εμφανίζεται εκτίμηση ή παλιό αποτέλεσμα.',canonicalCash:true};
 return {answer:reports.map(r=>r.text).join('\n\n'),highlights:[],sources:['Έλεγχος ταμείων'],limitations:'',canonicalCash:true};
}
