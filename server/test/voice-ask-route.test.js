import {issueAssistantExportTicket} from "../src/services/assistant-export-ticket.js";
import {assistantAnswerFromResponse,assistantResponseDiagnostics} from "../src/services/assistant-answer-response.js";
import {assistantHistorySchema,assistantEffectiveQuestion,assistantConversationInstructions,assistantQuestionRequiresReport} from "../src/services/assistant-conversation-context.js";
import {consumptionInstructions,checkedConsumptionAnswer} from "../src/services/assistant-consumption.js";
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {z} from "zod";
import {aiCommandUsage} from "../src/services/ai-command-usage.js";
import {createPlatformAssistantSession} from "../src/services/platform-assistant-products.js";
import {productAssistantInstructions} from "../src/services/assistant-product-instructions.js";

// Execute the existing route's actual schema/handler with an isolated provider. No external API/database.
const source = await readFile(new URL("../src/routes/platform-admin.js", import.meta.url), "utf8");
const schemaSource = source.match(/const aiCommandQuestionSchema=.*\nconst aiCommandAnswerSchema=.*\nconst aiResponseText=.*\n/)[0];
const handlerSource = source.slice(source.indexOf('router.post("/ai-command-center/ask"'), source.indexOf("\nexport default router;"));
const snapshot = {generatedAt: "2026-10-10T12:00:00Z", companies: {active: 0, inactive: 0, stores: 0, attention: 0}, problems: {total: 0, cash: 0, payments: 0, paymentDiscrepancies: 0, bank: 0, bankDiscrepancies: 0}, companyStates: []};
const setup = (env = {OPENAI_API_KEY: "fixture-only", OPENAI_COMMAND_CENTER_MODEL: "fixture-model"}, provider = {}) => {
  const calls = [], logs = [], reads = []; let handler;
  new Function("z", "router", "process", "fetch", "console", "aiCommandUsage", "AbortSignal", "createPlatformAssistantSession", "productAssistantInstructions", "consumptionInstructions", "checkedConsumptionAnswer", "assistantAnswerFromResponse", "assistantResponseDiagnostics", "assistantHistorySchema", "assistantEffectiveQuestion", "assistantConversationInstructions", "assistantQuestionRequiresReport", "issueAssistantExportTicket", schemaSource + handlerSource)(
    z, {post(_path, fn) { handler = fn; }}, {env}, async (url, options) => { calls.push({url, options}); return {ok: true, status: 200, json: async () => ({output_text: JSON.stringify({answer: "Fixture", highlights: [], sources: [], limitations: "Snapshot only"}), usage: {input_tokens: 5, output_tokens: 3, total_tokens: 8}, ...(typeof provider==="function"?provider(calls.length):provider)})}; },
    {info: (...args) => logs.push(args)}, aiCommandUsage, {timeout: () => new AbortController().signal}, (req,selection,options)=>createPlatformAssistantSession(req,selection,{...options,authorize:async()=>{if(selection&&(selection.companyId!=="c"||selection.storeId!=="s"))throw Object.assign(Error("foreign pair"),{status:404});return selection?{...selection,companyName:"Fixture company",storeName:"LAB"}:null},readCash:async (_req,date) => {reads.push(date);return {date,rows:[{storeName:"LAB",sessionId:"shift",variance:-12.5}],totals:{}}},readSalesCatalog:async()=>[{productId:"p",name:"ΑΛΦΑ330",categoryName:"ΜΠΥΡΕΣ",unit:"PIECE"}],readSalesReport:async filters=>{reads.push(filters.q);return {companyId:"c",storeId:"s",period:{calendarFrom:filters.calendar.calendarFrom,calendarTo:filters.calendar.calendarTo,timeZone:"Europe/Athens",from:filters.from.toISOString(),toExclusive:filters.to.toISOString()},count:1,reversalAware:true,items:[{productId:"p",name:filters.productIds?"ΑΛΦΑ330":"ΝΕΡΟ",sku:"2269",storeId:"s",storeName:"LAB",salesQuantity:4,grossSales:2,netSales:1.77,vatValue:.23,normalSaleCount:1,reversalCount:0,returnGrossValue:0}]}},readConsumption:async(args,scope)=>{reads.push(args.kind);return {...scope,kind:"consumption",result:"matched",scope:"OWNER_SELECTED_STORE",rows:[{eventId:"event",name:"ΝΕΡΟ",quantity:1,referenceValue:.5}],totals:{referenceValue:.5}}},readStockReport:async filters=>{reads.push(filters.q);return {count:1,items:[{productId:"p",name:"ΝΕΡΟ",sku:"2269",storeId:"s",storeName:"LAB",unit:"PIECE",currentStock:-70}]}}}), productAssistantInstructions, consumptionInstructions, checkedConsumptionAnswer, assistantAnswerFromResponse, assistantResponseDiagnostics, assistantHistorySchema, assistantEffectiveQuestion, assistantConversationInstructions, assistantQuestionRequiresReport, issueAssistantExportTicket
  );
  return {calls, logs, reads, async invoke(body) { let result, status = 200, error; const res = {status(value) { status = value; return this; }, json(value) { result = value; return this; }}; await handler({body,user:{isSuperAdmin:true},headers:{authorization:"Bearer session-fixture"}}, res, value => { error = value; }); return {result, status, error}; }};
};

