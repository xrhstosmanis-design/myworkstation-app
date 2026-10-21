import test from "node:test";
import assert from "node:assert/strict";
import {readAutomaticCashPreview,readAutomaticCashPreviewInTransaction} from "../src/services/automatic-report-source.js";
import {previewSavedAutomaticCashReport} from "../src/services/automatic-report-settings.js";
import {buildAutomaticCashPayload} from "../src/services/automatic-report-cash-payload.js";

const rule={mode:"FULL",deliveryTerminalPattern:"DELIVERY",carryOverEnabled:true,posEftposEnabled:true};
const configuration={dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:23,terminals:[{terminalPos:"MAIN",requiredSlots:[1,2,3]}],cashRule:rule};
const scope={actorId:"sa",companyId:"c",storeId:"s"},now=new Date("2020-02-03T12:00:00Z");
const input=(frequency="DAILY")=>({...scope,day:"2020-01-15",frequency,configuration,settingsVersion:1,now});
function rows(){
  const result=[];
  for(let n=1;n<=31;n++){
    const day=`2020-01-${String(n).padStart(2,"0")}`,next=new Date(Date.parse(day+"T12:00:00Z")+86400000).toISOString().slice(0,10);
    for(const [i,start,end] of [[0,"07","15"],[1,"15","23"],[2,"23","07"]])result.push({id:day+"-"+i,companyId:"c",storeId:"s",terminalPos:"MAIN",status:"CLOSED",openedBy:"e"+i,openedByName:"Employee "+i,openedAt:new Date(day+"T"+start+":00:00+02:00"),closedAt:new Date((i===2?next:day)+"T"+end+":00:00+02:00"),variance:n===15?[-10,8,0][i]:0,updatedAt:new Date("2020-02-01T05:00:00Z")});
  }
  return result;
}
function fixture({role="SUPER_ADMIN",store=true,settings=true,version=1,changeRule=false,open=false,throwSource=false}={}){
  const calls=[],all=rows();if(open){const row=all.find(r=>r.id==="2020-01-15-2");row.status="OPEN";row.closedAt=null;}
  const tx={
    user:{findUnique:async()=>{calls.push("actor");return {id:"sa",role};}},
    store:{findFirst:async args=>{calls.push("store");assert.deepEqual(args.where,{id:"s",companyId:"c",active:true});return store?{id:"s",companyId:"c",name:"ISOLATED"}:null;}},
    $executeRawUnsafe:async sql=>{calls.push(sql);assert.equal(sql,"SET TRANSACTION READ ONLY");return 0;},
    $queryRaw:async(strings,...values)=>{
      const sql=strings.join("?");calls.push(sql);
      if(sql.includes('FROM "AutomaticReportSettings"'))return settings?[{configurationJson:configuration,version,updatedAt:now}]:[];
      if(sql.includes('FROM "CashControlStoreRule"'))return [{...rule,...(changeRule?{mode:"DIFFERENCE_ONLY"}:{}),updatedAt:now}];
      if(sql.includes('FROM "CashShiftSession"')){
        if(throwSource)throw new Error("isolated source failure");
        const to=values[2],from=values[3];
        return all.filter(r=>r.openedAt<to&&(r.openedAt>=from||r.closedAt>from||!r.closedAt||r.status!=="CLOSED"));
      }
      throw new Error("Unexpected SQL: "+sql);
    }
  };
  const db={$transaction:async(fn,options)=>{calls.push({transaction:options});try{const result=await fn(tx);calls.push("commit");return result;}catch(e){calls.push("rollback");throw e;}}};
  for(const key of ["user","store","$queryRaw","$executeRawUnsafe"])Object.defineProperty(db,key,{get(){throw new Error("Read outside transaction: "+key);}});
  return {db,tx,calls};
}

