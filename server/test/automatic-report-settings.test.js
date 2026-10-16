import test from "node:test";
import assert from "node:assert/strict";
import {automaticReportConfigurationSchema,automaticReportSettingsUpdateSchema,automaticReportScope} from "../src/services/automatic-report-settings.js";
import {legacyCashControlRule,cashRuleFields,sameCashRule} from "../src/services/cash-control-rules.js";
import {readAutomaticDailyCashPreview} from "../src/services/automatic-report-source.js";

const rule=cashRuleFields(legacyCashControlRule({name:"LAB"}));
const configuration=()=>({dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:23,terminals:[{terminalPos:"MAIN",requiredSlots:[1,2,3]},{terminalPos:"DELIVERY",requiredSlots:[1]}],cashRule:rule});
test("explicit settings validate slots, terminal identity, ordering, mode and optimistic version without enabling dispatch",()=>{
 assert.equal(automaticReportSettingsUpdateSchema.parse({expectedVersion:0,configuration:configuration()}).configuration.terminals.length,2);
 for(const change of [{terminals:[]},{terminals:[{terminalPos:"MAIN",requiredSlots:[1,2]}]},{terminals:[{terminalPos:"MAIN",requiredSlots:[1,2,3]},{terminalPos:"MAIN",requiredSlots:[1,2,3]}]},{terminals:[{terminalPos:"MAIN",requiredSlots:[1,3,3]}]},{dayStartHour:3},{secondShiftStartHour:23},{thirdShiftStartHour:15},{enabled:true},{cashRule:{...rule,mode:"UNKNOWN"}}])assert.equal(automaticReportConfigurationSchema.safeParse({...configuration(),...change}).success,false,JSON.stringify(change));
 for(const extra of [{actorId:"spoof"},{storeId:"foreign"},{enabled:true},{expectedVersion:-1}])assert.equal(automaticReportSettingsUpdateSchema.safeParse({expectedVersion:0,configuration:configuration(),...extra}).success,false);
});
test("shared legacy fallback preserves all three difference-only stores and normal delivery rules",()=>{
 for(const name of ["ΕΣΤΙΑ","Πετρούπολη","Γαλάτσι","Κατάστημα Εστία 2"]){const r=legacyCashControlRule({name});assert.equal(r.mode,"DIFFERENCE_ONLY");assert.equal(r.carryOverEnabled,false);assert.equal(r.posEftposEnabled,false);assert.equal(r.deliveryTerminalPattern,"DELIVERY")}
 assert.equal(legacyCashControlRule({name:"ΚΑΤ"}).mode,"FULL");
 assert.equal(sameCashRule(rule,{...rule,source:"DEFAULT"}),true);assert.equal(sameCashRule(rule,{...rule,carryOverEnabled:false}),false);
});
test("scope rechecks actual role before querying the selected active store",async()=>{
 let storeCalls=0;const db={user:{findUnique:async()=>({role:"OWNER"})},store:{findFirst:async()=>{storeCalls++;return null}}};
 await assert.rejects(automaticReportScope(db,{actorId:"u",companyId:"c",storeId:"s"}),e=>e.status===403);assert.equal(storeCalls,0);
 db.user.findUnique=async()=>({role:"SUPER_ADMIN"});await assert.rejects(automaticReportScope(db,{actorId:"u",companyId:"c",storeId:"s"}),e=>e.status===404);
 await assert.rejects(automaticReportScope(db,{actorId:"u",companyId:"c",storeId:""}),e=>e.status===400);
});
test("confirmed effective legacy rule is explicit and changed rules/settings hold even a complete source",async()=>{
 const rows=[7,15,23].map((hour,i)=>({id:String(i),companyId:"c",storeId:"s",terminalPos:"MAIN",status:"CLOSED",openedAt:new Date(`2026-10-15T${String(hour).padStart(2,"0")}:00:00+03:00`),closedAt:new Date("2026-10-16T07:00:00+03:00"),variance:0}));
 let currentRule=null,version=1;
 const tx={user:{findUnique:async()=>({role:"SUPER_ADMIN"})},store:{findFirst:async()=>({id:"s",companyId:"c",name:"ΕΣΤΙΑ"})},$queryRaw:async strings=>{const sql=strings.join("");return sql.includes('FROM "AutomaticReportSettings"')?[{version}]:sql.includes('FROM "CashControlStoreRule"')?(currentRule?[currentRule]:[]):rows}};
 const db={$transaction:async fn=>fn(tx)},config={...configuration(),terminals:[{terminalPos:"MAIN",requiredSlots:[1,2,3]}],cashRule:cashRuleFields(legacyCashControlRule({name:"ΕΣΤΙΑ"}))},input={actorId:"sa",companyId:"c",storeId:"s",day:"2026-10-15",configuration:config,settingsVersion:1,now:new Date("2026-10-16T08:00:00+03:00")};
 assert.equal((await readAutomaticDailyCashPreview(db,input)).ready,true);
 version=2;const stale=await readAutomaticDailyCashPreview(db,input);assert.equal(stale.groups,null);assert.ok(stale.holds.some(h=>h.code==="REPORT_SETTINGS_CHANGED"));
 version=1;currentRule=rule;const changed=await readAutomaticDailyCashPreview(db,input);assert.equal(changed.groups,null);assert.ok(changed.holds.some(h=>h.code==="CASH_RULE_CHANGED"));
});
