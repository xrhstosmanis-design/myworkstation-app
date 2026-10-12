import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {salesOnlyQuestion} from "../src/services/assistant-question-intent.js";
import {toolsForAssistantQuestion} from "../src/services/assistant-consumption.js";
import {assistantEffectiveQuestion,assistantQuestionRequiresReport} from "../src/services/assistant-conversation-context.js";
import {assistantAnswerFromResponse} from "../src/services/assistant-answer-response.js";
import {readAssistantSalesStores,salesName} from "../src/services/assistant-sales-stores.js";
import {createOwnerAssistantRouter} from "../src/routes/owner-assistant.js";
import {createPlatformAssistantSession} from "../src/services/platform-assistant-products.js";
import {salesReportCalendar} from "../src/services/sales-report-calendar.js";
import {presentAssistantAnswer} from "../../client/src/components/voice/presentAssistantAnswer.js";
import {assistantReportTables} from "../src/services/assistant-report-table.js";
import {buildAssistantReportFile} from "../src/services/assistant-report-files.js";
import {issueAssistantExportTicket,readAssistantExportTicket} from "../src/services/assistant-export-ticket.js";
const question="ποσες κοκα κολα πουληθηκαν 11/10/26",scope={companyId:"c",companyName:"Εταιρεία",storeId:"s",storeName:"Διαδόχου"};
const args={mode:"family",names:["κόκα κόλα"],from:"2026-10-11",to:"2026-10-11"};
const catalog=[{productId:"can",name:"COCA-COLA 330ML ΚΟΥΤΙ",unit:"PIECE"},{productId:"bottle",name:"ΚΟΚΑ ΚΟΛΑ 500ML ΦΙΑΛΗ",unit:"PIECE"},{productId:"other",name:"PEPSI 330ML",unit:"PIECE"}];
const readReport=async f=>{const calendar=salesReportCalendar(args.from,args.to);assert.equal(f.storeId,"s");assert.equal(f.companyId,"c");assert.equal(f.from.toISOString(),calendar.from.toISOString());const items=catalog.filter(p=>f.productIds.includes(p.productId)).map(p=>({...p,storeId:"s",salesQuantity:p.productId==="can"?4:2,grossSales:2,netSales:1.77,vatValue:.23,reversalCount:1,returnGrossValue:.5,password:"PRIVATE",costValue:999}));return {companyId:"c",storeId:"s",period:{calendarFrom:args.from,calendarTo:args.to,timeZone:"Europe/Athens",from:calendar.from.toISOString(),toExclusive:calendar.to.toISOString()},items,count:items.length,reversalAware:true}};
const readList=(a,access,options={})=>readAssistantSalesStores(a,access,{...options,readCatalog:async c=>{assert.equal(c,"c");return catalog},readReport,now:new Date("2026-10-12T18:00:00Z")});
const providerOutput={answer:"Χρειάζεται SKU. BUSINESS_SNAPSHOT cash_details variance -999",highlights:["cash_details"],limitations:"BUSINESS_SNAPSHOT null· ταμεία -999"};
test("natural sold verb and follow-up require sales evidence and remove unrelated cash/stock tools",()=>{
 for(const q of [question,"Πόσες Coca-Cola πωλήθηκαν χθες;","Πόσες Coca-Cola πουλήσαμε χθες;","Πωλήσεις νερών σήμερα","Πόσο τζίρο είχαν οι Άλφα330;","Coca-Cola sold yesterday"]){assert.equal(salesOnlyQuestion(q),true);assert.equal(assistantQuestionRequiresReport(q),true)}
 const history=[{role:"user",content:question}];const follow=assistantEffectiveQuestion("Και σε Excel;",history);assert.ok(follow.includes(question));assert.equal(salesOnlyQuestion(follow),true);
 const all=["cash_details","stock_by_product","consumption_details","sales_by_product","sales_by_store"].map(name=>({name}));assert.deepEqual(toolsForAssistantQuestion(question,all).map(t=>t.name),["sales_by_product","sales_by_store"]);
 assert.equal(salesOnlyQuestion("Πωλήσεις Coca-Cola και διαφορές ταμείου"),false);assert.equal(salesOnlyQuestion("Απόθεμα Coca-Cola και πωλήσεις"),false);
 const answer=assistantAnswerFromResponse({output_text:JSON.stringify(providerOutput)},[],{requireEvidence:assistantQuestionRequiresReport(question)});assert.equal(answer.sourceUnavailable,true);assert.doesNotMatch(JSON.stringify(answer),/SKU|BUSINESS_SNAPSHOT|cash_details|-999/);
});
test("catalog family resolves Greek/Latin Coca-Cola and keeps variants, canonical returns and strict scope separately",async()=>{
 assert.equal(salesName("Κόκα-Κόλα"),salesName("CocaCola"));
 const access={scope:"PLATFORM_SELECTED_STORE",stores:[scope],excluded:[],truncated:false},out=await readList(args,access);
 assert.equal(out.result,"matched");assert.deepEqual(out.rows.map(r=>r.name),catalog.slice(0,2).map(r=>r.name));assert.deepEqual(out.rows.map(r=>r.salesQuantity),[4,2]);assert.deepEqual(out.totals.quantities,[{unit:"PIECE",quantity:6}]);assert.equal(out.totals.grossSales,4);assert.ok(out.rows.every(r=>r.reversalCount===1));assert.doesNotMatch(JSON.stringify(out),/PEPSI|PRIVATE|costValue|999/);
 const exact=await readList({...args,mode:"names"},access);assert.equal(exact.result,"ambiguous");assert.equal(exact.rows.length,0);assert.equal(exact.totals,null);
 const presented=presentAssistantAnswer({...providerOutput,evidence:[out]});assert.doesNotMatch(JSON.stringify(presented),/BUSINESS_SNAPSHOT|cash_details|-999|Χρειάζεται SKU/);assert.match(presented.limitations,/χωριστά ανά είδος/);assert.deepEqual(assistantReportTables([out])[1].rows.map(r=>r[2]),catalog.slice(0,2).map(r=>r.name));
 const csv=Buffer.from((await buildAssistantReportFile("csv",[out])).base64,"base64").toString("utf8");assert.match(csv,/COCA-COLA 330ML/);assert.match(csv,/ΚΟΚΑ ΚΟΛΑ 500ML/);assert.doesNotMatch(csv,/PEPSI|BUSINESS_SNAPSHOT|cash_details|-999|PRIVATE/);
 const req={user:{id:"admin",sessionId:"session",sessionVersion:1}},secret="isolated-fixture-secret",ticket=issueAssistantExportTicket(req,[{name:"sales_by_store",args}],[out],{secret,selection:{companyId:"c",storeId:"s"}});assert.deepEqual(readAssistantExportTicket(req,ticket,{secret}).reads,[{name:"sales_by_store",args}]);
 const missing=await readList({...args,names:["Δεν υπάρχει"]},access);assert.equal(missing.result,"no_match");assert.equal(missing.totals,null);
 await assert.rejects(readAssistantSalesStores(args,access,{readCatalog:async()=>catalog,readReport:async f=>({...await readReport(f),storeId:"foreign"})}),e=>e.status===502);
});
test("native Owner HTTP and Platform session reject a wrong cash read before any report; correct family read remains selected",async()=>{
 for(const platform of [false,true]){
  let providers=0,cashReads=0,wrong=true;
  const provider=async settings=>{assert.deepEqual(settings.tools.map(t=>t.name).sort(),["sales_by_product","sales_by_store"]);return ++providers%2===1?{response:{ok:true},raw:{output:[{type:"function_call",name:wrong?"cash_details":"sales_by_store",call_id:"call",arguments:JSON.stringify(wrong?{date:"2026-10-11"}:args)}]}}:{response:{ok:true},raw:{output_text:JSON.stringify(providerOutput)}}};
  if(platform){
   const session=await createPlatformAssistantSession({},scope,{authorize:async()=>scope,authorizeSalesStores:async()=>({scope:"PLATFORM_SELECTED_STORE",stores:[scope],excluded:[],truncated:false}),readSalesCatalog:async()=>catalog,readSalesReport:readReport,readCash:async()=>{cashReads++;throw Error("unrelated cash")}});
   await assert.rejects(session.run({question,prompt:"Fixture",requestProvider:provider}));assert.equal(cashReads,0);wrong=false;providers=0;const result=await session.run({question,prompt:"Fixture",requestProvider:provider});assert.equal(result.evidence[0].rows.length,2);assert.deepEqual(result.reads,[{name:"sales_by_store",args}]);
  }else{
   const router=createOwnerAssistantRouter({authenticate:(req,res,next)=>{req.user={role:"OWNER",id:"owner"};next()},authorize:async()=>scope,authorizeSalesStores:async(req,all)=>{assert.equal(all,false);return {scope:"OWNER_SELECTED_STORE",stores:[scope],excluded:[],truncated:false}},readSalesStores:readList,readCash:async()=>{cashReads++;throw Error("unrelated cash")},providerConfigured:()=>true,provider});
   const app=express();app.use(express.json());app.use("/api/owner-assistant",router);app.use((e,req,res,next)=>res.status(e.status||400).json({error:e.message}));const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
   const ask=()=>fetch(`http://127.0.0.1:${server.address().port}/api/owner-assistant/stores/s/ask`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question,readScope:"selected_store"})});
   try{const denied=await ask();assert.ok(denied.status>=400);assert.equal(cashReads,0);wrong=false;providers=0;const accepted=await ask();assert.equal(accepted.status,200);const result=await accepted.json();assert.equal(result.evidence[0].rows.length,2);assert.equal(result.evidence[0].scope,"OWNER_SELECTED_STORE");assert.equal(result.scope.storeId,"s");assert.doesNotMatch(JSON.stringify(presentAssistantAnswer(result)),/BUSINESS_SNAPSHOT|cash_details|-999/)}finally{await new Promise(resolve=>server.close(resolve))}
  }
 }
});
