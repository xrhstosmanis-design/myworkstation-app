import {z} from "zod";

const calendarDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const date=new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
},"Μη έγκυρη ημερομηνία.");
export const cashToolArguments=z.object({date:calendarDate.nullable()}).strict();
export const cashTool={type:"function",name:"cash_details",description:"Διαβάζει τον κανονικό έλεγχο κλεισμένων βαρδιών σε όλα τα επιτρεπόμενα καταστήματα του κεντρικού Super Admin. date: YYYY-MM-DD ή null για σήμερα (ώρα Ελλάδας). Δεν περιλαμβάνει ανοικτές βάρδιες. Χρησιμοποίησέ το όταν ζητούνται προβλήματα/διαφορές/έλεγχος μετρητών ή ταμείου. Δεν εκτελεί μεταβολές.",strict:true,parameters:{type:"object",additionalProperties:false,properties:{date:{type:["string","null"],description:"Ημερομηνία κλεισίματος βάρδιας YYYY-MM-DD· null όταν ζητείται σήμερα ή δεν δίνεται ημερομηνία."}},required:["date"]}};
const pick=(row,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(row||{},key)).map(key=>[key,row[key]]));
const sessionKeys=["companyId","companyName","storeId","storeName","sessionId","terminalPos","shiftLabel","openedAt","closedAt","cashSales","cardSales","eftposTotal","cardVariance","expenses","openingOperational","expectedOpeningOperational","openingVariance","expectedOperational","actualOperational","variance","duplicateCandidates","expenseCount","expensesWithoutDocument","auditRule"];
const totalKeys=["shifts","cashSales","cardSales","eftposTotal","expenses","variance","shortage","surplus","cardVariance","duplicateCandidates","expensesWithoutDocument"];

// An allowlist projection excludes images, private notes, identities and arbitrary
// nested report contents. These amounts/rules come from the existing report.
export function cashEvidence(report){
  if(!Array.isArray(report?.rows)||!calendarDate.safeParse(report?.date).success)throw Object.assign(new Error("Ο έλεγχος ταμείων επέστρεψε μη έγκυρα στοιχεία."),{status:502});
  const rows=report.rows.slice(0,100).map(row=>({...pick(row,sessionKeys),auditRule:pick(row.auditRule,["mode","carryOverEnabled","posEftposEnabled"])}));
  return {source:"Έλεγχος ταμείων",date:report.date,fromTime:report.fromTime,toTime:report.toTime,timeZone:report.timeZone,scope:"PLATFORM_ALL_STORES",closedShiftsOnly:true,totalRows:report.rows.length,truncated:report.rows.length>rows.length,rows,totals:pick(report.totals,totalKeys)};
}

export async function readCanonicalPlatformCash(req,date,{fetchImpl=fetch,port=process.env.PORT||8080,signal}={}){
  // Called only behind Platform auth. Never derive a URL, method, scope or
  // authorization from the model, request host, body or a tool argument.
  if(!(req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN"))throw Object.assign(new Error("Απαιτείται πρόσβαση Platform Super Admin."),{status:403});
  const authorization=req.headers?.authorization;
  if(typeof authorization!=="string"||!/^Bearer \S+$/.test(authorization))throw Object.assign(new Error("Απαιτείται ενεργή σύνδεση."),{status:401});
  const validPort=String(port);if(!/^\d{1,5}$/.test(validPort)||Number(validPort)<1||Number(validPort)>65535)throw Object.assign(new Error("Η σύνδεση του ελέγχου δεν είναι διαθέσιμη."),{status:503});
  const query=new URLSearchParams({fromTime:"00:00",toTime:"23:59"});
  if(date!==null)query.set("date",calendarDate.parse(date));
  const response=await fetchImpl(`http://127.0.0.1:${validPort}/api/platform/cash-control/daily?${query}`,{method:"GET",headers:{Authorization:authorization},redirect:"error",signal});
  if(!response.ok)throw Object.assign(new Error("Δεν ήταν δυνατή η ανάγνωση του ελέγχου ταμείων. Δεν εμφανίζονται εκτιμήσεις ή παλαιά στοιχεία."),{status:response.status===401||response.status===403?response.status:502});
  return cashEvidence(await response.json());
}

export async function runCashAssistant({prompt,requestProvider,readCash,tool=cashTool}){
  const input=[{role:"user",content:prompt}],evidence=[];
  let calls=0;
  // At most two read calls and three model requests per explicit Ask. Every
  // continuation replays reasoning/output items without storing a response.
  for(let round=0;round<3;round++){
    const provider=await requestProvider({input,tools:[tool],parallel_tool_calls:false,tool_choice:round===2?"none":"auto",store:false});
    if(!provider.response.ok)return {...provider,evidence};
    const toolCalls=(provider.raw.output||[]).filter(item=>item.type==="function_call");
    if(!toolCalls.length)return {...provider,evidence};
    if(round===2||toolCalls.length!==1||calls>=2)throw Object.assign(new Error("Ο βοηθός έφτασε το όριο ανάγνωσης. Ζήτησε έναν συγκεκριμένο έλεγχο."),{status:502});
    const call=toolCalls[0];
    if(call.name!==cashTool.name||typeof call.call_id!=="string"||!call.call_id||typeof call.arguments!=="string"||call.arguments.length>200)throw Object.assign(new Error("Μη επιτρεπόμενη αναζήτηση από τον βοηθό."),{status:502});
    let args;try{args=cashToolArguments.parse(JSON.parse(call.arguments))}catch{throw Object.assign(new Error("Η ημερομηνία του ελέγχου δεν είναι έγκυρη. Διευκρίνισε την ημερομηνία."),{status:422})}
    calls++;
    const report=await readCash(args.date);
    evidence.push(report);
    input.push(...provider.raw.output,{type:"function_call_output",call_id:call.call_id,output:JSON.stringify(report)});
  }
  throw Object.assign(new Error("Ο βοηθός δεν ολοκλήρωσε την απάντηση."),{status:502});
}