test("typed clients remain compatible and voice uses the same provider, prompt and read-only response", async () => {
  for (const channel of [undefined, "voice"]) {
    const f = setup(); const response = await f.invoke({question: "Έλεγξε σήμερα", readScope:"all_stores", snapshot, ...(channel ? {inputChannel: channel} : {})});
    assert.equal(response.error, undefined); assert.equal(response.result.readOnly, true); assert.equal(f.calls.length, 1);
    const request = JSON.parse(f.calls[0].options.body); assert.equal(request.model, "fixture-model"); assert.equal(request.tools[0].name, "cash_details"); assert.equal(request.inputChannel, undefined);
    assert.equal(request.store,false);assert.match(request.input[0].content, /BUSINESS_SNAPSHOT=/); assert.equal(f.calls[0].options.headers.Authorization, "Bearer fixture-only");
    const usage = JSON.parse(f.logs[0][1]); assert.equal(usage.feature, channel === "voice" ? "VOICE_ASSISTANT" : "COMMAND_CENTER"); assert.equal(usage.tokens.totalTokens, 8);
    assert.equal(JSON.stringify(f.logs).includes("Έλεγξε σήμερα"), false); assert.equal(JSON.stringify(f.logs).includes("fixture-only"), false);
  }
});

test("actual Ask handler carries a historical cash read into the provider and returns canonical evidence",async()=>{
  const f=setup(undefined,index=>index===1?{output_text:undefined,output:[{type:"function_call",name:"cash_details",call_id:"cash-fixture",arguments:'{"date":"2026-10-09"}'}]}:{});
  const response=await f.invoke({question:"Δείξε το πρόβλημα μετρητών στις 9 Οκτωβρίου",snapshot,readScope:"all_stores",inputChannel:"voice"});
  assert.equal(response.error,undefined);assert.deepEqual(f.reads,["2026-10-09"]);assert.equal(f.calls.length,2);assert.equal(f.logs.length,2);
  assert.equal(response.result.evidence[0].rows[0].variance,-12.5);assert.equal(response.result.evidence[0].rows[0].sessionId,"shift");
  const continued=JSON.parse(f.calls[1].options.body);assert.equal(continued.input.at(-1).type,"function_call_output");assert.match(continued.input.at(-1).output,/-12.5/);
});

test("invalid channel or missing provider never triggers an AI call", async () => {
  const invalid = setup(); assert.ok((await invalid.invoke({question: "Έλεγξε σήμερα", snapshot, inputChannel: "unknown"})).error); assert.equal(invalid.calls.length, 0);
  const absent = setup({}); const response = await absent.invoke({question: "Έλεγξε σήμερα", readScope:"all_stores", snapshot, inputChannel: "voice"});
  assert.equal(response.status, 503); assert.equal(response.result.code, "AI_PROVIDER_NOT_CONFIGURED"); assert.equal(absent.calls.length, 0); assert.equal(absent.logs.length, 0);
});

