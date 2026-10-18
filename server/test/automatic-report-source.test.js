import test from "node:test";
import assert from "node:assert/strict";
import {readAutomaticDailyCashPreview} from "../src/services/automatic-report-source.js";

export const input=()=>({actorId:"sa",companyId:"c",storeId:"s",day:"2026-10-15",configuration:{terminals:["MAIN",{terminalPos:"DELIVERY",requiredSlots:[1]}]},now:new Date("2026-10-16T08:00:00+03:00")});
export const shifts=()=>[7,15,23].map((hour,i)=>({id:`s${i}`,companyId:"c",storeId:"s",terminalPos:"MAIN",status:"CLOSED",openedBy:`employee${i}`,openedByName:`Employee ${i}`,openedAt:new Date(`2026-10-15T${hour}:00:00+03:00`.replace("T7:","T07:")),closedAt:new Date(i===2?"2026-10-16T07:00:00+03:00":`2026-10-15T${hour+8}:00:00+03:00`),variance:[-10,8,0][i],updatedAt:new Date("2026-10-16T07:00:00+03:00")})).concat([{id:"d",companyId:"c",storeId:"s",terminalPos:"DELIVERY",status:"CLOSED",openedBy:"delivery",openedByName:"Delivery",openedAt:new Date("2026-10-15T07:00:00+03:00"),closedAt:new Date("2026-10-15T15:00:00+03:00"),variance:20,updatedAt:new Date("2026-10-15T15:00:00+03:00")}]);
export const rule=()=>({mode:"FULL",deliveryTerminalPattern:"DELIVERY",carryOverEnabled:true,posEftposEnabled:true,updatedAt:new Date("2026-10-15T07:00:00+03:00")});
function fixture({role="SUPER_ADMIN",store=true,rules=[rule()],rows=shifts()}={}){
 const calls=[];
 const tx={user:{findUnique:async args=>{calls.push(["actor",args]);return {id:"sa",role}}},store:{findFirst:async args=>{calls.push(["store",args]);return store?{id:"s",companyId:"c",name:"LAB"}:null}},$queryRaw:async(strings,...values)=>{const sql=strings.join("?");calls.push([sql,values]);return sql.includes('FROM "CashControlStoreRule"')?rules:rows}};
 return {calls,db:{$transaction:async(fn,options)=>{calls.push(["transaction",options]);return fn(tx)}}};
}
test("selected-store repeatable snapshot preserves employee differences and delivery isolation",async()=>{
 const {db,calls}=fixture(),report=await readAutomaticDailyCashPreview(db,input());
 assert.equal(report.ready,true);assert.equal(report.sourceCount,4);assert.equal(report.deliveryStatus,"PREVIEW_ONLY");
 assert.deepEqual(report.groups.map(g=>[g.cashChain,g.originalShortage,g.offset,g.netVariance]),[["STORE",10,8,-2],["DELIVERY",0,0,20]]);
 assert.equal(report.groups[0].rows[0].variance,-10);assert.equal(report.employeeLiabilityAdjusted,false);
 assert.equal(calls[0][1].isolationLevel,"RepeatableRead");
 assert.deepEqual(calls.find(([name])=>name==="store")[1].where,{id:"s",companyId:"c",active:true});
 const sql=calls.find(([name])=>name.includes('FROM "CashShiftSession"'));
 assert.match(sql[0],/"companyId"=\? AND "storeId"=\?/);assert.match(sql[0],/"status"<>'CLOSED'/);assert.deepEqual(sql[1].slice(0,2),["c","s"]);
 assert.doesNotMatch(JSON.stringify(report),/closingNote|attachment|responsibleEmail/);
});
test("fresh database role and selected active store are required before reading financial source",async()=>{
 for(const role of ["OWNER","ADMIN","EMPLOYEE",null]){
  const f=fixture({role});await assert.rejects(readAutomaticDailyCashPreview(f.db,input()),e=>e.status===403);
  assert.equal(f.calls.filter(([name])=>name.includes("SELECT")).length,0);
 }
 const f=fixture({store:false});await assert.rejects(readAutomaticDailyCashPreview(f.db,input()),e=>e.status===404);
 assert.equal(f.calls.filter(([name])=>name.includes("SELECT")).length,0);
});
test("missing scope or actual terminal configuration never becomes all-store reporting",async()=>{
 for(const change of [{storeId:""},{companyId:""},{actorId:""},{configuration:null},{configuration:{terminals:[]}}, {configuration:{terminals:["MAIN"],dayStartHour:3}}]){
  const f=fixture(),args={...input(),...change};
  if(change.configuration?.terminals?.length===0){assert.equal((await readAutomaticDailyCashPreview(f.db,args)).ready,false);continue;}
  await assert.rejects(readAutomaticDailyCashPreview(f.db,args),e=>e.status===400);assert.equal(f.calls.length,0);
 }
});
test("missing explicit rule, unsupported EFTPOS mode and unknown delivery chain hold instead of inventing zero",async()=>{
 for(const rules of [[],[{...rule(),mode:"POS_EFTPOS_ONLY"}],[{...rule(),mode:"UNKNOWN"}],[{...rule(),deliveryTerminalPattern:""}]]){
  const report=await readAutomaticDailyCashPreview(fixture({rules}).db,input());assert.equal(report.ready,false);assert.equal(report.groups,null);
 }
 const report=await readAutomaticDailyCashPreview(fixture({rules:[{...rule(),mode:"DIFFERENCE_ONLY",carryOverEnabled:false,posEftposEnabled:false}]}).db,input());
 assert.equal(report.ready,true);assert.equal(report.rule.mode,"DIFFERENCE_ONLY");assert.equal(report.groups[0].netVariance,-2);
});
test("open third, earlier unresolved shift, foreign source, unknown variance and truncation never produce partial totals",async()=>{
 for(const rows of [shifts().map(r=>r.id==="s2"?{...r,status:"OPEN",closedAt:null}:r),[...shifts(),{...shifts()[0],id:"old",openedAt:new Date("2026-10-14T07:00:00+03:00"),status:"OPEN",closedAt:null}],shifts().map(r=>({...r,companyId:"foreign"})),shifts().map(r=>({...r,variance:null})),Array.from({length:1001},(_,i)=>({...shifts()[0],id:`many${i}`}))]){
  const report=await readAutomaticDailyCashPreview(fixture({rows}).db,input());assert.equal(report.ready,false);assert.equal(report.groups,null);
  if(rows.length===1001){assert.equal(report.complete,false);assert.ok(report.holds.some(h=>h.code==="SOURCE_LIMIT_EXCEEDED"));}
 }
});
test("fresh snapshots change fingerprint on amount, rule or shift update without writing source",async()=>{
 const rows=shifts(),snapshot=JSON.stringify(rows),f=fixture({rows});
 const a=await readAutomaticDailyCashPreview(f.db,input()),b=await readAutomaticDailyCashPreview(f.db,input());
 assert.equal(a.sourceFingerprint,b.sourceFingerprint);assert.equal(JSON.stringify(rows),snapshot);
 rows[0].variance=-11;const c=await readAutomaticDailyCashPreview(f.db,input());assert.notEqual(a.sourceFingerprint,c.sourceFingerprint);
 rows[0].variance=-10;rows[0].updatedAt=new Date("2026-10-16T07:10:00+03:00");assert.notEqual(a.sourceFingerprint,(await readAutomaticDailyCashPreview(f.db,input())).sourceFingerprint);
 const changed=await readAutomaticDailyCashPreview(fixture({rules:[{...rule(),carryOverEnabled:false}]}).db,input());assert.notEqual(a.sourceFingerprint,changed.sourceFingerprint);
});

