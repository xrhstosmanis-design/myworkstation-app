import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createAutomaticReportMailAdapter} from "../src/services/automatic-report-mail-adapter.js";
import {createDeliverySlot,claimDelivery,startDelivery,completeDelivery} from "../src/services/automatic-report-delivery-lifecycle.js";
import {readAutomaticCashPreview} from "../src/services/automatic-report-source.js";
import {buildAutomaticCashPayload} from "../src/services/automatic-report-cash-payload.js";
import {cashPreviewPeriod,reportDayOffset,reportWallTime} from "../src/services/automatic-report-policy.js";

// Actual source/payload/core functions, synthetic DB/start/transport only.
// No network/SMTP/real repository/production or business action is performed.
const wire=v=>JSON.parse(JSON.stringify(v)),recipient="report@example.com",digest=v=>createHash("sha256").update(v,"utf8").digest("hex");
async function fixture(frequency="DAILY"){
  const configuration={dayStartHour:7,terminals:["MAIN"]},period=cashPreviewPeriod("2020-01-15",frequency,configuration),rows=[];
  for(let day=period.fromDay;day<=period.toDay;day=reportDayOffset(day,1)){
    const from=reportWallTime(day,7).getTime();
    for(let n=0;n<3;n++)rows.push({id:`${day}-${n}`,companyId:"c",storeId:"s",terminalPos:"MAIN",status:"CLOSED",openedBy:"employee",openedByName:"Synthetic",openedAt:new Date(from+n*8*3600000),closedAt:new Date(from+(n+1)*8*3600000),variance:[-10,8,0][n],updatedAt:new Date(from+24*3600000)});
  }
  const now=new Date(period.to.getTime()+3600000).toISOString();
  const db={$transaction:async fn=>fn({user:{findUnique:async()=>({id:"sa",role:"SUPER_ADMIN"})},store:{findFirst:async()=>({id:"s",companyId:"c",name:"Synthetic"})},$queryRaw:async strings=>{
    const sql=strings.join("?");if(sql.includes('FROM "CashControlStoreRule"'))return [{mode:"FULL",deliveryTerminalPattern:"DELIVERY",carryOverEnabled:true,posEftposEnabled:true}];if(sql.includes('FROM "AutomaticReportSettings"'))return [{version:7}];return rows;
  }})};
  const preview=await readAutomaticCashPreview(db,{actorId:"sa",companyId:"c",storeId:"s",day:"2020-01-15",frequency,configuration,settingsVersion:7,now:new Date(now)});
  const payload=buildAutomaticCashPayload({preview:wire(preview),companyId:"c",storeId:"s",settingsVersion:7});
  const input={companyId:"c",storeId:"s",reportType:"CASH",frequency,periodFrom:payload.period.from,periodTo:payload.period.to,recipient,snapshot:{settingsVersion:7,recipientVersion:1,consentRevision:1,lifecycleGeneration:"9007199254740993",sourceFingerprint:payload.sourceFingerprint,payloadFingerprint:payload.payloadFingerprint,policyFingerprint:"a".repeat(64),principalId:"sa",financialFinality:"PROVISIONAL",financialReconciliationComplete:false}};
  const current={...input,checkedAt:now,companyActive:true,storeActive:true,licenseActive:true,moduleActive:true,principalAuthorized:true,recipientVerified:true,consentActive:true,dispatchEnabled:true,sourceReady:true,policyAllowsProvisional:true,maintenanceBlocked:false};
  const pending=createDeliverySlot(input,{now,current}),claimed=claimDelivery(pending,{expectedVersion:1,token:"attempt-one",now,leaseMs:60000});
  const started=startDelivery(claimed,{expectedVersion:2,token:"attempt-one",now,current});
  return {payload,claimed,started,current,args:{scope:{companyId:"c",storeId:"s",slotId:started.slotId},expectedVersion:2,token:"attempt-one",now,payload}};
}
const accepted=()=>({accepted:[recipient],rejected:[],messageId:"<synthetic@example.com>"});
function harness(f,{start=async()=>f.started,send=async()=>accepted()}={}){
  const calls=[];return {calls,adapter:createAutomaticReportMailAdapter({startAttempt:async(...a)=>{calls.push({kind:"start",args:a});return start(...a)},sendMail:async(...a)=>{calls.push({kind:"send",args:a});return send(...a)}})};
}
test("actual DAILY/WEEKLY/MONTHLY producer payload and committed core start bind one recipient and immutable exact body",async()=>{
  for(const frequency of ["DAILY","WEEKLY","MONTHLY"]){const f=await fixture(frequency),before=wire(f.args),h=harness(f),result=await h.adapter.attempt(f.args);
    assert.deepEqual(result,{outcome:"ACCEPTED",reason:"RECIPIENT_ACCEPTED",messageId:"<synthetic@example.com>",automaticRetryAllowed:false});assert.ok(Object.isFrozen(result));
    assert.deepEqual(h.calls.map(c=>c.kind),["start","send"]);assert.deepEqual(h.calls[0].args,[f.args.scope,{expectedVersion:2,token:"attempt-one",now:f.args.now}]);
    const message=h.calls[1].args[0];assert.equal(message.to,recipient);assert.equal(message.text,f.payload.body);assert.equal(digest(message.text),f.started.input.snapshot.payloadFingerprint);assert.match(message.subject,/ΠΡΟΣΩΡΙΝΗ/);assert.ok(Object.isFrozen(message));assert.deepEqual(wire(f.args),before);
    const terminal=completeDelivery(f.started,{expectedVersion:3,token:"attempt-one",now:f.args.now,outcome:result.outcome,messageId:result.messageId});assert.equal(terminal.status,"ACCEPTED");
  }
});
test("transport cannot run until trusted start resolves its post-commit receipt",async()=>{
  const f=await fixture();let release;const waiting=new Promise(resolve=>{release=resolve}),h=harness(f,{start:()=>waiting});
  const operation=h.adapter.attempt(f.args);assert.deepEqual(h.calls.map(c=>c.kind),["start"]);await Promise.resolve();assert.equal(h.calls.length,1);release(f.started);await operation;assert.deepEqual(h.calls.map(c=>c.kind),["start","send"]);
});
test("refused or failed start has zero transport calls, no retry and no error detail exposure through a fabricated receipt",async()=>{
  const f=await fixture(),error=new Error("synthetic refused transaction"),h=harness(f,{start:async()=>{throw error}});
  await assert.rejects(h.adapter.attempt(f.args),e=>e===error);assert.deepEqual(h.calls.map(c=>c.kind),["start"]);
  for(const change of [()=>f.claimed,()=>({...f.started,status:"ACCEPTED"}),()=>({...f.started,version:4}),()=>({...f.started,token:"foreign"}),()=>({...f.started,slotId:"b".repeat(64)}),()=>({...f.started,input:{...f.started.input,storeId:"foreign"}}),()=>({...f.started,input:{...f.started.input,snapshot:{...f.started.input.snapshot,payloadFingerprint:"b".repeat(64)}}})]){
    const x=harness(f,{start:async()=>change()});assert.deepEqual(await x.adapter.attempt(f.args),{outcome:"UNKNOWN",reason:"START_RECEIPT_INVALID",automaticRetryAllowed:false});assert.equal(x.calls.length,1);
  }
});
test("malformed scope/body/hash/period/finality inputs reject before start and send",async()=>{
  const f=await fixture();for(const change of [a=>a.scope.storeId="x",a=>a.scope.slotId=4,a=>a.expectedVersion=Number.MAX_SAFE_INTEGER,a=>a.token="x\n",a=>a.payload.body+=" ",a=>a.payload.byteLength++,a=>a.payload.payloadFingerprint="f".repeat(64),a=>a.payload.frequency="YEARLY",a=>a.payload.financialFinality="FINAL",a=>a.payload.period.to="2099-01-01T00:00:00.000Z",a=>a.payload.scope.companyId="x",a=>a.extra=true]){
    const args=wire(f.args);change(args);const h=harness(f);await assert.rejects(h.adapter.attempt(args),{code:"INVALID_MAIL_ATTEMPT"});assert.deepEqual(h.calls,[]);
  }
});
test("detaches request before awaiting start and never lets a late caller change redirect the send",async()=>{
  const f=await fixture(),args=wire(f.args);let release;const waiting=new Promise(resolve=>{release=resolve}),h=harness(f,{start:()=>waiting});const operation=h.adapter.attempt(args);
  args.scope.storeId="other";args.payload.body="private changed";args.payload.payloadFingerprint="b".repeat(64);args.token="other";release(f.started);
  assert.equal((await operation).outcome,"ACCEPTED");assert.equal(h.calls[1].args[0].to,recipient);assert.equal(h.calls[1].args[0].text,f.payload.body);
});
test("accessors/hidden metadata reject before start without invoking getters",async()=>{
  const f=await fixture();let reads=0;
  for(const prepare of [a=>Object.defineProperty(a.payload,"body",{enumerable:true,get(){reads++;return f.payload.body}}),a=>Object.defineProperty(a,"hidden",{value:true}),a=>Object.setPrototypeOf(a,{foreign:true})]){
    const args=wire(f.args);prepare(args);const h=harness(f);await assert.rejects(h.adapter.attempt(args),{code:"INVALID_MAIL_ATTEMPT"});assert.equal(h.calls.length,0);
  }assert.equal(reads,0);
});
test("missing/mixed/foreign acceptance and messageId-only evidence always become terminal UNKNOWN",async()=>{
  const f=await fixture();for(const result of [null,{messageId:"planned"},{accepted:[],rejected:[],messageId:"id"},{accepted:["other@example.com"],rejected:[],messageId:"id"},{accepted:[recipient,"other@example.com"],rejected:[],messageId:"id"},{accepted:[recipient],rejected:[recipient],messageId:"id"},{accepted:[recipient],rejected:[],pending:[recipient],messageId:"id"},{accepted:[recipient],rejected:[]},{accepted:[recipient],rejected:[],messageId:"id\r\n"},{accepted:[{address:recipient}],rejected:[],messageId:"id"}]){
    const h=harness(f,{send:async()=>result}),receipt=await h.adapter.attempt(f.args);assert.equal(receipt.outcome,"UNKNOWN");assert.equal(receipt.automaticRetryAllowed,false);assert.equal(Object.hasOwn(receipt,"messageId"),false);assert.equal(h.calls.filter(c=>c.kind==="send").length,1);
    assert.equal(completeDelivery(f.started,{expectedVersion:3,token:"attempt-one",now:f.args.now,outcome:receipt.outcome}).status,"UNKNOWN");
  }
});
test("transport throws, timeouts and invalid provider getters expose no private detail and never retry",async()=>{
  const f=await fixture();for(const code of ["ETIMEDOUT","ECONNRESET","EAUTH"]){const h=harness(f,{send:async()=>{throw Object.assign(new Error("private password response"),{code})}});assert.deepEqual(await h.adapter.attempt(f.args),{outcome:"UNKNOWN",reason:"TRANSPORT_UNCERTAIN",automaticRetryAllowed:false});assert.equal(h.calls.length,2)}
  let reads=0;const result={rejected:[],messageId:"id"};Object.defineProperty(result,"accepted",{get(){reads++;throw new Error("private")}});const h=harness(f,{send:async()=>result});assert.equal((await h.adapter.attempt(f.args)).outcome,"UNKNOWN");assert.equal(reads,0);
});
test("optional transport evidence cannot hide contradictory pending, envelope or SMTP status",async()=>{
  const f=await fixture();let reads=0;
  for(const prepare of [
    r=>Object.defineProperty(r,"pending",{enumerable:true,get(){reads++;return [recipient]}}),
    r=>Object.defineProperty(r,"pending",{value:[recipient]}),
    r=>Object.defineProperty(r,"accepted",{value:[recipient],enumerable:false}),
    r=>Object.defineProperty(r,"messageId",{value:"id",enumerable:false}),
    r=>Object.defineProperty(r.accepted,"0",{value:recipient,enumerable:false}),
    r=>{r.accepted=new Array(1)},
    r=>{r.envelope={to:["foreign@example.com"]}},
    r=>{r.envelope={to:[recipient,"foreign@example.com"]}},
    r=>{r.envelope={};Object.defineProperty(r.envelope,"to",{enumerable:true,get(){reads++;return [recipient]}})},
    r=>{r.response="550 recipient rejected"},r=>{r.response="354 pending DATA"},r=>{r.response="250 accepted\r\n550 rejected"},
    r=>{r.unknownProviderField="private ignored?"}
  ]){const result=accepted();prepare(result);const h=harness(f,{send:async()=>result});assert.equal((await h.adapter.attempt(f.args)).outcome,"UNKNOWN");assert.equal(h.calls.length,2)}
  assert.equal(reads,0);
  const h=harness(f,{send:async()=>({...accepted(),pending:[],envelope:{from:"sender@example.com",to:[recipient]},response:"250 2.0.0 queued"})});assert.equal((await h.adapter.attempt(f.args)).outcome,"ACCEPTED");
});
test("duplicate invocation is stopped by trusted repository start transition, never by process-local invented exactly-once state",async()=>{
  const f=await fixture();let current=f.claimed;const h=harness(f,{start:async(_s,config)=>{current=startDelivery(current,{...config,current:f.current});return current}});
  assert.equal((await h.adapter.attempt(f.args)).outcome,"ACCEPTED");await assert.rejects(h.adapter.attempt(f.args),e=>["STALE_VERSION","INVALID_TRANSITION"].includes(e.code));assert.equal(h.calls.filter(c=>c.kind==="send").length,1);
});