test("actual Platform Ask accepts an explicit pair and dispatches shared product sources, never cash amounts",async()=>{
  for(const name of ["sales_by_product","stock_by_product"]){const args=name==="sales_by_product"?{product:"2269",from:"2026-10-10",to:"2026-10-10"}:{product:"2269"};const f=setup(undefined,index=>index===1?{output_text:undefined,output:[{type:"function_call",name,call_id:"product",arguments:JSON.stringify(args)}]}:{});
    const out=await f.invoke({question:"Πόσα νερά σήμερα;",selection:{companyId:"c",storeId:"s"},snapshot});assert.equal(out.error,undefined);assert.deepEqual(f.reads,["2269"]);assert.equal(out.result.evidence[0].scope,"PLATFORM_SELECTED_STORE");assert.equal(out.result.scope.companyId,"c");assert.equal(out.result.evidence[0].rows[0][name==="sales_by_product"?"salesQuantity":"currentStock"],name==="sales_by_product"?4:-70);assert.equal(out.result.evidence[0].kind,name==="sales_by_product"?"product_sales":"product_stock");
  }
  for(const selection of [{companyId:"foreign",storeId:"s"},{companyId:"c",storeId:"s",sql:"SELECT"}]){const f=setup();assert.ok((await f.invoke({question:"Πόσα νερά σήμερα;",selection,snapshot})).error);assert.equal(f.calls.length,0)}
});

test("actual Ask rejects an empty region before provider and report reads",async()=>{const f=setup();const out=await f.invoke({question:"νερά σήμερα",snapshot});assert.equal(out.error?.code,"PLATFORM_ASSISTANT_SCOPE_REQUIRED");assert.equal(f.calls.length,0);assert.equal(f.reads.length,0)});
test("actual Platform Ask routes consumption to its selected source and never reports cash-only absence",async()=>{
 const args={kind:"SELF_CONSUMPTION",from:"2026-10-10",to:"2026-10-10",product:null},f=setup(undefined,i=>i===1?{output_text:undefined,output:[{type:"function_call",name:"consumption_details",call_id:"consume",arguments:JSON.stringify(args)}]}:{});
 const out=await f.invoke({question:"Λίστα ιδιοκατανάλωσης από 10/10/2026 έως 10/10/2026",selection:{companyId:"c",storeId:"s"},snapshot});assert.equal(out.error,undefined);assert.deepEqual(f.reads,["SELF_CONSUMPTION"]);assert.equal(out.result.evidence[0].scope,"PLATFORM_SELECTED_STORE");assert.deepEqual(JSON.parse(f.calls[0].options.body).tools.map(t=>t.name),["consumption_details"]);assert.match(out.result.sources[0],/Συμβάντα POS/);
 const noRead=setup(),pending=await noRead.invoke({question:"βγάλε λίστα ιδιοκατανάλωσης",selection:{companyId:"c",storeId:"s"},snapshot});assert.equal(pending.error,undefined);assert.match(pending.result.answer,/Δεν έγινε ανάγνωση/);assert.deepEqual(pending.result.sources,[]);assert.equal(noRead.reads.length,0);
});

test('actual Platform Ask preserves server-owned missing-period clarification with no provider or export ticket',async()=>{
 for(const question of ['βγαλε μου λιστα πωλησεων απο μπυρες','πωλησεις κατηγορια μπυρες']){
  const f=setup(),out=await f.invoke({question,selection:{companyId:'c',storeId:'s'},snapshot:null});assert.equal(out.error,undefined);assert.equal(out.result.clarification,'period');assert.match(out.result.answer,/Για ποια περίοδο/);assert.deepEqual(out.result.evidence,[]);assert.equal(out.result.exportTicket,null);assert.equal(f.calls.length,0);assert.equal(f.reads.length,0);assert.equal(out.result.scope.storeId,'s');
 }
});


