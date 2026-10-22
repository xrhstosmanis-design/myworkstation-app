import test from "node:test";
import assert from "node:assert/strict";
import {saveAutomaticReportSettings} from "../src/services/automatic-report-settings.js";
import {cashRuleFields,legacyCashControlRule} from "../src/services/cash-control-rules.js";
import {withLifecycleContext} from "../src/services/store-lifecycle-context.js";

const scope={actorId:"sa",companyId:"c",storeId:"s"},epoch="9007199254740993";
const configuration=(name="LAB")=>({dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:23,terminals:[{terminalPos:"MAIN",requiredSlots:[1,2,3]}],cashRule:cashRuleFields(legacyCashControlRule({name}))});
const body=(expectedVersion=0,name="LAB")=>({expectedVersion,configuration:configuration(name)});
const clone=value=>structuredClone(value);
function fixture(options={}){
 const log=[];let record=options.record?clone(options.record):null,writes=0,transactions=0;
 const locked={id:"s",companyId:"c",name:options.lockedName||"LAB"};
 const tx={
  user:{findUnique:async()=>{log.push("role");return {role:options.role||"SUPER_ADMIN"}}},
  store:{findFirst:async()=>{log.push("scope");return options.missingScope?null:{...locked,name:"LAB"}}},
  $queryRawUnsafe:async(sql,...values)=>{
   if(sql.includes("current_schema()")){log.push("fence-meta");return [{schema:"fixture",fence:options.legacy?null:"fixture.StoreLifecycleFence"}]}
   if(sql.includes('FROM "fixture"."StoreLifecycleFence"')){
    assert.match(sql,/FOR SHARE NOWAIT$/);assert.deepEqual(values,["s"]);log.push("fence-lock");
    if(options.fenceBusy)throw Object.assign(new Error("busy fence"),{code:"P2010",meta:{code:"55P03"}});
    return [{companyId:options.fenceCompany||"c",generation:options.generation||epoch,maintenance:!!options.maintenance,retired:!!options.retired}];
   }
   if(sql.includes("set_config")){log.push("epoch");assert.deepEqual(JSON.parse(values[0]),{s:epoch});return [{}]}
   throw Error("Unexpected unsafe SQL: "+sql);
  },
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join("?");
   if(sql.includes('FROM "Store"')){
    log.push("store-lock");assert.match(sql,/FOR NO KEY UPDATE NOWAIT/);assert.match(sql,/"active"\s*=\s*true/);assert.ok(values.includes("s")&&values.includes("c"));
    if(options.storeError)throw options.storeError;
    return options.missingLocked?[]:[clone(locked)];
   }
   if(sql.includes('FROM "CashControlStoreRule"')){log.push("rule");return []}
   if(sql.includes('INSERT INTO "AutomaticReportSettings"')){
    log.push("insert");if(record)return [];writes++;record={configuration:JSON.parse(values[2]),version:1,updatedAt:new Date("2026-10-22T12:00:00Z")};return [{version:1}];
   }
   if(sql.includes('UPDATE "AutomaticReportSettings"')){
    log.push("update");if(!record||record.version!==values.at(-1))return [];writes++;record={configuration:JSON.parse(values[0]),version:record.version+1,updatedAt:new Date("2026-10-22T12:00:00Z")};return [{version:record.version}];
   }
   if(sql.includes('FROM "AutomaticReportSettings"')){log.push("readback");return record?[{configurationJson:clone(record.configuration),version:record.version,updatedAt:record.updatedAt}]:[]}
   throw Error("Unexpected tagged SQL: "+sql);
  }
 };
 const db={$transaction:async work=>{transactions++;log.push("begin");const before=clone(record);try{const result=await work(tx);log.push("commit");return result}catch(error){record=before;log.push("rollback");throw error}}};
 return {db,log,get record(){return record},get writes(){return writes},get transactions(){return transactions},save:(input=body(),context={s:epoch})=>withLifecycleContext(context,()=>saveAutomaticReportSettings(db,scope,input))};
}
test("actual settings writer locks original lifecycle epoch before parent Store, rule and first INSERT, then commits",async()=>{
 const f=fixture(),result=await f.save();assert.equal(result.dispatchEnabled,false);assert.equal(result.settings.version,1);
 assert.deepEqual(f.log,["begin","role","scope","fence-meta","fence-lock","epoch","store-lock","rule","insert","readback","commit"]);assert.equal(f.writes,1);assert.equal(f.transactions,1);
});
test("enrolled missing/stale request generations refuse before Store lock or settings write",async()=>{
 for(const context of [{},{s:"0"},{s:"9007199254740992"}]){const f=fixture();await assert.rejects(f.save(body(),context),e=>e.code==="STORE_LIFECYCLE_STALE_GENERATION");assert.equal(f.writes,0);assert.ok(!f.log.includes("store-lock"));assert.equal(f.transactions,1)}
});
test("busy, maintenance, retired and foreign lifecycle fences refuse the actual settings writer",async()=>{
 for(const options of [{fenceBusy:true},{maintenance:true},{retired:true},{fenceCompany:"foreign"}]){const f=fixture(options);await assert.rejects(f.save(),e=>e.status===409&&e.code.startsWith("STORE_LIFECYCLE_"));assert.equal(f.writes,0);assert.ok(!f.log.includes("store-lock"));assert.equal(f.log.at(-1),"rollback")}
});
test("Store NOWAIT conflict becomes explicit409 once, with no rule/readback/write; unrelated DB errors propagate",async()=>{
 const busy=Object.assign(new Error("row busy"),{code:"P2010",meta:{code:"55P03"}}),f=fixture({storeError:busy});
 await assert.rejects(f.save(),e=>e.status===409&&e.code==="REPORT_SETTINGS_BUSY");assert.equal(f.writes,0);assert.equal(f.transactions,1);assert.ok(!f.log.includes("rule"));assert.equal(f.log.at(-1),"rollback");
 const disconnected=Object.assign(new Error("connection lost"),{code:"08006"}),g=fixture({storeError:disconnected});await assert.rejects(g.save(),e=>e===disconnected);assert.equal(g.writes,0);
});
test("fresh locked Store name governs the legacy cash rule instead of the preliminary scope read",async()=>{
 const f=fixture({lockedName:"ΕΣΤΙΑ"});await assert.rejects(f.save(),e=>e.code==="CASH_RULE_CHANGED");assert.equal(f.writes,0);
 const g=fixture({lockedName:"ΕΣΤΙΑ"}),result=await g.save(body(0,"ΕΣΤΙΑ"));assert.equal(result.store.name,"ΕΣΤΙΑ");assert.equal(result.settings.configuration.cashRule.mode,"DIFFERENCE_ONLY");assert.equal(g.writes,1);
});
test("scope and locked-row absence stop before rule/settings work",async()=>{
 for(const options of [{role:"OWNER"},{missingScope:true},{missingLocked:true}]){const f=fixture(options);await assert.rejects(f.save(),e=>[403,404].includes(e.status));assert.equal(f.writes,0);assert.ok(!f.log.includes("rule"))}
});
test("parent locking preserves first-insert/version CAS conflicts and existing settings",async()=>{
 const record={configuration:configuration(),version:4,updatedAt:new Date("2026-10-21T12:00:00Z")};
 for(const expected of [0,3]){const f=fixture({record});await assert.rejects(f.save(body(expected)),e=>e.code==="REPORT_SETTINGS_CHANGED");assert.deepEqual(f.record,record);assert.equal(f.writes,0);assert.ok(f.log.indexOf("store-lock")<f.log.indexOf("rule"))}
 const f=fixture({record}),result=await f.save(body(4));assert.equal(result.settings.version,5);assert.equal(result.dispatchEnabled,false);assert.equal(f.writes,1);
});
test("absent lifecycle fence retains legacy generation zero without enrollment or DDL",async()=>{
 const f=fixture({legacy:true}),result=await f.save(body(),{});assert.equal(result.settings.version,1);assert.ok(!f.log.includes("fence-lock"));assert.ok(f.log.includes("store-lock"));assert.equal(f.writes,1);
});
