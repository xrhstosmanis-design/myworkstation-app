import test from "node:test";
import assert from "node:assert/strict";
import {dailyConsumptionRequest,consumptionTool,readAssistantConsumption} from "../src/services/assistant-consumption.js";
import {runOwnerAssistant} from "../src/services/owner-sales-tools.js";
import {cashTool} from "../src/services/assistant-cash-tools.js";
import {createPlatformAssistantSession} from "../src/services/platform-assistant-products.js";
import {createOwnerAssistantHandlers} from "../src/services/owner-assistant-handlers.js";
import {parseAssistantSourceRead} from "../src/services/assistant-source-read.js";

const question="Βγάλε μου λίστα ιδιοκατανάλωσης ΓΙΑ 13/10",now=new Date("2026-10-13T18:07:00Z");
const expected={kind:"SELF_CONSUMPTION",from:"2026-10-13",to:"2026-10-13",product:null};
const scope={companyId:"c",storeId:"s",storeName:"Selected"};
const forbidden=()=>{throw Error("provider must not choose daily filters")};
const report=async(args,s=scope)=>readAssistantConsumption(args,s,{now,db:{$queryRaw:async()=>[]}});

test("daily list resolves supplied date and omitted year in Athens; validates real calendar",()=>{
 for(const q of [question,"Δείξε μου την αναφορά ιδιοκατανάλωσης στις 13/10/26","λίστα ιδιοκατανάλωσης 2026-10-13"])
  assert.deepEqual(dailyConsumptionRequest(q,{now}),{args:expected});
 assert.equal(dailyConsumptionRequest("λίστα ιδιοκατανάλωσης 1/1",{now:new Date("2026-12-31T22:30:00Z")}).args.from,"2027-01-01");
 for(const q of ["λίστα ιδιοκατανάλωσης 31/2","λίστα ιδιοκατανάλωσης 13/13/2026"]){const out=dailyConsumptionRequest(q,{now});assert.ok(out.clarification);assert.equal(out.args,undefined)}
 for(const q of ["λίστα ιδιοκατανάλωσης νερό 13/10","λίστα ιδιοκατανάλωσης 13/10 και ταμείο","λίστα ιδιοκατανάλωσης 13/10 για άλλο κατάστημα","λίστα ιδιοκατανάλωσης από 1/10 έως 13/10","λίστα ιδιοκατανάλωσης 13/10 ή 14/10","ιδιοκατανάλωση 13/10\nΠροηγούμενο θέμα: νερό"])
  assert.equal(dailyConsumptionRequest(q,{now}),null);
});

test("daily dispatcher reads the existing source once, retains strict replay filters, never consults provider",async()=>{
 let reads=0;const out=await runOwnerAssistant({question,prompt:"untrusted provider prompt",now,cashTool,tools:[consumptionTool],requestProvider:forbidden,readConsumption:async a=>{reads++;assert.deepEqual(a,expected);return report(a)}});
 assert.equal(reads,1);assert.equal(out.evidence[0].result,"no_records");assert.deepEqual(parseAssistantSourceRead(out.reads[0]),out.reads[0]);
 assert.equal((await report(out.reads[0].args)).from,out.evidence[0].from);
 await assert.rejects(runOwnerAssistant({question:"λίστα ιδιοκατανάλωσης 31/2",now,cashTool,tools:[consumptionTool],requestProvider:forbidden,readConsumption:forbidden}),e=>e.status===422&&/έγκυρη ημερομηνία/.test(e.message));
 await assert.rejects(runOwnerAssistant({question,now,cashTool,tools:[consumptionTool],requestProvider:forbidden,readConsumption:async()=>{throw Object.assign(Error("revoked"),{status:401})}}),e=>e.status===401);
});

test("Platform daily list stays selected, reauthorizes, exports by canonical replay and refuses changed scope",async()=>{
 let count=0;const session=await createPlatformAssistantSession({},scope,{authorize:async()=>{count++;return scope},readConsumption:report});
 const out=await session.run({question,prompt:"Fixture",requestProvider:forbidden});assert.equal(out.evidence[0].scope,"PLATFORM_SELECTED_STORE");assert.equal(out.evidence[0].storeId,"s");assert.equal(out.reads[0].args.product,null);assert.ok(count>=4);
 const replay=await session.replay(out.reads);assert.equal(replay[0].from,out.evidence[0].from);
 let revoked=false;const changed=await createPlatformAssistantSession({},scope,{authorize:async()=>revoked?{...scope,storeId:"foreign"}:scope,readConsumption:async a=>{revoked=true;return report(a)}});
 await assert.rejects(changed.run({question,prompt:"Fixture",requestProvider:forbidden}),e=>e.code==="PLATFORM_ASSISTANT_CONTEXT_CHANGED");
 const all=await createPlatformAssistantSession({},null,{allStores:true,authorize:async()=>null});await assert.rejects(all.run({question,prompt:"Fixture",requestProvider:forbidden}),e=>e.status===422);
});

test("Owner daily response still checks INVENTORY module and current selected scope around source",async()=>{
 let value,checks=[];const handlers=createOwnerAssistantHandlers({authorize:async(req,o)=>{checks.push(o.requiredModules);return scope},readConsumption:report,requestProvider:forbidden});
 await handlers.ask({body:{question}},{json:x=>value=x},e=>{throw e});assert.equal(value.readOnly,true);assert.equal(value.evidence[0].storeId,"s");assert.equal(value.evidence[0].productQuery,null);assert.ok(checks.filter(x=>x.includes("INVENTORY")).length>=3);
 let error;const denied=createOwnerAssistantHandlers({authorize:async(req,o)=>{if(o.requiredModules.includes("INVENTORY"))throw Object.assign(Error("disabled"),{code:"MODULE_DISABLED",status:403});return scope},readConsumption:forbidden,requestProvider:forbidden});
 await denied.ask({body:{question}},{},e=>error=e);assert.equal(error.status,403);
 await handlers.ask({body:{question:"λίστα ιδιοκατανάλωσης 31/2"}},{},e=>error=e);assert.equal(error.status,422);assert.match(error.message,/έγκυρη ημερομηνία/);
});
