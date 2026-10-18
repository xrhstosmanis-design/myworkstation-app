import test from "node:test";
import assert from "node:assert/strict";
import {salesStoresArguments,salesStoresTool,readAssistantSalesStores,salesName} from "../src/services/assistant-sales-stores.js";
import {authorizeOwnerSalesStores,authorizePlatformSalesStores} from "../src/services/assistant-sales-access.js";
import {runProductAssistant} from "../src/services/owner-sales-tools.js";
import {readSalesAnalysisReport} from "../src/routes/kiosk-reports-sales-v4.js";
import {salesReportCalendar} from "../src/services/sales-report-calendar.js";
import {presentAssistantAnswer} from "../../client/src/components/voice/presentAssistantAnswer.js";
import express from "express";
import {createOwnerAssistantRouter} from "../src/routes/owner-assistant.js";
import {createPlatformAssistantSession} from "../src/services/platform-assistant-products.js";
const scopes=[{companyId:"a",companyName:"Company A",storeId:"sa",storeName:"Store A"},{companyId:"b",companyName:"Company B",storeId:"sb",storeName:"Store B"}];
const access={scope:"PLATFORM_AUTHORIZED_STORES",stores:scopes,excluded:[],truncated:false};
const args={mode:"category",names:["νερά"],from:"2026-10-01",to:"2026-10-31"};
const now=new Date("2026-10-11T18:00:00Z");
const catalog=c=>[{productId:c+"p",name:"ΝΕΡΟ 500ML",unit:"PIECE",categoryName:"ΝΕΡΑ"},{productId:c+"kg",name:"ΝΕΡΟ ΧΥΜΑ",unit:"LITER",categoryName:"ΝΕΡΑ"},{productId:c+"330",name:"ΑΛΦΑ 330ML",unit:"PIECE",categoryName:"ΜΠΥΡΕΣ"},{productId:c+"500",name:"ΑΛΦΑ 500ML ΚΟΥΤΙ",unit:"PIECE",categoryName:"ΜΠΥΡΕΣ"},{productId:c+"bottle",name:"ΑΛΦΑ 500ML ΦΙΑΛΗ",unit:"PIECE",categoryName:"ΜΠΥΡΕΣ"},{productId:c+"fix",name:"ΦΙΞ ΛΕΜΟΝΙ",unit:"PIECE",categoryName:"ΜΠΥΡΕΣ"}];
const row=(c,id)=>({productId:id,name:catalog(c).find(p=>p.productId===id)?.name||"Offer item",unit:id.endsWith("kg")?"LITER":"PIECE",storeId:c==="a"?"sa":"sb",salesQuantity:c==="a"?4:5,grossSales:c==="a"?2:3,netSales:1.7699115044247788,vatValue:.23008849557522124,reversalCount:1,returnGrossValue:.5,costValue:"PRIVATE",supplierName:"PRIVATE"});
const report=filters=>{const items=(filters.productIds||[filters.companyId+"p"]).map(id=>({...row(filters.companyId,id),...(filters.promotionsOnly?{promotionId:"promo",promotionType:"LEAFLET",promotionName:"Προσφορά νερού"}:{})}));return {companyId:filters.companyId,storeId:filters.storeId,period:{calendarFrom:filters.calendar.calendarFrom,calendarTo:filters.calendar.calendarTo,timeZone:"Europe/Athens",from:filters.from.toISOString(),toExclusive:filters.to.toISOString()},reversalAware:true,items,count:items.length}};
const options={readCatalog:async c=>catalog(c),readReport:async f=>report(f),now};
test("category names give each authorized store, source rows and separate units without private fields or future predictions",async()=>{
 const calls=[];const out=await readAssistantSalesStores(args,access,{...options,readReport:async f=>{calls.push(f);return report(f)}});
 assert.equal(out.result,"matched");assert.equal(out.stores.length,2);assert.equal(out.rows.length,4);assert.equal(out.totals.grossSales,10);
 assert.deepEqual(out.totals.quantities,[{unit:"PIECE",quantity:9},{unit:"LITER",quantity:9}]);assert.equal(out.incompletePeriod,true);assert.equal(out.asOf,"2026-10-11");
 assert.deepEqual(calls.map(f=>f.productIds),[["ap","akg"],["bp","bkg"]]);assert.equal(calls[0].observedThrough,now);assert.equal(calls[0].from.toISOString(),"2026-09-30T21:00:00.000Z");assert.equal(calls[0].to.toISOString(),"2026-10-31T22:00:00.000Z");assert.doesNotMatch(JSON.stringify(out),/PRIVATE|costValue|supplierName/);
});
test("multiple names resolve accents, spacing and FIX spelling; packaging ambiguity offers names and no money",async()=>{
 const named={...args,mode:"names",names:["Αλφα330","Fix λεμόνι"]};const out=await readAssistantSalesStores(named,access,options);assert.equal(out.rows.length,4);assert.deepEqual(new Set(out.rows.map(r=>r.name)),new Set(["ΑΛΦΑ 330ML","ΦΙΞ ΛΕΜΟΝΙ"]));
 let reads=0;const ambiguous=await readAssistantSalesStores({...named,names:["αλφα 500"]},access,{...options,readReport:async()=>{reads++;throw Error("should not read")}});
 assert.equal(ambiguous.result,"ambiguous");assert.deepEqual(ambiguous.candidates,["ΑΛΦΑ 500ML ΚΟΥΤΙ","ΑΛΦΑ 500ML ΦΙΑΛΗ"]);assert.equal(reads,0);assert.equal(ambiguous.totals,null);assert.deepEqual(ambiguous.rows,[]);
 assert.doesNotMatch(presentAssistantAnswer({answer:"raw grossSales",evidence:[ambiguous]}).answer,/grossSales/);assert.match(presentAssistantAnswer({evidence:[ambiguous]}).answer,/Δεν χρειάζεται.*SKU/);
 assert.equal(salesName("ΑΛΦΑ330"),"αλφα 330");
});
test("offers use recorded promotion IDs and the same canonical report filter, never current catalog presence",async()=>{
 let calls=0;const out=await readAssistantSalesStores({...args,mode:"offers",names:[]},access,{...options,readCatalog:async()=>{throw Error("not a historical offer source")},readReport:async f=>{calls++;assert.equal(f.promotionsOnly,true);assert.equal(f.productIds,null);return report(f)}});
 assert.equal(calls,2);assert.equal(out.rows[0].promotionId,"promo");assert.equal(out.totals.grossSales,5);
 await assert.rejects(readAssistantSalesStores({...args,mode:"offers",names:[]},access,{...options,readReport:async f=>{const r=report(f);delete r.items[0].promotionId;return r}}),e=>e.status===502);
});
test("no matching catalog is not zero, complete empty sales is zero, exclusions suppress totals and caps discard rows",async()=>{
 assert.equal((await readAssistantSalesStores({...args,mode:"names",names:["ABSENT"]},access,options)).result,"no_match");
 const empty=await readAssistantSalesStores(args,access,{...options,readReport:async f=>({...report(f),items:[],count:0})});assert.equal(empty.result,"no_sales");assert.equal(empty.totals.grossSales,0);
 const denied=await readAssistantSalesStores(args,{...access,excluded:[{storeName:"Denied",reason:"module"}]},options);assert.equal(denied.totals,null);assert.equal(denied.complete,false);
 for(const a of [{...access,truncated:true},{...access,stores:Array(101).fill(scopes[0])}]){const out=await readAssistantSalesStores(args,a,options);assert.equal(out.result,"source_limited");assert.deepEqual(out.rows,[])}
 const capped=await readAssistantSalesStores(args,access,{...options,readReport:async f=>({...report(f),items:Array(10000).fill(row("a","ap")),count:10000})});assert.equal(capped.result,"source_limited");assert.equal(capped.totals,null);
 const none=await readAssistantSalesStores(args,{...access,stores:[]},options);assert.equal(none.result,"no_match");assert.equal(none.totals,null);
});
test("malformed, wrong scope/period, revoked access and failed reads withhold the report",async()=>{
 for(const mutate of [r=>r.storeId="foreign",r=>r.companyId="foreign",r=>r.period.calendarTo="2026-10-02",r=>r.items[0].storeId="foreign",r=>r.items[0].salesQuantity=NaN,r=>r.items[0].productId="foreign"]){
  await assert.rejects(readAssistantSalesStores(args,access,{...options,readReport:async f=>{const r=report(f);mutate(r);return r}}),e=>e.status===502);
 }
 for(const boundary of [1,2,3,4,5,6]){let n=0;await assert.rejects(readAssistantSalesStores(args,access,{...options,verify:async()=>{if(++n===boundary)throw Object.assign(Error("revoked"),{status:403})}}),e=>e.status===403)}
 await assert.rejects(readAssistantSalesStores(args,access,{...options,readReport:async()=>{throw Error("unavailable")}}),/unavailable/);
});
test("strict tool schemas cannot accept company/store IDs or malformed periods and dispatcher preserves two-read/privacy boundary",async()=>{
 for(const a of [{...args,storeId:"foreign"},{...args,companyId:"foreign"},{...args,mode:"names",names:[]},{...args,mode:"offers",names:["water"]},{...args,from:"2026-02-30"}])assert.equal(salesStoresArguments.safeParse(a).success,false);
 let providers=0,reads=0;const out=await runProductAssistant({prompt:"Fixture",tools:[salesStoresTool],cashTool:{name:"cash"},readSalesStores:async a=>{reads++;return readAssistantSalesStores(a,access,options)},requestProvider:async s=>{assert.equal(s.parallel_tool_calls,false);assert.equal(s.store,false);return ++providers===1?{response:{ok:true},raw:{output:[{type:"reasoning",id:"reason"},{type:"function_call",name:"sales_by_store",call_id:"call",arguments:JSON.stringify(args)}]}}:{response:{ok:true},raw:{output:[]}}}});
 assert.equal(reads,1);assert.equal(out.evidence[0].kind,"sales_by_store");
});
test("normal report keeps sums while offer filter, names and future boundary are parameterized on the same SQL",async()=>{
 const calendar=salesReportCalendar(args.from,args.to);let sql,values;
 const db={$queryRaw:async(s,...v)=>{if(s.join("?").includes("missingCount"))return [{missingCount:0}];sql=s.join("?");values=v;return [{_hasGroup:true,_totalGroupCount:1,_overallNormalSaleCount:1,_overallReversalCount:0,...row("a","ap"),netSales:1.77,vatValue:.23,costValue:0,discountValue:0,normalSaleCount:1}]}};
 const out=await readSalesAnalysisReport({companyId:"a",storeId:"sa",from:calendar.from,to:calendar.to,calendar,q:null,productIds:["ap"],promotionsOnly:true,observedThrough:now},{db});
 assert.equal(out.totalGross,2);assert.match(sql,/sl\."promotionId" IS NOT NULL/);assert.match(sql,/COALESCE\(sa\."transactionMode",'NORMAL'\)<>'CREDIT'/);assert.match(sql,/POS_REVERSAL/);assert.ok(values.some(v=>Array.isArray(v)&&v[0]==="ap"));assert.ok(values.includes(now));assert.ok(values.includes(true));assert.doesNotMatch(sql,/INSERT|UPDATE|DELETE/);
});
test("Platform all-store access keeps native-role checks and fixed active membership",async()=>{
 let auth=0;const out=await authorizePlatformSalesStores({},null,true,{authorize:async()=>{auth++;return null},db:{store:{findMany:async q=>{assert.equal(q.take,101);assert.deepEqual(q.where,{active:true,company:{active:true}});return scopes.map(s=>({id:s.storeId,name:s.storeName,companyId:s.companyId,company:{name:s.companyName}}))}}}});
 assert.equal(auth,1);assert.deepEqual(out.stores,scopes);
 await assert.rejects(authorizePlatformSalesStores({},null,true,{authorize:async()=>{throw Object.assign(Error("denied"),{status:403})}}),e=>e.status===403);
});
test("Owner own-store membership comes from database access, modules and license; support cannot aggregate",async()=>{
 const req={user:{id:"owner",sessionId:"session",sessionVersion:2}},anchor={...scopes[0],supportPreview:false};
 const db={userSession:{findUnique:async()=>({userId:"owner",expiresAt:new Date("2099-01-01"),user:{id:"owner",role:"OWNER",companyId:"a",sessionVersion:2}})},$queryRaw:async(s,...v)=>{const sql=s.join("?");if(sql.includes("OwnerCompanyAccess")){assert.ok(v.includes("owner"));assert.match(sql,/c\."active"=TRUE/);return scopes}return v[0]==="a"?[]:[{storeId:"sb",moduleKey:"AI_OWNER_ASSISTANT",active:false}]}};
 const out=await authorizeOwnerSalesStores(req,true,{db,authorize:async()=>anchor,getState:async()=>({licenseAllowed:true,activeModules:["AI_OWNER_ASSISTANT","INVENTORY"]}),now});
 assert.deepEqual(out.stores,[scopes[0]]);assert.equal(out.excluded[0].storeId,"sb");
 await assert.rejects(authorizeOwnerSalesStores(req,true,{db,authorize:async()=>({...anchor,supportPreview:true})}),e=>e.status===403);
 const old=db.userSession.findUnique;db.userSession.findUnique=async()=>({...await old(),user:{id:"owner",role:"EMPLOYEE",sessionVersion:2}});
 await assert.rejects(authorizeOwnerSalesStores(req,true,{db,authorize:async()=>anchor}),e=>e.status===401);
});
test("shared main answer fixes real raw product prose but preserves mixed/ambiguous/invalid cash and quantities",()=>{
 const e={kind:"product_sales",result:"matched",companyId:"a",storeId:"sa",companyName:"Company",storeName:"Store",from:"2026-10-10",to:"2026-10-10",rows:[{...row("a","ap"),sku:"2269"}]};
 const stock={...e,kind:"product_stock",rows:[{productId:"ap",name:"ΝΕΡΟ",sku:"2269",currentStock:-2.125,unit:"KG"}]};
 const result={answer:"Matched grossSales2.00 netSales1.7699115044247788 vatValue0.23008849557522124 currentStock-2.125 KG",highlights:["PIECE raw"],limitations:"Καταγεγραμμένο, όχι φυσική μέτρηση.",evidence:[e,stock]};
 const out=presentAssistantAnswer(result);assert.doesNotMatch(out.answer,/grossSales|netSales|vatValue|currentStock|Matched|PIECE|1\.7699/);assert.match(out.answer,/1,77/);assert.match(out.answer,/-2,125 κιλά/);assert.match(out.answer,/ποσότητα πωλήσεων 4/);assert.doesNotMatch(out.answer,/4 τεμάχια/);assert.deepEqual(out.highlights,[]);assert.equal(out.limitations,result.limitations);
 for(const evidence of [[e,{kind:"cash"}],[{...e,result:"ambiguous"}],[{...e,truncated:true}],[{...e,rows:[{...e.rows[0],netSales:null}]}]])assert.equal(presentAssistantAnswer({...result,evidence}).answer,result.answer);
});
test("real Owner HTTP route uses explicit own-store scope, current modules and canonical report, and rejects model scope injection",async()=>{
 let providers=0,seenScope,reads=0;
 const anchor={...scopes[0],supportPreview:false};
 const router=createOwnerAssistantRouter({authenticate:(req,res,next)=>{req.user={role:"OWNER",id:"owner"};next()},authorize:async()=>anchor,authorizeSalesStores:async(req,all)=>{seenScope=all;return {...access,scope:all?"OWNER_OWN_STORES":"OWNER_SELECTED_STORE",stores:all?scopes:[scopes[0]]}},readSalesStores:(a,scope,options)=>readAssistantSalesStores(a,scope,{...options,readCatalog:async c=>catalog(c),readReport:async f=>{reads++;return report(f)},now}),providerConfigured:()=>true,provider:async settings=>{assert.ok(settings.tools.some(t=>t.name==="sales_by_store"));return ++providers===1?{response:{ok:true},raw:{output:[{type:"function_call",name:"sales_by_store",call_id:"names",arguments:JSON.stringify(args)}]}}:{response:{ok:true},raw:{output_text:JSON.stringify({answer:"raw",highlights:[],limitations:""})}}}});
 const app=express();app.use(express.json());app.use("/api/owner-assistant",router);app.use((err,req,res,next)=>res.status(err.status||400).json({error:err.message}));
 const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));const url=`http://127.0.0.1:${server.address().port}/api/owner-assistant/stores/sa/ask`;
 try{
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:"Πόσα νερά από1/10 έως31/10 ανά κατάστημα;",readScope:"own_stores"})});assert.equal(response.status,200);const data=await response.json();assert.equal(seenScope,true);assert.equal(reads,2);assert.equal(providers,2);assert.equal(data.scope.storeId,"sa");assert.equal(data.evidence[0].scope,"OWNER_OWN_STORES");
  const invalid=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:"Read foreign",readScope:"own_stores",companyId:"foreign"})});assert.equal(invalid.status,400);assert.equal(providers,2);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