test("source READY and HOLD both retain provisional financial status without treating limitations as missing shifts",async()=>{
 const rows=shifts(),before=JSON.stringify(rows),ready=await readAutomaticDailyCashPreview(fixture({rows}).db,input());
 assert.equal(ready.sourceReadiness,"READY");assert.equal(ready.ready,true);assert.deepEqual(ready.holds,[]);
 assert.equal(ready.financialFinality,"PROVISIONAL");assert.equal(ready.financialReconciliationComplete,false);
 assert.deepEqual(ready.financialLimitations,["DOCUMENT_PAYMENT_RECONCILIATION_NOT_VERIFIED","CASH_REVIEW_EXPLANATIONS_NOT_VERIFIED","PHYSICAL_CASH_AND_CONTROL_BALANCES_NOT_VERIFIED"]);
 assert.deepEqual(ready.groups.map(g=>[g.cashChain,g.originalShortage,g.originalSurplus,g.offset,g.netVariance]),[["STORE",10,8,8,-2],["DELIVERY",0,20,0,20]]);
 assert.equal(ready.employeeLiabilityAdjusted,false);assert.equal(ready.deliveryStatus,"PREVIEW_ONLY");assert.equal(JSON.stringify(rows),before);
 const held=await readAutomaticDailyCashPreview(fixture({rows:rows.filter(r=>r.id!=="s2")}).db,input());
 assert.equal(held.sourceReadiness,"HOLD");assert.equal(held.ready,false);assert.equal(held.groups,null);assert.ok(held.holds.some(h=>h.code==="THIRD_SHIFT_MISSING"));
 assert.equal(held.financialFinality,"PROVISIONAL");assert.equal(held.financialReconciliationComplete,false);assert.deepEqual(held.financialLimitations,ready.financialLimitations);
 // A consumer mutating one response must not alter subsequent disclosures.
 ready.financialLimitations.pop();assert.deepEqual((await readAutomaticDailyCashPreview(fixture().db,input())).financialLimitations,["DOCUMENT_PAYMENT_RECONCILIATION_NOT_VERIFIED","CASH_REVIEW_EXPLANATIONS_NOT_VERIFIED","PHYSICAL_CASH_AND_CONTROL_BALANCES_NOT_VERIFIED"]);
});
