import {businessQuestionPeriod,businessPeriodResolution} from './assistant-business-period.js';
export {businessQuestionPeriod} from './assistant-business-period.js';
import {z} from 'zod';
import {prisma} from '../prisma.js';
import {salesReportCalendar} from './sales-report-calendar.js';
import {businessDomains,businessMoneyDomains,currentBusinessDomains,assistantBusinessDomain,normalizeBusinessText,businessQuestionParts} from '../../../shared/assistant-business.mjs';
import {businessReportAnswer} from '../../../shared/assistant-business-answer.mjs';
export {assistantBusinessDomain};
export const businessArguments=z.object({domain:z.enum(Object.keys(businessDomains)),from:z.string().nullable(),to:z.string().nullable(),query:z.string().trim().max(120).nullable(),status:z.string().trim().max(30).nullable()}).strict().superRefine((a,c)=>{
 if(currentBusinessDomains.includes(a.domain)){if(a.from!==null||a.to!==null)c.addIssue({code:'custom',message:'Ο κατάλογος είναι τρέχων, όχι ιστορικός.'});}
 else try{if(typeof a.from!=='string'||typeof a.to!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(a.from)||!/^\d{4}-\d{2}-\d{2}$/.test(a.to))throw Error();salesReportCalendar(a.from,a.to)}catch{c.addIssue({code:'custom',message:'Δώσε έγκυρο διάστημα έως366 ημέρες.'});}
});
export const businessTool={type:'function',name:'business_records',strict:true,description:'Διαβάζει πραγματικές εγγραφές ΜΟΝΟ του επιλεγμένου εξουσιοδοτημένου καταστήματος: μεταφορές προς/από ιδιοκτήτη, πληρωμές προμηθευτών, λοιπά έξοδα, παραστατικά αγορών, συνεργαζόμενους προμηθευτές, βάρδιες ταμείων, τρέχον προσωπικό Workforce, συμβάντα POS και καταχωρημένες τραπεζικές κινήσεις. from/to συμπεριλαμβανόμενες ημερομηνίες Ελλάδας, έως366 ημέρες. Μόνο STAFF/SUPPLIERS απαιτούν from/to null (τρέχοντα στοιχεία). query ονομασία/χειριστής/αριθμός όπως ζητήθηκε, αλλιώς null. status ακριβής καταχωρημένη κατάσταση ή null. Δεν διαβάζει κλειδιά, PIN, εικόνες ή μισθούς. Δεν εκτελεί αλλαγές. Τραπεζικές κινήσεις δεν αποδεικνύουν τραπεζικό υπόλοιπο. Παραστατικά DRAFT δεν είναι οριστικοποιημένες αγορές.',parameters:{type:'object',additionalProperties:false,properties:{domain:{type:'string',enum:Object.keys(businessDomains)},from:{type:['string','null']},to:{type:['string','null']},query:{type:['string','null']},status:{type:['string','null']}},required:['domain','from','to','query','status']}};
export const businessInstructions='Για μεταφορές ιδιοκτήτη, πληρωμές, έξοδα, αγορές/τιμολόγια, προμηθευτές, προσωπικό, βάρδιες ή συμβάντα χρησιμοποίησε business_records· ποτέ κλεισίματα cash_details ή BUSINESS_SNAPSHOT ως υποκατάστατο. Μεταφορά ΣΤΟΝ ιδιοκτήτη είναι TRANSFERS_TO_OWNER (TRANSFER_OUT), ΑΠΟ ιδιοκτήτη είναι TRANSFERS_FROM_OWNER. Χωρίς κατεύθυνση χρησιμοποίησε TRANSFERS και κράτησε εισφορές/αποδόσεις χωριστά. Διατήρησε περίοδο προηγούμενης ερώτησης όταν διευκρινίζεται μόνο το είδος. Έτος που λείπει είναι τρέχον έτος Ελλάδας. Εβδομάδα αρχίζει Δευτέρα. Τρέχουσα εβδομάδα/μήνας/έτος και τελευταίες Ν ημέρες είναι έως σήμερα, προηγούμενες περίοδοι πλήρεις. Νεότερη περίοδος αντικαθιστά την παλιά. Ασαφής ή συγκριτική περίοδος ζητά διευκρίνιση, δεν μαντεύεται. Χωρίς διάστημα ζήτησε ημερομηνίες. Τα σύνολα προέρχονται μόνο από την αναγνωσμένη πηγή. Τα παραστατικά διακρίνονται ανά κατάσταση· πρόχειρο δεν σημαίνει εγκεκριμένη αγορά. Βάρδιες εδώ είναι ταμείων, όχι πρόγραμμα προσωπικού. Προσωπικό/προμηθευτές είναι τρέχοντες επιλεγμένου καταστήματος. POS_EVENTS είναι μόνο καταχωρημένες ενέργειες POS, όχι κάθε συμβάν όλων των modules. Μην εμφανίζεις ονόματα εργαλείων, BUSINESS_SNAPSHOT ή τεχνικά πεδία. Για μη συνδεδεμένη πληροφορία εξήγησε ακριβώς τι λείπει, όχι άσχετα ποσά ή επινοημένα στοιχεία. ';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const text=v=>typeof v==='string'?v.slice(0,250):null;
const numeric=v=>v===null||v===undefined?null:Number.isFinite(Number(v))?Number(v):NaN;
export const businessModule=domain=>['INVOICES','SUPPLIERS'].includes(domain)?'INVENTORY':domain==='STAFF'?null:'CASH_CONTROL';
export function businessQuestionClarification(question,{now=new Date()}={}){
 const domain=assistantBusinessDomain(question);if(!domain||currentBusinessDomains.includes(domain))return null;
 if(businessPeriodResolution(question,{now}).period)return null;
 return {answer:'Δώσε έγκυρο διάστημα από–έως για αυτή την αναφορά, π.χ. «από 1/10/2026 έως σήμερα».',highlights:[],limitations:'Η αναφορά θα διαβάσει τις πραγματικές εγγραφές του επιλεγμένου καταστήματος.',sources:[]};
}
export function directTransferRequest(question,{now=new Date()}={}){
 const domain=assistantBusinessDomain(question),period=businessQuestionPeriod(question,{now});if(!domain?.startsWith('TRANSFERS')||!period)return null;
 const parts=businessQuestionParts(question);
 // Check all current/inherited text before taking the unfiltered shortcut.
 // A later-line actor, status or other filter must remain in tool extraction.
 const q=normalizeBusinessText([parts.current,parts.topic,parts.period].join(' ')).replace(/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|[^α-ωa-z\s]/g,' ');
 const permitted=new Set('ελενξε ελεγξε δειξε δωσε βγαλε μου ποσες ποσους ποσα ποσο μεταφορα μεταφορες ποσου ειχαμε εγιναν εχουν γινει στον στην στο προς απο ιδιοκτητη ιδιοκτητης τον το την οι τις στις σε για εως μεχρι και σημερα χθες προχθες συνολο λιστα αναφορα αυτη αυτης αυτον αυτο αυτου τρεχουσα τρεχοντα τρεχοντος προηγουμενη προηγουμενο προηγουμενου προηγουμενης περασμενη περασμενο περασμενου περασμενης εβδομαδα εβδομαδας μηνα μηνας μηνο χρονια χρονο χρονου ετος ετους φετος περσι περυσι τελευταιες τελευταιων ημερες ημερων μερες μερων'.split(' '));
 return q.split(/\s+/).filter(Boolean).every(w=>permitted.has(w))?{domain,...period,query:null,status:null}:null;
}
export function checkedBusinessAnswer(question,answer,evidence){
 if(!assistantBusinessDomain(question))return answer;
 const report=evidence.find(r=>r.kind==='business_records');
 if(report&&evidence.length===1)return businessReportAnswer(report);
 return report?answer:businessQuestionClarification(question)||{answer:'Δεν διαβάστηκε η σχετική αναφορά. Ζήτησε συγκεκριμένα μεταφορές ιδιοκτήτη, πληρωμές προμηθευτών, έξοδα, παραστατικά, προμηθευτές, προσωπικό Workforce, βάρδιες ταμείων, συμβάντα POS ή τραπεζικές κινήσεις με διάστημα.',highlights:[],sources:[],limitations:'Χωρίς ανάγνωση της σωστής πηγής δεν προκύπτει αποτέλεσμα ή συμπέρασμα ότι δεν υπάρχουν εγγραφές.'};
}

