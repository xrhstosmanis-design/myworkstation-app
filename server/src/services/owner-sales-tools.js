import {businessTool,businessArguments,businessQuestionPeriod,businessQuestionClarification,directTransferRequest,explicitOperatorTransferRequest,assistantBusinessDomain} from './assistant-business-reports.js';
import {businessReportAnswer} from '../../../shared/assistant-business-answer.mjs';
import {z} from "zod";
import {assistantSalesPeriodClarification} from "./assistant-conversation-context.js";
import {assistantCapabilityHelp} from "./assistant-capability-help.js";
import {salesReportCalendar} from "./sales-report-calendar.js";
import {cashToolArguments} from "./assistant-cash-tools.js";
import {stockToolArguments,ownerStockTool} from "./owner-stock-tools.js";
import {salesStoresArguments,salesStoresTool} from "./assistant-sales-stores.js";
import {consumptionArguments,consumptionTool,dailyConsumptionRequest} from "./assistant-consumption.js";
import {ASSISTANT_OUTPUT_TOKENS,ASSISTANT_RECOVERY_TOKENS,mayRetryAssistantResponse} from "./assistant-answer-response.js";
import {plainTotalSalesRequest} from './assistant-total-sales-request.js';
export {plainTotalSalesRequest} from './assistant-total-sales-request.js';

const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const salesToolArguments=z.object({product:z.string().trim().min(1).max(120),from:day,to:day}).strict().superRefine((value,ctx)=>{try{salesReportCalendar(value.from,value.to)}catch(e){ctx.addIssue({code:z.ZodIssueCode.custom,message:e.message})}});
export const ownerSalesTool={type:"function",name:"sales_by_product",strict:true,description:"Διαβάζει την κανονική αναφορά Στατιστικά πωλήσεων μόνο για το επιλεγμένο εξουσιοδοτημένο κατάστημα. product: περιγραφή ή SKU, όχι barcode. from/to: συγκεκριμένες συμπεριλαμβανόμενες ημερομηνίες YYYY-MM-DD, ώρα Ελλάδας, έως366 ημέρες. Ασαφές είδος ζητά διευκρίνιση. Ποσότητα και αξίες συνυπολογίζουν καταχωρημένες επιστροφές/ακυρώσεις, ολοκληρωμένες μη πιστωτικές πωλήσεις. Καμία μεταβολή.",parameters:{type:"object",additionalProperties:false,properties:{product:{type:"string",description:"Μόνο η περιγραφή ή το SKU που ζήτησε ο χρήστης."},from:{type:"string",description:"Πρώτη ημερομηνία YYYY-MM-DD."},to:{type:"string",description:"Τελευταία ημερομηνία YYYY-MM-DD, συμπεριλαμβάνεται."}},required:["product","from","to"]}};
const fail=(message,status=502)=>{throw Object.assign(new Error(message),{status})};
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR").trim().replace(/\s+/g," ");
const keys=["productId","sku","name","storeId","storeName","salesQuantity","grossSales","netSales","vatValue","normalSaleCount","reversalCount","returnGrossValue"];
const project=(row,fields)=>Object.fromEntries(fields.map(key=>[key,row[key]]));

export async function readCanonicalOwnerSales(req,args,scope,{fetchImpl=fetch,port=process.env.PORT||8080,signal}={}){
  args=salesToolArguments.parse(args);const authorization=req.headers?.authorization,validPort=String(port);
  if(typeof authorization!=="string"||!/^Bearer \S+$/.test(authorization))fail("Απαιτείται ενεργή σύνδεση.",401);
  if(!/^\d{1,5}$/.test(validPort)||+validPort<1||+validPort>65535)fail("Η πηγή πωλήσεων δεν είναι διαθέσιμη.",503);
  const query=new URLSearchParams({storeId:scope.storeId,from:args.from,to:args.to,q:args.product,timeZone:"Europe/Athens"});
  const response=await fetchImpl(`http://127.0.0.1:${validPort}/api/reports/sales-analysis?${query}`,{method:"GET",headers:{Authorization:authorization},redirect:"error",signal});
  if(!response.ok)fail("Δεν διαβάστηκε η κανονική αναφορά πωλήσεων. Δεν εμφανίζονται εκτιμήσεις ή παλιά στοιχεία.",[401,403,404].includes(response.status)?response.status:502);
  const report=await response.json();
  return productSalesEvidence(report,args,scope);
}

