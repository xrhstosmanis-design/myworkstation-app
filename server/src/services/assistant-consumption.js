import {reviewedCashQuestion,explicitlyReviewedCashQuestion} from '../../../shared/assistant-reviewed-cash.mjs';
import {assistantBusinessDomain} from '../../../shared/assistant-business.mjs';
import {z} from "zod";
import {salesOnlyQuestion} from "./assistant-question-intent.js";
import {prisma} from "../prisma.js";
import {salesReportCalendar} from "./sales-report-calendar.js";

const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const consumptionArguments=z.object({kind:z.enum(["SELF_CONSUMPTION","PRODUCT_DESTRUCTION"]),from:day,to:day,product:z.string().trim().max(120).nullable()}).strict().superRefine((a,c)=>{try{salesReportCalendar(a.from,a.to)}catch(e){c.addIssue({code:z.ZodIssueCode.custom,message:e.message})}});
export const consumptionTool={type:"function",name:"consumption_details",strict:true,description:"Διαβάζει καταχωρημένη ιδιοκατανάλωση ή καταστροφή προϊόντων από τα συμβάντα POS, μόνο στο ήδη επιλεγμένο εξουσιοδοτημένο κατάστημα. kind SELF_CONSUMPTION για ιδιοκατανάλωση, PRODUCT_DESTRUCTION για καταστροφή. from/to συμπεριλαμβανόμενες ημερομηνίες YYYY-MM-DD, ώρα Ελλάδας, έως366 ημέρες. product ονομασία ή SKU, null για όλα τα είδη. Επιστρέφει καταγεγραμμένες ποσότητες, αξία αναφοράς (όχι τζίρο/κόστος), ημερομηνία και χειριστή. Δεν επιλέγει κατάστημα και δεν αλλάζει τίποτε.",parameters:{type:"object",additionalProperties:false,properties:{kind:{type:"string",enum:["SELF_CONSUMPTION","PRODUCT_DESTRUCTION"]},from:{type:"string"},to:{type:"string"},product:{type:["string","null"]}},required:["kind","from","to","product"]}};
export const consumptionInstructions="Για ιδιοκατανάλωση/ίδια ή προσωπική κατανάλωση και καταστροφή προϊόντων χρησιμοποίησε μόνο consumption_details, ποτέ cash_details ή BUSINESS_SNAPSHOT για να συμπεράνεις απουσία εγγραφών. Αν λείπει περίοδος, ζήτησε ημερομηνίες· σήμερα/χθες με ώρα Ελλάδας. Χωρίς έτος χρησιμοποίησε το τρέχον έτος. Μόνο το επιλεγμένο κατάστημα, όχι όλα τα καταστήματα. Η αξία αναφοράς δεν είναι πληρωμή, τζίρος ή κόστος αγοράς. Οι χειριστές δείχνουν καταχώριση, όχι προσωπική ευθύνη ή δικαιούχο κατανάλωσης. no_records σημαίνει μόνο ότι δεν βρέθηκαν καταχωρημένα συμβάντα στο συγκεκριμένο φίλτρο. source_limited σημαίνει ελλιπή/περιορισμένη πηγή, ποτέ μηδέν. Δεν αθροίζεις ποσότητες διαφορετικών ειδών χωρίς κοινή καταγεγραμμένη μονάδα. Για άλλες μη συνδεδεμένες ενότητες πες «Δεν υποστηρίζεται ακόμη αυτή η αναζήτηση από τον βοηθό», όχι «δεν υπάρχουν εγγραφές». ";
const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR").replace(/\s+/g," ").trim();
export function consumptionQuestion(question){return /ιδιοκαταναλ|(?:ιδια|ιδιας|προσωπικη|προσωπικης) καταναλ|καταστροφ|self.?consumption/.test(norm(question));}
// Only a complete, unambiguous daily list request can select all products.
// Extra product, scope, domain or history text stays in the strict tool flow.
export function dailyConsumptionRequest(question,{now=new Date()}={}){
 const match=norm(question).match(/^(?:(?:βγαλε|δωσε|δειξε)(?: μου)? )?(?:(?:τη|την|μια) )?(?:λιστα|αναφορα)(?: της)? ιδιοκαταναλωσης (?:για |στις |την )?(\d{1,2}\/\d{1,2}(?:\/\d{2}|\/\d{4})?|\d{4}-\d{2}-\d{2})[.!;]?$/);
 if(!match)return null;
 let date=match[1];
 if(date.includes("/")){
  const [d,m,y]=date.split("/");
  const year=y?(y.length===2?`20${y}`:y):new Intl.DateTimeFormat("en",{timeZone:"Europe/Athens",year:"numeric"}).format(now);
  date=`${year}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
 }
 const parsed=consumptionArguments.safeParse({kind:"SELF_CONSUMPTION",from:date,to:date,product:null});
 return parsed.success?{args:parsed.data}:{clarification:"Γράψε μια έγκυρη ημερομηνία για τη λίστα ιδιοκατανάλωσης, π.χ. 13/10/2026."};
}
export function toolsForAssistantQuestion(question,tools){if(reviewedCashQuestion(question)&&(tools.some(t=>t.name==='cash_review')||explicitlyReviewedCashQuestion(question)))return tools.filter(t=>t.name==='cash_review');return assistantBusinessDomain(question)?tools.filter(t=>t.name==="business_records"):consumptionQuestion(question)?tools.filter(t=>t.name===consumptionTool.name):salesOnlyQuestion(question)?tools.filter(t=>["sales_by_product","sales_by_store"].includes(t.name)):tools;}
export function checkedConsumptionAnswer(question,answer,evidence){
 if(!consumptionQuestion(question))return answer;
 if(evidence.some(r=>r.kind==="consumption"))return {...answer,sources:["Συμβάντα POS · Ιδιοκατανάλωση / Καταστροφή προϊόντων"]};
 return {...answer,answer:"Δεν έγινε ανάγνωση της αναφοράς ιδιοκατανάλωσης / καταστροφής. Δώσε ημερομηνίες από και έως, π.χ. «Ιδιοκατανάλωση από 1/10/2026 έως 12/10/2026». Η αναζήτηση αφορά το ήδη επιλεγμένο κατάστημα.",highlights:[],sources:[],limitations:"Χωρίς ανάγνωση της σωστής πηγής δεν μπορεί να εξαχθεί αποτέλεσμα ή συμπέρασμα ότι δεν υπάρχουν εγγραφές."};
}
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const text=v=>typeof v==="string"?v.slice(0,250):null;
const number=v=>typeof v==="number"&&Number.isFinite(v)?v:null;

// Read only the existing immutable POS action source used by ordinary Audit.
// The caller supplies freshly authorized scope; model arguments contain no IDs.
export async function readAssistantConsumption(value,scope,{db=prisma,signal,now=new Date()}={}){
 const args=consumptionArguments.parse(value),calendar=salesReportCalendar(args.from,args.to);
 if(!scope||typeof scope.companyId!=="string"||!scope.companyId||typeof scope.storeId!=="string"||!scope.storeId)fail(422,"Επίλεξε κατάστημα για την αναφορά ιδιοκατανάλωσης.");
 signal?.throwIfAborted();
 let events;
 try{events=await db.$queryRaw`SELECT a."id",a."companyId",a."storeId",a."createdAt",a."actionType",a."actorName",a."details"
  FROM "PosSaleActionAudit" a
  WHERE a."companyId"=${scope.companyId} AND a."storeId"=${scope.storeId}
   AND a."actionType"=${args.kind} AND a."createdAt">=${calendar.from} AND a."createdAt"<${calendar.to} AND a."createdAt"<=${now}
  ORDER BY a."createdAt" DESC,a."id" DESC LIMIT 501`;
 }catch(e){signal?.throwIfAborted();fail(503,"Η πηγή συμβάντων ιδιοκατανάλωσης δεν είναι διαθέσιμη. Δεν εμφανίζεται μηδενικό ή παλιό αποτέλεσμα.")}
 signal?.throwIfAborted();
 const base={kind:"consumption",source:"Συμβάντα POS · Ιδιοκατανάλωση / Καταστροφή προϊόντων",scope:"OWNER_SELECTED_STORE",companyId:scope.companyId,companyName:scope.companyName,storeId:scope.storeId,storeName:scope.storeName,consumptionKind:args.kind,from:args.from,to:args.to,timeZone:"Europe/Athens",fromInstant:calendar.from.toISOString(),toExclusive:calendar.to.toISOString(),asOf:now.toISOString(),incompletePeriod:calendar.to.getTime()>now.getTime(),productQuery:args.product,sourceLimit:500,rowLimit:1000,rows:[],totals:null,truncated:false};
 const limited=reason=>({...base,result:"source_limited",reason,truncated:true});
 if(!Array.isArray(events))fail(502,"Η πηγή συμβάντων επέστρεψε μη έγκυρη αναφορά.");
 if(events.length>500)return limited("Πάνω από 500 συμβάντα στο διάστημα. Ζήτησε μικρότερη περίοδο· δεν εμφανίζεται πλήρες σύνολο.");
 const rows=[],query=norm(args.product),seen=new Set();
 for(const e of events){
  const instant=new Date(e.createdAt),items=e.details?.items;
  if(e.companyId!==scope.companyId||e.storeId!==scope.storeId||e.actionType!==args.kind||typeof e.id!=="string"||!e.id||seen.has(e.id)||!Number.isFinite(instant.getTime())||instant<calendar.from||instant>=calendar.to||instant>now)fail(502,"Τα συμβάντα δεν αντιστοιχούν στο επιλεγμένο κατάστημα και διάστημα.");
  seen.add(e.id);
  if(!Array.isArray(items)||!items.length||items.length>200)return limited("Υπάρχουν συμβάντα χωρίς πλήρεις καταχωρημένες γραμμές προϊόντων. Έλεγξε την κανονική αναφορά Συμβάντων· δεν εξάγεται μηδενικό ή πλήρες σύνολο.");
  for(const [index,item] of items.entries()){
   if(!item||typeof item.name!=="string"||!item.name.trim()||item.name.length>250||number(item.quantity)===null||item.quantity<=0)return limited("Υπάρχουν ελλιπείς καταχωρημένες γραμμές προϊόντων. Απαιτείται έλεγχος της κανονικής αναφοράς.");
   if(query&&!norm(item.name).includes(query)&&!norm(item.sku).includes(query))continue;
   const recordedValue=number(item.value),unitPrice=number(item.unitPrice),referenceValue=recordedValue!==null&&recordedValue>=0?recordedValue:unitPrice!==null&&unitPrice>=0?Number((item.quantity*unitPrice).toFixed(2)):null;
   if(referenceValue!==null&&!Number.isFinite(referenceValue))return limited("Μη έγκυρη καταχωρημένη αξία προϊόντος· απαιτείται έλεγχος της κανονικής αναφοράς.");
   rows.push({eventId:e.id,line:index,recordedAt:instant.toISOString(),name:item.name,sku:text(item.sku),quantity:item.quantity,referenceValue,operatorName:text(e.actorName)});
   if(rows.length>1000)return limited("Πάνω από 1.000 γραμμές ειδών. Ζήτησε μικρότερη περίοδο ή συγκεκριμένη ονομασία· δεν εμφανίζεται πλήρες σύνολο.");
  }
 }
 const completeValue=rows.every(r=>r.referenceValue!==null);
 return {...base,result:rows.length?"matched":"no_records",sourceEvents:events.length,rows,totals:completeValue?{referenceValue:rows.reduce((sum,r)=>sum+Math.round(r.referenceValue*100),0)/100}:null};
}