test("existing public source and caller-owned source have exact daily/week/month parity without nested transactions",async()=>{
  for(const frequency of ["DAILY","WEEKLY","MONTHLY"]){
    const a=fixture(),b=fixture(),args=input(frequency);
    const wrapped=await readAutomaticCashPreview(a.db,args),internal=await readAutomaticCashPreviewInTransaction(b.tx,args);
    assert.deepEqual(internal,wrapped);assert.equal(internal.ready,true);
    assert.deepEqual(a.calls[0],{transaction:{isolationLevel:"RepeatableRead",maxWait:5000,timeout:15000}});
    assert.equal(a.calls.filter(c=>typeof c==="object").length,1);
    assert.equal(b.calls.some(c=>typeof c==="object"||c==="SET TRANSACTION READ ONLY"),false);
    assert.equal(internal.financialFinality,"PROVISIONAL");assert.equal(internal.financialReconciliationComplete,false);
  }
});
test("public invalid inputs still fail before transaction and internal invalid inputs fail before any query",async()=>{
  for(const change of [{actorId:""},{companyId:""},{storeId:""},{configuration:null},{frequency:"YEARLY"},{day:"invalid"}]){
    for(const internal of [false,true]){const f=fixture();await assert.rejects((internal?readAutomaticCashPreviewInTransaction(f.tx,{...input(),...change}):readAutomaticCashPreview(f.db,{...input(),...change})),e=>e.status===400);assert.deepEqual(f.calls,[]);}
  }
});
test("saved preview performs all authority/settings/source reads in one read-only repeatable snapshot",async()=>{
  const f=fixture(),report=await previewSavedAutomaticCashReport(f.db,scope,{day:"2020-01-15",expectedVersion:1},now);
  assert.equal(report.ready,true);assert.equal(report.settingsVersion,1);assert.equal(report.groups[0].netVariance,-2);
  assert.deepEqual(f.calls.slice(0,4),[{transaction:{isolationLevel:"RepeatableRead",maxWait:5000,timeout:15000}},"SET TRANSACTION READ ONLY","actor","store"]);
  assert.equal(f.calls.filter(c=>typeof c==="object").length,1);assert.equal(f.calls.at(-1),"commit");
  const fromWire=buildAutomaticCashPayload({preview:JSON.parse(JSON.stringify(report)),companyId:"c",storeId:"s",settingsVersion:1});
  assert.ok(Object.isFrozen(fromWire));assert.match(fromWire.payloadFingerprint,/^[a-f0-9]{64}$/);
});
test("same-snapshot integration preserves scope/settings refusal before any financial source read",async()=>{
  for(const [options,status,code] of [[{role:"OWNER"},403],[{store:false},404],[{settings:false},409,"REPORT_SETTINGS_REQUIRED"],[{version:2},409,"REPORT_SETTINGS_CHANGED"]]){
    const f=fixture(options);await assert.rejects(previewSavedAutomaticCashReport(f.db,scope,{day:"2020-01-15",expectedVersion:1},now),e=>e.status===status&&(!code||e.code===code));
    assert.equal(f.calls.some(c=>typeof c==="string"&&c.includes('FROM "CashShiftSession"')),false);assert.equal(f.calls.at(-1),"rollback");
  }
});
test("integrated preview retains actual rule/open-source HOLD and payload refusal",async()=>{
  for(const options of [{changeRule:true},{open:true}]){
    const f=fixture(options),report=await previewSavedAutomaticCashReport(f.db,scope,{day:"2020-01-15",expectedVersion:1},now);
    assert.equal(report.ready,false);assert.equal(report.groups,null);assert.equal(report.financialFinality,"PROVISIONAL");
    assert.throws(()=>buildAutomaticCashPayload({preview:JSON.parse(JSON.stringify(report)),companyId:"c",storeId:"s",settingsVersion:1}),e=>e.code==="INVALID_CASH_PAYLOAD");
  }
});
test("source failure propagates through owned transaction without fallback or repair",async()=>{
  const f=fixture({throwSource:true});await assert.rejects(previewSavedAutomaticCashReport(f.db,scope,{day:"2020-01-15",expectedVersion:1},now),/isolated source failure/);
  assert.equal(f.calls.at(-1),"rollback");assert.equal(f.calls.filter(c=>c==="SET TRANSACTION READ ONLY").length,1);
  assert.equal(f.calls.some(c=>typeof c==="string"&&/CREATE|INSERT|UPDATE|DELETE/.test(c)),false);
});