test('actual Platform date-only category continuation reads selected canonical source with no cash fallback',async()=>{
 const args={mode:'category',names:['μπίρες'],from:'2026-10-10',to:'2026-10-10'},f=setup(undefined,i=>i===1?{output_text:undefined,output:[{type:'function_call',name:'sales_by_store',call_id:'category',arguments:JSON.stringify(args)}]}:{});
 const out=await f.invoke({question:'10/10/26',history:[{role:'user',content:'πωλησεις κατηγορια μπυρες'},{role:'assistant',content:'Για ποια περίοδο;'}],selection:{companyId:'c',storeId:'s'},snapshot:null});assert.equal(out.error,undefined);assert.equal(out.result.evidence[0].mode,'category');assert.equal(out.result.evidence[0].rows[0].name,'ΑΛΦΑ330');assert.equal(out.result.evidence[0].rows[0].salesQuantity,4);assert.equal(out.result.evidence[0].from,'2026-10-10');assert.deepEqual(f.reads,[null]);const request=JSON.parse(f.calls[0].options.body);assert.deepEqual(request.tools.map(t=>t.name),['sales_by_product','sales_by_store']);assert.match(request.input[0].content,/Προηγούμενο θέμα της ίδιας συνομιλίας: πωλησεις κατηγορια μπυρες/);assert.equal(out.result.exportTicket,null);const ticket=issueAssistantExportTicket({user:{id:'admin',sessionId:'session',sessionVersion:1}},[{name:'sales_by_store',args}],out.result.evidence,{selection:{companyId:'c',storeId:'s'},secret:'isolated-test-secret'});assert.ok(ticket);
});


test('actual dated beer question resolves a model names call through the real selected category reader',async()=>{
 const args={mode:'names',names:['μπύρας'],from:'2026-10-12',to:'2026-10-12'},f=setup(undefined,i=>i===1?{output_text:undefined,output:[{type:'function_call',name:'sales_by_store',call_id:'beer',arguments:JSON.stringify(args)}]}:{});
 const out=await f.invoke({question:'πωλησεις μπυρας 12/10/26',selection:{companyId:'c',storeId:'s'},snapshot:null});assert.equal(out.error,undefined);assert.equal(out.result.evidence[0].mode,'category');assert.equal(out.result.evidence[0].from,'2026-10-12');assert.equal(out.result.evidence[0].rows[0].name,'ΑΛΦΑ330');assert.equal(out.result.evidence[0].rows[0].salesQuantity,4);assert.equal(out.result.evidence[0].stores[0].storeId,'s');assert.deepEqual(f.reads,[null]);assert.deepEqual(JSON.parse(f.calls[0].options.body).tools.map(t=>t.name),['sales_by_product','sales_by_store']);
});


test("actual Platform Ask daily consumption list uses the supplied day without provider calls",async()=>{
 for(const inputChannel of ["text","voice"]){
  const f=setup(undefined,{output:[{type:"function_call",name:"consumption_details",call_id:"bad",arguments:"{invalid}"}]}),out=await f.invoke({question:"Βγάλε μου λίστα ιδιοκατανάλωσης ΓΙΑ 13/10",selection:{companyId:"c",storeId:"s"},snapshot:null,inputChannel});
  assert.equal(out.error,undefined);assert.equal(f.calls.length,0);assert.deepEqual(f.reads,["SELF_CONSUMPTION"]);assert.equal(out.result.evidence[0].scope,"PLATFORM_SELECTED_STORE");assert.equal(out.result.evidence[0].rows[0].referenceValue,.5);assert.match(out.result.sources[0],/Συμβάντα POS/);assert.equal(out.result.readOnly,true);
 }
 const f=setup(),out=await f.invoke({question:"λίστα ιδιοκατανάλωσης 31/2",selection:{companyId:"c",storeId:"s"},snapshot:null});assert.equal(out.error.status,422);assert.match(out.error.message,/έγκυρη ημερομηνία/);assert.equal(f.reads.length,0);assert.equal(f.calls.length,0);
});