// Both roles use this same checked projection; no report costs/private data reach AI.
export function productSalesEvidence(report,args,scope){
  args=salesToolArguments.parse(args);const calendar=salesReportCalendar(args.from,args.to);
  if(!report||report.companyId!==scope.companyId||report.storeId!==scope.storeId||report.period?.calendarFrom!==args.from||report.period?.calendarTo!==args.to||report.period?.timeZone!=="Europe/Athens"||report.period?.from!==calendar.from.toISOString()||report.period?.toExclusive!==calendar.to.toISOString()||report.reversalAware!==true||!Array.isArray(report.items)||report.count!==report.items.length||report.items.length>10000)fail("Η αναφορά πωλήσεων δεν αντιστοιχεί στο επιλεγμένο κατάστημα και διάστημα.");
  if(report.items.some(row=>!row||row.storeId!==scope.storeId||typeof row.name!=="string"||["salesQuantity","grossSales","netSales","vatValue","normalSaleCount","reversalCount","returnGrossValue"].some(key=>typeof row[key]!=="number"||!Number.isFinite(row[key]))))fail("Η αναφορά πωλήσεων επέστρεψε μη έγκυρα στοιχεία.");
  const base={source:"Στατιστικά πωλήσεων",kind:"product_sales",scope:"OWNER_SELECTED_STORE",companyId:scope.companyId,companyName:scope.companyName,storeId:scope.storeId,storeName:scope.storeName,productQuery:args.product,from:args.from,to:args.to,timeZone:"Europe/Athens",fromInstant:calendar.from.toISOString(),toExclusive:calendar.to.toISOString(),reversalAware:true,nonFiscal:true,sourceRows:report.items.length,sourceLimit:10000,rows:[],candidates:[],truncated:false};
  // A full source cap cannot prove uniqueness or absence; do not infer a total.
  if(report.items.length===10000)return {...base,result:"source_limited",truncated:true};
  const queryText=norm(args.product),exact=report.items.filter(row=>norm(row.sku)===queryText||norm(row.name)===queryText),matches=exact.length?exact:report.items.filter(row=>norm(row.sku).includes(queryText)||norm(row.name).includes(queryText));
  const distinct=new Map(matches.map(row=>[row.productId||`${row.sku}:${row.name}`,row]));
  if(!matches.length)return {...base,result:"no_match"};
  if(distinct.size!==1||matches.length!==1||typeof matches[0].productId!=="string"||!matches[0].productId)return {...base,result:"ambiguous",candidateCount:distinct.size,candidates:[...distinct.values()].slice(0,20).map(row=>project(row,["productId","sku","name"])),truncated:distinct.size>20};
  return {...base,result:"matched",rows:[project(matches[0],keys)]};
}

export const assistantProductTools=[ownerSalesTool,ownerStockTool];