// Fixed parameterized SELECTs only. No bootstrap, mutation or model-controlled SQL.
export async function readAssistantBusiness(value,scope,{db=prisma,signal,now=new Date()}={}){
 const args=businessArguments.parse(value);
 if(!scope?.companyId||!scope?.storeId)fail(422,'Επίλεξε συγκεκριμένο κατάστημα για αυτή την αναφορά.');
 signal?.throwIfAborted();
 const current=currentBusinessDomains.includes(args.domain),calendar=current?null:salesReportCalendar(args.from,args.to),c=scope.companyId,s=scope.storeId,start=calendar?.from,end=calendar?.to;
 const moneyTypes={PAYMENTS:['SUPPLIER_PAYMENT','OTHER_EXPENSE'],TRANSFERS_TO_OWNER:['TRANSFER_OUT'],TRANSFERS_FROM_OWNER:['TRANSFER_AMOUNT'],TRANSFERS:['TRANSFER_OUT','TRANSFER_AMOUNT'],SUPPLIER_PAYMENTS:['SUPPLIER_PAYMENT'],EXPENSES:['OTHER_EXPENSE']};
 let records;
 try{
  if(moneyTypes[args.domain])records=await db.$queryRaw`SELECT "id","companyId","storeId","occurredAt" AS "recordedAt","type" AS "recordType","description" AS "label","amount","actorName" AS "operatorName","supplierName","invoiceDocumentNumber" AS "reference","paymentMethod","reversedAt" FROM "StoreTransaction" WHERE "companyId"=${c} AND "storeId"=${s} AND "type"=ANY(${moneyTypes[args.domain]}::text[]) AND "reversedAt" IS NULL AND "occurredAt">=${start} AND "occurredAt"<${end} AND "occurredAt"<=${now} ORDER BY "occurredAt" DESC,"id" DESC LIMIT 501`;
  else if(args.domain==='INVOICES')records=await db.$queryRaw`SELECT d."id",d."companyId",d."storeId",d."documentDate" AS "recordedAt",d."documentType" AS "recordType",d."documentNumber" AS "reference",d."status",d."totalGross" AS "amount",s."name" AS "label" FROM "PurchaseDocument" d LEFT JOIN "Supplier" s ON s."id"=d."supplierId" AND s."companyId"=d."companyId" WHERE d."companyId"=${c} AND d."storeId"=${s} AND d."status"<>'MERGED' AND d."documentDate">=${start} AND d."documentDate"<${end} AND d."documentDate"<=${now} ORDER BY d."documentDate" DESC,d."id" DESC LIMIT 501`;
  else if(args.domain==='SUPPLIERS')records=await db.$queryRaw`SELECT s."id",s."companyId",${s}::text AS "storeId",s."name" AS "label",s."active",s."updatedAt" AS "recordedAt" FROM "Supplier" s WHERE s."companyId"=${c} AND s."active"=true AND (EXISTS(SELECT 1 FROM "PurchaseDocument" d WHERE d."supplierId"=s."id" AND d."companyId"=${c} AND d."storeId"=${s}) OR EXISTS(SELECT 1 FROM "StoreTransaction" t WHERE t."supplierId"=s."id" AND t."companyId"=${c} AND t."storeId"=${s})) ORDER BY s."name",s."id" LIMIT 501`;
  else if(args.domain==='STAFF')records=await db.$queryRaw`SELECT e."id",e."companyId",${s}::text AS "storeId",e."fullName" AS "label",e."active",e."updatedAt" AS "recordedAt" FROM "WorkforceEmployee" e WHERE e."companyId"=${c} AND (e."baseStoreId"=${s} OR EXISTS(SELECT 1 FROM "WorkforceEmployeeStoreAccess" a WHERE a."employeeId"=e."id" AND a."storeId"=${s} AND a."active"=true)) ORDER BY e."fullName",e."id" LIMIT 501`;
  else if(args.domain==='CASH_SHIFTS')records=await db.$queryRaw`SELECT "id","companyId","storeId","openedAt" AS "recordedAt","closedAt","shiftLabel" AS "label","terminalPos" AS "reference","status","openedByName" AS "operatorName" FROM "CashShiftSession" WHERE "companyId"=${c} AND "storeId"=${s} AND "openedAt">=${start} AND "openedAt"<${end} AND "openedAt"<=${now} ORDER BY "openedAt" DESC,"id" DESC LIMIT 501`;
  else if(args.domain==='POS_EVENTS')records=await db.$queryRaw`SELECT "id","companyId","storeId","createdAt" AS "recordedAt","actionType" AS "recordType","reason" AS "label","actorName" AS "operatorName" FROM "PosSaleActionAudit" WHERE "companyId"=${c} AND "storeId"=${s} AND "createdAt">=${start} AND "createdAt"<${end} AND "createdAt"<=${now} ORDER BY "createdAt" DESC,"id" DESC LIMIT 501`;
  else if(args.domain==='BANK_MOVEMENTS')records=await db.$queryRaw`SELECT "id","companyId","storeId","occurredAt" AS "recordedAt","type" AS "recordType","type" AS "label","status","amount" FROM "BankLedgerEntry" WHERE "companyId"=${c} AND "storeId"=${s} AND "status"<>'CANCELLED' AND "occurredAt">=${start} AND "occurredAt"<${end} AND "occurredAt"<=${now} ORDER BY "occurredAt" DESC,"id" DESC LIMIT 501`;
 }catch{signal?.throwIfAborted();fail(503,'Η συγκεκριμένη πηγή δεν είναι διαθέσιμη. Δεν εμφανίζεται μηδενικό ή παλιό αποτέλεσμα.');}
 signal?.throwIfAborted();
 const base={kind:'business_records',domain:args.domain,title:businessDomains[args.domain],source:businessDomains[args.domain],scope:'OWNER_SELECTED_STORE',companyId:c,companyName:scope.companyName,storeId:s,storeName:scope.storeName,from:args.from,to:args.to,timeZone:'Europe/Athens',asOf:now.toISOString(),incompletePeriod:!current&&calendar.to>now,currentSnapshot:current,query:args.query,statusFilter:args.status,sourceLimit:500,truncated:false,rows:[],totals:null};
 if(!Array.isArray(records))fail(502,'Μη έγκυρη αναφορά πηγής.');
 if(records.length>500)return {...base,result:'source_limited',truncated:true,reason:'Πάνω από500 εγγραφές. Ζήτησε μικρότερο διάστημα· δεν εξάγεται πλήρες σύνολο.'};
 const seen=new Set(),q=normalizeBusinessText(args.query),rows=[];
 for(const r of records){
  const at=new Date(r.recordedAt);
  if(r.companyId!==c||r.storeId!==s||typeof r.id!=='string'||!r.id||seen.has(r.id)||!Number.isFinite(at.getTime())||!current&&(at<start||at>=end||at>now)||r.reversedAt||moneyTypes[args.domain]&&!moneyTypes[args.domain].includes(r.recordType))fail(502,'Η πηγή δεν αντιστοιχεί στο εξουσιοδοτημένο κατάστημα και διάστημα.');
  seen.add(r.id);
  const row={recordId:r.id,recordedAt:at.toISOString(),recordType:text(r.recordType),label:text(r.label)||text(r.supplierName)||businessDomains[args.domain],amount:numeric(r.amount),operatorName:text(r.operatorName),reference:text(r.reference),status:text(r.status)||(typeof r.active==='boolean'?(r.active?'ACTIVE':'INACTIVE'):null),supplierName:text(r.supplierName),paymentMethod:text(r.paymentMethod),closedAt:r.closedAt?new Date(r.closedAt).toISOString():null};
  if(row.amount!==null&&!Number.isFinite(row.amount))fail(502,'Μη έγκυρο καταχωρημένο ποσό.');
  if(q&&!normalizeBusinessText([row.label,row.operatorName,row.reference,row.supplierName,row.recordType].join(' ')).includes(q)||args.status&&row.status!==args.status)continue;
  rows.push(row);
 }
 const groups={};for(const r of rows){const k=r.recordType||r.status||'RECORD';const g=groups[k]??={count:0,cents:0,complete:true};g.count++;if(r.amount===null)g.complete=false;else g.cents+=Math.round(r.amount*100);}
 return {...base,result:rows.length?'matched':'no_records',sourceRows:records.length,rows,totals:{count:rows.length,groups:Object.entries(groups).map(([type,g])=>({type,count:g.count,amount:g.complete?g.cents/100:null})),amount:businessMoneyDomains.includes(args.domain)&&args.domain!=='TRANSFERS'&&args.domain!=='BANK_MOVEMENTS'&&rows.every(r=>r.amount!==null)?rows.reduce((a,r)=>a+Math.round(r.amount*100),0)/100:null}};
}
