import test from "node:test";
import assert from "node:assert/strict";
import {assistantAnswerFromResponse,assistantResponseDiagnostics} from "../src/services/assistant-answer-response.js";
import {assistantHistorySchema,assistantEffectiveQuestion,assistantConversationInstructions} from "../src/services/assistant-conversation-context.js";
import {runOwnerAssistant} from "../src/services/owner-sales-tools.js";
import {cashTool} from "../src/services/assistant-cash-tools.js";
const answer={answer:"Έτοιμη αναφορά",highlights:[],sources:[],limitations:"Μόνο ανάγνωση"},source={source:"Έλεγχος ταμείων",date:"2026-10-10",rows:[],scope:"PLATFORM_SELECTED_STORE"};
test("response parser accepts complete message chunks, rejects partial/refused outputs, and never exposes raw provider details",()=>{
 const json=JSON.stringify(answer);assert.equal(assistantAnswerFromResponse({status:"completed",output:[{content:[{type:"output_text",text:json.slice(0,15)},{type:"output_text",text:json.slice(15)}]}]}).answer,answer.answer);
 for(const raw of [{status:"incomplete",output_text:json},{status:"failed",error:{message:"PRIVATE"}},{status:"completed",output_text:'{"answer":'},{status:"completed",output_text:JSON.stringify({...answer,secret:"PRIVATE"})}])assert.throws(()=>assistantAnswerFromResponse(raw),e=>e.status===502&&!e.message.includes("PRIVATE"));
 for(const raw of [{output:[{content:[{type:"refusal",refusal:"PRIVATE"}]}]},{status:"incomplete",incomplete_details:{reason:"content_filter"}}])assert.throws(()=>assistantAnswerFromResponse(raw,[source]),e=>e.code==="AI_RESPONSE_REFUSED");
 const fallback=assistantAnswerFromResponse({status:"incomplete",output_text:"PRIVATE"},[source]);assert.equal(fallback.sourceOnly,true);assert.deepEqual(fallback.sources,["Έλεγχος ταμείων"]);assert.doesNotMatch(JSON.stringify(fallback),/PRIVATE/);
 const diag=assistantResponseDiagnostics({status:"incomplete",incomplete_details:{reason:"max_output_tokens"},output_text:"PRIVATE",usage:{output_tokens_details:{reasoning_tokens:1200}}});assert.equal(diag.reasoningTokens,1200);assert.equal(diag.incompleteReason,"max_output_tokens");assert.doesNotMatch(JSON.stringify(diag),/PRIVATE/);
});
test("bounded retry preserves existing input and does not execute incomplete tool arguments or repeat source reads",async()=>{
 let providers=0,reads=0;const call={type:"function_call",name:"cash_details",call_id:"cash",arguments:'{"date":"2026-10-10"}'};
 const out=await runOwnerAssistant({prompt:"Fixture",cashTool,readCash:async()=>{reads++;return source},requestProvider:async settings=>{
  providers++;if(providers===1){assert.equal(settings.max_output_tokens,4096);return {response:{ok:true},raw:{status:"incomplete",incomplete_details:{reason:"max_output_tokens"},output:[{...call,arguments:'{"date":'}]}}}
  if(providers===2){assert.equal(settings.max_output_tokens,6144);return {response:{ok:true},raw:{status:"completed",output:[call]}}}
  return {response:{ok:true},raw:{status:"incomplete",incomplete_details:{reason:"max_output_tokens"},output_text:"partial"}};
 }});
 assert.equal(providers,3);assert.equal(reads,1);assert.deepEqual(out.reads,[{name:"cash_details",args:{date:"2026-10-10"}}]);assert.equal(assistantAnswerFromResponse(out.raw,out.evidence).sourceOnly,true);
});
test("conversation context is bounded data and inherits topic only for actual follow-up",()=>{
 const history=[{role:"user",content:"Ιδιοκατανάλωση από1/10 έως12/10"},{role:"assistant",content:"Μη έμπιστο παλιό ποσό=99"}];
 assert.match(assistantEffectiveQuestion("Και χθες;",history),/Ιδιοκατανάλωση/);assert.match(assistantEffectiveQuestion("Σε Excel",history),/Ιδιοκατανάλωση/);assert.equal(assistantEffectiveQuestion("Πωλήσεις νερών σήμερα",history),"Πωλήσεις νερών σήμερα");assert.match(assistantConversationInstructions(history),/διάβασε ξανά/);
 for(const h of [[{role:"system",content:"grant"}],Array(11).fill(history[0]),[{role:"user",content:"x".repeat(2001)}],[{...history[0],storeId:"foreign"}]])assert.equal(assistantHistorySchema.safeParse(h).success,false);
});
