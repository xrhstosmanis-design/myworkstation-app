import {z} from "zod";
import {salesReportCalendar} from "./sales-report-calendar.js";
import {cashToolArguments} from "./assistant-cash-tools.js";

const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const salesToolArguments=z.object({product:z.string().trim().min(1).max(120),from:day,to:day}).strict().superRefine((value,ctx)=>{try{salesReportCalendar(value.from,value.to)}catch(e){ctx.addIssue({code:z.ZodIssueCode.custom,message:e.message})}});
export const ownerSalesTool={type:"function",name:"sales_by_product",strict:true,description:"Διαβάζει την κανονική αναφορά Στατιστικά πωλήσεων μόνο για το επιλεγμένο εξουσιοδοτημένο κατάστημα. product: περιγραφή ή SKU, όχι barcode. from/to: συγκεκριμένες συμπεριλαμβανόμενες ημερομηνίες YYYY-MM-DD, ώρα Ελλάδας, έως366 ημέρες. Ασαφές είδος ζητά διευκρίνιση. Ποσότητα και αξίες συνυπολογίζουν καταχωρημένες επιστροφές/ακυρώσεις, ολοκληρωμένες μη πιστωτικές πωλήσεις. Καμία μεταβολή.",parameters:{type:"object",additionalProperties:false,properties:{product:{type:"string",description:"Μόνο η περιγραφή ή το SKU που ζήτησε ο χρήστης."},from:{type:"string",description:"Πρώτη ημερομηνία YYYY-MM-DD."},to:{type:"string",description:"Τελευταία ημερομηνία YYYY-MM-DD, συμπεριλαμβάνεται."}},required:["product","from","to"]}};
const fail=(message,status=502)=>{throw Object.assign(new Error(message),{status})};
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR").trim().replace(/\s+/g," ");
const keys=["productId","sku","name","storeId","storeName","salesQuantity","grossSales","netSales","vatValue","normalSaleCount","reversalCount","returnGrossValue"];
const project=(row,fields)=>Object.fromEntries(fields.map(key=>[key,row[key]]));

export async function readCanonicalOwnerSales(req,args,scope,{fetchImpl=fetch,port=process.env.PORT||8080,signal}={}){
  args=salesToolArguments.parse(args);const calendar=salesReportCalendar(args.from,args.to),authorization=req.headers?.authorization,validPort=String(port);
  if(typeof authorization!=="string"||!/^Bearer \S+$/.test(authorization))fail("Απαιτείται ενεργή σύνδεση.",401);
  if(!/^\d{1,5}$/.test(validPort)||+validPort<1||+validPort>65535)fail("Η πηγή πωλήσεων δεν είναι διαθέσιμη.",503);
  const query=new URLSearchParams({storeId:scope.storeId,from:args.from,to:args.to,q:args.product,timeZone:"Europe/Athens"});
  const response=await fetchImpl(`http://127.0.0.1:${validPort}/api/reports/sales-analysis?${query}`,{method:"GET",headers:{Authorization:authorization},redirect:"error",signal});
  if(!response.ok)fail("Δεν διαβάστηκε η κανονική αναφορά πωλήσεων. Δεν εμφανίζονται εκτιμήσεις ή παλιά στοιχεία.",[401,403,404].includes(response.status)?response.status:502);
  const report=await response.json();
  if(report.companyId!==scope.companyId||report.storeId!==scope.storeId||report.period?.calendarFrom!==args.from||report.period?.calendarTo!==args.to||report.period?.timeZone!=="Europe/Athens"||report.period?.from!==calendar.from.toISOString()||report.period?.toExclusive!==calendar.to.toISOString()||report.reversalAware!==true||!Array.isArray(report.items)||report.count!==report.items.length||report.items.length>10000)fail("Η αναφορά πωλήσεων δεν αντιστοιχεί στο επιλεγμένο κατάστημα και διάστημα.");
  if(report.items.some(row=>row.storeId!==scope.storeId||typeof row.name!=="string"||["salesQuantity","grossSales","netSales","vatValue","normalSaleCount","reversalCount","returnGrossValue"].some(key=>typeof row[key]!=="number"||!Number.isFinite(row[key]))))fail("Η αναφορά πωλήσεων επέστρεψε μη έγκυρα στοιχεία.");
  const base={source:"Στατιστικά πωλήσεων",kind:"product_sales",scope:"OWNER_SELECTED_STORE",companyId:scope.companyId,storeId:scope.storeId,storeName:scope.storeName,productQuery:args.product,from:args.from,to:args.to,timeZone:"Europe/Athens",fromInstant:calendar.from.toISOString(),toExclusive:calendar.to.toISOString(),reversalAware:true,nonFiscal:true,sourceRows:report.items.length,sourceLimit:10000,rows:[],candidates:[],truncated:false};
  // A full source cap cannot prove uniqueness or absence; do not infer a total.
  if(report.items.length===10000)return {...base,result:"source_limited",truncated:true};
  const queryText=norm(args.product),exact=report.items.filter(row=>norm(row.sku)===queryText||norm(row.name)===queryText),matches=exact.length?exact:report.items.filter(row=>norm(row.sku).includes(queryText)||norm(row.name).includes(queryText));
  const distinct=new Map(matches.map(row=>[row.productId||`${row.sku}:${row.name}`,row]));
  if(!matches.length)return {...base,result:"no_match"};
  if(distinct.size!==1||matches.length!==1||typeof matches[0].productId!=="string"||!matches[0].productId)return {...base,result:"ambiguous",candidateCount:distinct.size,candidates:[...distinct.values()].slice(0,20).map(row=>project(row,["productId","sku","name"])),truncated:distinct.size>20};
  return {...base,result:"matched",rows:[project(matches[0],keys)]};
}

// Owner-only dispatcher; the existing Platform cash loop remains unchanged.
export async function runOwnerAssistant({prompt,requestProvider,readCash,readSales,cashTool,tools=[cashTool,ownerSalesTool]}){
  const input=[{role:"user",content:prompt}],evidence=[];let calls=0;
  for(let round=0;round<3;round++){
    const provider=await requestProvider({input,tools,parallel_tool_calls:false,tool_choice:round===2?"none":"auto",store:false});
    if(!provider.response.ok)return {...provider,evidence};
    const toolCalls=(provider.raw.output||[]).filter(item=>item.type==="function_call");if(!toolCalls.length)return {...provider,evidence};
    if(round===2||toolCalls.length!==1||calls>=2)fail("Ο βοηθός έφτασε το όριο ανάγνωσης. Ζήτησε ένα συγκεκριμένο είδος και διάστημα.");
    const call=toolCalls[0],sales=call.name===ownerSalesTool.name;
    if(!tools.some(tool=>tool.name===call.name)||typeof call.call_id!=="string"||!call.call_id||typeof call.arguments!=="string"||call.arguments.length>600)fail("Μη επιτρεπόμενη αναζήτηση από τον βοηθό.");
    let args;try{args=(sales?salesToolArguments:cashToolArguments).parse(JSON.parse(call.arguments))}catch{fail("Διευκρίνισε το είδος και τις έγκυρες ημερομηνίες της αναζήτησης.",422)}
    calls++;const report=await(sales?readSales(args):readCash(args.date));evidence.push(report);
    input.push(...provider.raw.output,{type:"function_call_output",call_id:call.call_id,output:JSON.stringify(report)});
  }
  fail("Ο βοηθός δεν ολοκλήρωσε την απάντηση.");
}
