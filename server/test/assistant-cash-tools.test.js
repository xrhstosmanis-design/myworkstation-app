import test from "node:test";
import assert from "node:assert/strict";
import {cashEvidence,cashToolArguments,readCanonicalPlatformCash,runCashAssistant} from "../src/services/assistant-cash-tools.js";

const report={date:"2026-10-10",fromTime:"00:00",toTime:"23:59",timeZone:"Europe/Athens",rows:[{companyId:"c",companyName:"LAB",storeId:"s",storeName:"Εργαστήριο",sessionId:"shift",shiftLabel:"Πρωί",terminalPos:"MAIN",variance:-12.5,expectedOperational:100,actualOperational:87.5,cardVariance:0,auditRule:{mode:"FULL"},openedBy:"secret-identity",openedByName:"Private name",attachmentData:"private image",investigation:{notes:"private note"}}],totals:{shifts:1,variance:-12.5,privateField:"secret"}};
const req={user:{isSuperAdmin:true},headers:{authorization:"Bearer fixture-session"}};
const tool=(args={date:"2026-10-10"},extra={})=>({type:"function_call",name:"cash_details",call_id:"fixture-call",arguments:JSON.stringify(args),...extra});
const provider=raw=>({response:{ok:true},raw});

test("canonical read uses the original authenticated session and fixed GET route; projection preserves source amounts",async()=>{
  const calls=[];
  const evidence=await readCanonicalPlatformCash(req,"2026-10-10",{port:8080,fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>report}}});
  assert.equal(calls.length,1);assert.equal(calls[0].url,"http://127.0.0.1:8080/api/platform/cash-control/daily?fromTime=00%3A00&toTime=23%3A59&date=2026-10-10");
  assert.equal(calls[0].options.method,"GET");assert.equal(calls[0].options.redirect,"error");assert.deepEqual(calls[0].options.headers,{Authorization:"Bearer fixture-session"});
  assert.equal(evidence.rows[0].variance,report.rows[0].variance);assert.equal(evidence.rows[0].expectedOperational,100);assert.equal(evidence.totals.variance,-12.5);
  assert.equal(JSON.stringify(evidence).includes("private"),false);assert.equal(JSON.stringify(evidence).includes("Private"),false);assert.equal(JSON.stringify(evidence).includes("secret"),false);
});

test("an Owner cannot use this platform capability even with owner stores/module fields; no I/O on denial",async()=>{
  let called=0;const options={fetchImpl:async()=>{called++;throw Error("must not call")}};
  for(const user of [{role:"OWNER",companyId:"c",permissions:["AI_OWNER_ASSISTANT"]},{role:"EMPLOYEE",isSuperAdmin:false},{role:"SUPER_ADMIN"},undefined])await assert.rejects(readCanonicalPlatformCash({...req,user},null,options),e=>e.status===403);
  await assert.rejects(readCanonicalPlatformCash({...req,headers:{}},null,options),e=>e.status===401);
  await assert.rejects(readCanonicalPlatformCash(req,null,{...options,port:"8080/../../remote"}),e=>e.status===503);
  assert.equal(called,0);
});

test("canonical API revocation/unavailability fails closed; no false empty agreement or cached report",async()=>{
  for(const status of [401,403,500])await assert.rejects(readCanonicalPlatformCash(req,null,{fetchImpl:async()=>({ok:false,status})}),e=>e.status===(status===500?502:status));
  await assert.rejects(readCanonicalPlatformCash(req,null,{fetchImpl:async()=>({ok:true,json:async()=>({rows:[],date:"bad"})})}),e=>e.status===502);
});

test("actual calendar dates only; tools cannot choose a store, company, SQL, URL or action",()=>{
  assert.ok(cashToolArguments.safeParse({date:"2024-02-29"}).success);assert.ok(cashToolArguments.safeParse({date:null}).success);
  for(const args of [{date:"2026-02-29"},{date:"2026-13-01"},{date:"2026-01-32"},{date:"tomorrow"},{date:null,storeId:"foreign"},{date:null,companyId:"foreign"},{date:null,url:"https://evil.invalid"},{date:null,sql:"DELETE"},{}])assert.equal(cashToolArguments.safeParse(args).success,false);
});

test("tool output and reasoning are replayed into the existing provider; result includes independent source evidence",async()=>{
  const requests=[],reads=[];
  const result=await runCashAssistant({prompt:"BUSINESS_SNAPSHOT={} QUESTION=δείξε πρόβλημα",readCash:async date=>{reads.push(date);return cashEvidence(report)},requestProvider:async settings=>{requests.push(structuredClone(settings));return requests.length===1?provider({output:[{type:"reasoning",id:"reasoning-fixture",summary:[]},tool()]}):provider({output_text:"answer"})}});
  assert.deepEqual(reads,["2026-10-10"]);assert.equal(requests.length,2);assert.equal(requests[0].store,false);assert.equal(requests[0].parallel_tool_calls,false);assert.equal(requests[0].tools[0].strict,true);
  assert.equal(requests[1].input[1].type,"reasoning");assert.equal(requests[1].input[3].type,"function_call_output");assert.equal(requests[1].input[3].call_id,"fixture-call");assert.equal(JSON.parse(requests[1].input[3].output).rows[0].variance,-12.5);assert.equal(result.evidence[0].rows[0].sessionId,"shift");
});

test("unknown tools, multiple calls, extra scope or malformed arguments never reach the data reader",async()=>{
  for(const output of [[tool({}, {name:"cash_payment"})],[tool(),tool()],[tool({date:null,storeId:"other"})],[tool({}, {arguments:"not json"})],[tool({}, {call_id:""})],[tool({date:"2026-02-30"})]]){
    let reads=0;await assert.rejects(runCashAssistant({prompt:"fixture",requestProvider:async()=>provider({output}),readCash:async()=>{reads++;return report}}));assert.equal(reads,0);
  }
});

test("total budget is two reads and three provider requests; final request disables tools",async()=>{
  let reads=0;const choices=[];
  await assert.rejects(runCashAssistant({prompt:"fixture",readCash:async()=>{reads++;return cashEvidence(report)},requestProvider:async settings=>{choices.push(settings.tool_choice);return provider({output:[tool()]})}}),e=>e.status===502);
  assert.equal(reads,2);assert.deepEqual(choices,["auto","auto","none"]);
});

test("source truncation and missing rows remain explicit, never inferred as zero problems",()=>{
  const many=cashEvidence({...report,rows:Array.from({length:101},(_,i)=>({...report.rows[0],sessionId:String(i)}))});assert.equal(many.rows.length,100);assert.equal(many.totalRows,101);assert.equal(many.truncated,true);assert.equal(many.totals.variance,-12.5);
  const empty=cashEvidence({...report,rows:[]});assert.equal(empty.closedShiftsOnly,true);assert.equal(empty.rows.length,0);assert.equal(empty.scope,"PLATFORM_ALL_STORES");
});