// Shared dispatcher. The old export remains compatible with existing Owner clients.
export async function runOwnerAssistant({prompt,question="",requestProvider,readCash,readSales,readStock,readSalesStores,readConsumption,readBusiness,cashTool,tools=[cashTool,ownerSalesTool],now=new Date()}){
  const help=assistantCapabilityHelp(question,tools);
  if(help)return {response:{ok:true},raw:{status:"completed",output_text:JSON.stringify(help)},evidence:[],reads:[]};
  const total=tools.some(t=>t?.name===salesStoresTool.name)&&plainTotalSalesRequest(question,{now});
  if(total){
    const report=await readSalesStores(total);
    return {response:{ok:true},raw:{status:"completed",output_text:JSON.stringify({answer:"Οι συνολικές πωλήσεις διαβάστηκαν από την κανονική αναφορά του εξουσιοδοτημένου εύρους.",highlights:[],limitations:""})},evidence:[report],reads:[{name:salesStoresTool.name,args:total}]};
  }
  const expectedDomain=assistantBusinessDomain(question),businessAllowed=tools.some(t=>t.name===businessTool.name);
  if(expectedDomain&&businessAllowed){
    const clarification=businessQuestionClarification(question,{now});
    if(clarification)return {response:{ok:true},raw:{status:'completed',output_text:JSON.stringify(clarification)},evidence:[],reads:[]};
    const direct=explicitOperatorTransferRequest(question,{now})||directTransferRequest(question,{now});
    if(direct){const report=await readBusiness(direct);return {response:{ok:true},raw:{status:'completed',output_text:JSON.stringify(businessReportAnswer(report))},evidence:[report],reads:[{name:businessTool.name,args:direct}]};}
  }
  const daily=tools.some(t=>t?.name===consumptionTool.name)&&dailyConsumptionRequest(question,{now});
  if(daily){
    if(daily.clarification)fail(daily.clarification,422);
    const reads=[{name:consumptionTool.name,args:daily.args}];
    const evidence=[await readConsumption(daily.args)];
    return {response:{ok:true},raw:{status:"completed",output_text:JSON.stringify({answer:"Η λίστα ιδιοκατανάλωσης προέρχεται από τα καταχωρημένα συμβάντα του επιλεγμένου καταστήματος.",highlights:[],limitations:""})},evidence,reads};
  }
  // A missing sales period is a dialogue step, not permission for the model to
  // choose today's dates. Callers authorize the current scope before/after it.
  const clarification=assistantSalesPeriodClarification(question);
  if(clarification)return {response:{ok:true},raw:{status:"completed",output_text:JSON.stringify({answer:clarification.answer,highlights:[],limitations:""})},evidence:[],reads:[]};
  const input=[{role:"user",content:prompt}],evidence=[],reads=[];let calls=0,retried=false;
  for(let round=0;round<3;round++){
    const settings={input,tools,parallel_tool_calls:false,tool_choice:round===2?"none":"auto",store:false,max_output_tokens:ASSISTANT_OUTPUT_TOKENS};
    let provider=await requestProvider(settings);
    if(provider.response.ok&&mayRetryAssistantResponse(provider.raw)&&!retried){retried=true;provider=await requestProvider({...settings,max_output_tokens:ASSISTANT_RECOVERY_TOKENS});}
    if(!provider.response.ok||["incomplete","failed","cancelled"].includes(provider.raw?.status))return {...provider,evidence,reads};
    const toolCalls=(provider.raw.output||[]).filter(item=>item.type==="function_call");if(!toolCalls.length)return {...provider,evidence,reads};
    if(round===2||toolCalls.length!==1||calls>=2)fail("Ο βοηθός έφτασε το όριο ανάγνωσης. Ζήτησε ένα συγκεκριμένο είδος και διάστημα.");
    const call=toolCalls[0],business=call.name===businessTool.name,sales=call.name===ownerSalesTool.name,stock=call.name===ownerStockTool.name,cash=call.name===cashTool.name,list=call.name===salesStoresTool.name,consumption=call.name===consumptionTool.name;
    if(!(business||sales||stock||cash||list||consumption)||!tools.some(tool=>tool.name===call.name)||typeof call.call_id!=="string"||!call.call_id||typeof call.arguments!=="string"||call.arguments.length>(list||business?3000:600))fail("Μη επιτρεπόμενη αναζήτηση από τον βοηθό.");
    let args;try{args=(business?businessArguments:consumption?consumptionArguments:list?salesStoresArguments:sales?salesToolArguments:stock?stockToolArguments:cashToolArguments).parse(JSON.parse(call.arguments))}catch{fail("Διευκρίνισε την ονομασία και τις έγκυρες ημερομηνίες της αναζήτησης.",422)}
    // all is internal to the exact deterministic request above. The provider
    // tool schema intentionally cannot ask for it, nor drop a requested filter.
    if(list&&args.mode==="all")fail("Η συνολική αναφορά απαιτεί σαφές αίτημα χωρίς πρόσθετα φίλτρα.",422);
    if(business&&expectedDomain){const period=businessQuestionPeriod(question,{now});if(args.domain!==expectedDomain||period&&(args.from!==period.from||args.to!==period.to))fail("Η αναφορά πρέπει να ακολουθεί το ζητούμενο είδος και διάστημα.",422);}
    calls++;const report=await(business?readBusiness(args):consumption?readConsumption(args):list?readSalesStores(args):sales?readSales(args):stock?readStock(args):readCash(args.date));evidence.push(report);reads.push({name:call.name,args});
    const providerReport=list||consumption||business?{...report,rows:report.rows.slice(0,50),detailRowCount:report.rows.length,detailRowsLimited:report.rows.length>50,detailsShownInReport:true}:report;
    input.push(...provider.raw.output,{type:"function_call_output",call_id:call.call_id,output:JSON.stringify(providerReport)});
  }
  fail("Ο βοηθός δεν ολοκλήρωσε την απάντηση.");
}
export const runProductAssistant=runOwnerAssistant;
