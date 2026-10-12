import test from "node:test";
import assert from "node:assert/strict";
import {consumptionArguments,consumptionTool,consumptionQuestion,toolsForAssistantQuestion,readAssistantConsumption,checkedConsumptionAnswer} from "../src/services/assistant-consumption.js";
import {createPlatformAssistantSession} from "../src/services/platform-assistant-products.js";
import {createOwnerAssistantHandlers} from "../src/services/owner-assistant-handlers.js";
import {runOwnerAssistant} from "../src/services/owner-sales-tools.js";
import {cashTool} from "../src/services/assistant-cash-tools.js";
import {presentAssistantAnswer} from "../../client/src/components/voice/presentAssistantAnswer.js";

const scope={companyId:"c",companyName:"Company",storeId:"s",storeName:"Store"},args={kind:"SELF_CONSUMPTION",from:"2026-10-10",to:"2026-10-10",product:null},now=new Date("2026-10-11T18:00:00Z");
const event=()=>({id:"event",companyId:"c",storeId:"s",createdAt:new Date("2026-10-10T08:47:54Z"),actionType:"SELF_CONSUMPTION",actorName:"Χειριστής",details:{items:[{productId:"p",name:"ΝΕΡΟ 500ML",sku:"2269",quantity:1.5,unitPrice:.5,value:.75,password:"PRIVATE"}],referenceValue:.75,secret:"PRIVATE",sessionId:"PRIVATE"},reason:"PRIVATE"});
const read=(events=[event()],value=args)=>readAssistantConsumption(value,scope,{db:{$queryRaw:async()=>events},now});
const toolCall=(value=args,name="consumption_details")=>({type:"function_call",name,call_id:"call",arguments:JSON.stringify(value)});
const final=()=>({response:{ok:true},raw:{output_text:'{"answer":"Fixture","highlights":[],"limitations":"Fixture"}'}});
test("consumption arguments reject foreign scope, invalid dates and non-report actions",()=>{
 for(const a of [{...args,storeId:"foreign"},{...args,companyId:"foreign"},{...args,kind:"WASTE"},{...args,from:"2026-02-30"},{...args,to:"2026-10-09"},{...args,from:"2024-01-01"}])assert.equal(consumptionArguments.safeParse(a).success,false);
 assert.equal(consumptionTool.parameters.additionalProperties,false);assert.equal(consumptionTool.strict,true);
 for(const q of ["βγάλε μου λίστα ιδιοκατανάλωσης","Η ΙΔΙΑ ΚΑΤΑΝΑΛΩΣΗ χθες","προσωπικής κατανάλωσης","καταστροφή προϊόντων"]){assert.equal(consumptionQuestion(q),true);assert.deepEqual(toolsForAssistantQuestion(q,[cashTool,consumptionTool]),[consumptionTool])}
 assert.equal(consumptionQuestion("πωλήσεις νερά"),false);
});
test("shared recorded-source read pins company/store/Athens dates and projects only requested business fields",async()=>{
 let query;const out=await readAssistantConsumption(args,scope,{now,db:{$queryRaw:async(strings,...values)=>{query={sql:strings.join("?"),values};return [event()]}}});
 assert.match(query.sql,/a\."companyId"=\? AND a\."storeId"=\?/);assert.match(query.sql,/LIMIT 501/);assert.deepEqual(query.values.slice(0,3),["c","s","SELF_CONSUMPTION"]);assert.equal(query.values[3].toISOString(),"2026-10-09T21:00:00.000Z");assert.equal(query.values[4].toISOString(),"2026-10-10T21:00:00.000Z");assert.equal(query.values[5],now);
 assert.equal(out.result,"matched");assert.equal(out.rows[0].quantity,1.5);assert.equal(out.rows[0].referenceValue,.75);assert.equal(out.totals.referenceValue,.75);assert.equal(out.rows[0].operatorName,"Χειριστής");assert.doesNotMatch(JSON.stringify(out),/PRIVATE|password|sessionId|productId|costPrice/);
 assert.equal((await read([event()],{...args,product:"νερό"})).rows.length,1);assert.equal((await read([event()],{...args,product:"μπύρα"})).result,"no_records");
});
test("empty, missing-value and incomplete/capped sources never invent financial or quantity totals",async()=>{
 const empty=await read([]);assert.equal(empty.result,"no_records");assert.deepEqual(empty.rows,[]);
 const missing=event();delete missing.details.items[0].unitPrice;delete missing.details.items[0].value;const out=await read([missing]);assert.equal(out.result,"matched");assert.equal(out.rows[0].referenceValue,null);assert.equal(out.totals,null);
 for(const e of [{...event(),details:{}},{...event(),details:{items:[{name:"Water",quantity:"1"}]}},{...event(),details:{items:[]}}]){const out=await read([e]);assert.equal(out.result,"source_limited");assert.equal(out.totals,null);assert.deepEqual(out.rows,[])}
 const capped=await read(Array.from({length:501},(_,i)=>({...event(),id:String(i)})));assert.equal(capped.result,"source_limited");assert.equal(capped.totals,null);
});
test("foreign, duplicate, wrong kind, out-of-period and future source rows fail closed",async()=>{
 for(const e of [{...event(),companyId:"foreign"},{...event(),storeId:"foreign"},{...event(),actionType:"PRODUCT_DESTRUCTION"},{...event(),createdAt:new Date("2026-10-11")},{...event(),createdAt:"invalid"}])await assert.rejects(read([e]),e=>e.status===502);
 await assert.rejects(read([event(),event()]),e=>e.status===502);
 await assert.rejects(readAssistantConsumption(args,null,{now}),e=>e.status===422);
 await assert.rejects(readAssistantConsumption(args,scope,{now,db:{$queryRaw:async()=>{throw Error("PRIVATE")}}}),e=>e.status===503&&!e.message.includes("PRIVATE"));
});
test("same strict dispatcher supports consumption and rejects scope injection and wrong cash fallback",async()=>{
 let providers=0,reads=0;const out=await runOwnerAssistant({prompt:"Fixture",cashTool,tools:[consumptionTool],readConsumption:async a=>{reads++;assert.deepEqual(a,args);return read()},requestProvider:async settings=>{providers++;if(providers===1)return {response:{ok:true},raw:{output:[toolCall()]}};const report=JSON.parse(settings.input.at(-1).output);assert.equal(report.kind,"consumption");assert.equal(report.detailRowCount,1);return final()}});assert.equal(reads,1);assert.equal(out.evidence[0].result,"matched");
 for(const call of [toolCall({...args,companyId:"foreign"}),toolCall({date:null},"cash_details")])await assert.rejects(runOwnerAssistant({prompt:"Fixture",cashTool,tools:[consumptionTool],readConsumption:()=>{throw Error("must not read")},requestProvider:async()=>({response:{ok:true},raw:{output:[call]}})}),e=>[422,502].includes(e.status));
});
test("Platform routes actual question to selected report and reauthorizes after reading",async()=>{
 let auth=0,readCount=0,provider=0;const assistant=await createPlatformAssistantSession({},scope,{authorize:async()=>{auth++;return scope},readConsumption:async(a,s)=>{readCount++;assert.deepEqual(s,scope);return read()}});
 const out=await assistant.run({prompt:"Fixture",question:"λίστα ιδιοκατανάλωσης",requestProvider:async settings=>{assert.deepEqual(settings.tools.map(t=>t.name),["consumption_details"]);return ++provider===1?{response:{ok:true},raw:{output:[toolCall()]}}:final()}});assert.equal(out.evidence[0].scope,"PLATFORM_SELECTED_STORE");assert.equal(readCount,1);assert.ok(auth>=6);
 const denied=await createPlatformAssistantSession({},scope,{authorize:async()=>scope,readConsumption:async()=>{throw Object.assign(Error("revoked"),{status:401})}});await assert.rejects(denied.run({prompt:"Fixture",question:"ιδιοκατανάλωση",requestProvider:async()=>({response:{ok:true},raw:{output:[toolCall()]}})}),e=>e.status===401);
 const noSelection=await createPlatformAssistantSession({},null,{allStores:true,authorize:async()=>null});await assert.rejects(noSelection.run({prompt:"Fixture",question:"ιδιοκατανάλωση",requestProvider:()=>{throw Error("must not call")}}),e=>e.status===422);
});
test("Owner enforces AI/domain authorization, preserves shared source and denies unsupported cash substitution",async()=>{
 let provider=0,required=[],result;const authorize=async(req,opts)=>{required.push(opts.requiredModules);return scope};const handlers=createOwnerAssistantHandlers({authorize,readConsumption:async(a,s)=>{assert.deepEqual(s,scope);return read()},requestProvider:async settings=>{assert.deepEqual(settings.tools.map(t=>t.name),["consumption_details"]);return ++provider===1?{response:{ok:true},raw:{output:[toolCall()]}}:final()}});
 await handlers.ask({body:{question:"ιδιοκατανάλωση 10/10"}},{json:v=>result=v},e=>{throw e});assert.equal(result.evidence[0].scope,"OWNER_SELECTED_STORE");assert.ok(required.filter(a=>a.includes("INVENTORY")).length>=4);
 let error;const limited=createOwnerAssistantHandlers({authorize:async(req,o)=>{if(o.requiredModules.includes("INVENTORY"))throw Object.assign(Error("disabled"),{code:"MODULE_DISABLED",status:403});return scope},requestProvider:()=>{throw Error("must not call")}});await limited.ask({body:{question:"ιδιοκατανάλωση"}},{},e=>error=e);assert.equal(error.code,"MODULE_DISABLED");
});
test("canonical presentation distinguishes missing records from unavailable source without model technical prose",async()=>{
 for(const out of [await read(),await read([]),await read([{...event(),details:{}}])]){const p=presentAssistantAnswer({answer:"BUSINESS_SNAPSHOT cash_details PRIVATE",highlights:["PRIVATE"],limitations:"PRIVATE",evidence:[out]});assert.doesNotMatch(JSON.stringify(p),/PRIVATE|BUSINESS_SNAPSHOT|cash_details/);assert.equal(p.highlights.length,0);if(out.result==="source_limited")assert.match(p.answer,/Δεν εξάγεται/);if(out.result==="no_records")assert.match(p.answer,/Δεν βρέθηκαν καταχωρημένα συμβάντα/)}
});
test("an unperformed consumption read cannot claim no records from cash or snapshot",()=>{
 const out=checkedConsumptionAnswer("ιδιοκατανάλωση",{answer:"Δεν υπάρχουν εγγραφές από cash_details",highlights:["fake zero"],sources:["Cash"]},[]);assert.match(out.answer,/Δεν έγινε ανάγνωση/);assert.deepEqual(out.sources,[]);assert.deepEqual(out.highlights,[]);assert.doesNotMatch(out.answer,/cash_details/);
 const unchanged={answer:"cash"};assert.equal(checkedConsumptionAnswer("Ταμεία",unchanged,[]),unchanged);
});