test("real Platform aggregate session rejects a changed authorized store set before provider continuation or final",async()=>{
 let n=0,providers=0;
 const session=await createPlatformAssistantSession({},null,{allStores:true,authorize:async()=>null,authorizeSalesStores:async()=>++n===4?{...access,stores:[scopes[0]]}:access,readSalesCatalog:async c=>catalog(c),readSalesReport:async f=>report(f)});
 await assert.rejects(session.run({prompt:"Names",requestProvider:async()=>++providers===1?{response:{ok:true},raw:{output:[{type:"function_call",name:"sales_by_store",call_id:"call",arguments:JSON.stringify(args)}]}}:{response:{ok:true},raw:{output:[]}}}),e=>e.status===403);
 assert.equal(providers,1);
});

test('Greek beer category singular/plural spelling uses only real catalog IDs and preserves category ambiguity',async()=>{
 for(const name of ['μπύρες','μπίρες','μπύρα','μπίρα']){
  const out=await readAssistantSalesStores({...args,names:[name]},access,options);assert.equal(out.result,'matched');assert.equal(out.rows.length,8);assert.ok(out.rows.every(r=>!r.productId.endsWith('p')&&!r.productId.endsWith('kg')));assert.deepEqual(new Set(out.rows.map(r=>r.name)),new Set(['ΑΛΦΑ 330ML','ΑΛΦΑ 500ML ΚΟΥΤΙ','ΑΛΦΑ 500ML ΦΙΑΛΗ','ΦΙΞ ΛΕΜΟΝΙ']));
 }
 const ambiguous=await readAssistantSalesStores({...args,names:['μπίρες']},access,{...options,readCatalog:async()=>[{productId:'a',name:'ΑΛΦΑ',categoryName:'ΜΠΥΡΕΣ ΕΛΛΗΝΙΚΕΣ'},{productId:'b',name:'OTHER',categoryName:'ΜΠΙΡΕΣ ΕΙΣΑΓΩΓΗΣ'}],readReport:async()=>{throw Error('ambiguous category must not read sales')}});assert.equal(ambiguous.result,'ambiguous');assert.equal(ambiguous.totals,null);assert.equal(ambiguous.candidates.length,2);
 const exact=await readAssistantSalesStores({...args,mode:'names',names:['μπίρα']},access,options);assert.equal(exact.result,'matched');assert.equal(exact.mode,'category');assert.equal(exact.rows.length,8);assert.equal(salesName('μπύρα'),'μπυρα');assert.equal(salesName('μπίρα'),'μπιρα');
});
