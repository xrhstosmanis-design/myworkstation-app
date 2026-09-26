import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root=new URL("../../",import.meta.url);
const checker=new URL("../../tools/pilot-readiness/check-pilot-readiness.mjs",import.meta.url);
const sample=JSON.parse(fs.readFileSync(new URL("../../tools/pilot-readiness/pilot-site.sample.json",import.meta.url),"utf8"));
const run=file=>spawnSync(process.execPath,[checker.pathname,file],{cwd:root,encoding:"utf8"});

const incomplete=path.join(os.tmpdir(),`pilot-incomplete-${process.pid}.json`);
fs.writeFileSync(incomplete,JSON.stringify(sample));
const failed=run(incomplete);
assert.equal(failed.status,1);
assert.match(failed.stdout,/NOT_READY/);
assert.match(failed.stdout,/Ακριβές production revision/);

const unsafe={...sample,password:"do-not-store-this"};
const unsafeFile=path.join(os.tmpdir(),`pilot-unsafe-${process.pid}.json`);
fs.writeFileSync(unsafeFile,JSON.stringify(unsafe));
const blocked=run(unsafeFile);
assert.equal(blocked.status,1);
assert.match(blocked.stdout,/Απαγορευμένα πεδία μυστικών: password/);

const ready={
  store:{name:"ΠΙΛΟΤΙΚΟ",address:"Δοκιμή",visitDate:"2026-09-28",visitTime:"10:00",receiverName:"Υπεύθυνος",rollbackOwner:"Super Admin"},
  release:{productionRevision:"a".repeat(40),ciGreen:true,backupVerified:true,maintenanceWindowApproved:true},
  terminals:[
    {terminalId:"PILOT-POS-01",device:"Windows tablet",role:"POS_1",scanner:"USB",printer:"Thermal",rbs:"NON_FISCAL",eftpos:"NOT_CONNECTED"},
    {terminalId:"PILOT-POS-02",device:"Windows PC",role:"POS_2",scanner:"USB",printer:"Thermal",rbs:"NON_FISCAL",eftpos:"NOT_CONNECTED"}
  ],
  operations:{operatorsConfirmed:true,catalogPricesVatConfirmed:true,openingStockConfirmed:true,testBasketApproved:true,supportContactConfirmed:true},
  safety:{nonFiscalScopeConfirmed:true,openGatesRecorded:true,credentialsExcluded:true}
};
const complete=path.join(os.tmpdir(),`pilot-ready-${process.pid}.json`);
fs.writeFileSync(complete,JSON.stringify(ready));
const passed=run(complete);
assert.equal(passed.status,0,passed.stderr||passed.stdout);
assert.match(passed.stdout,/"status": "READY"/);

for(const terminals of [ready.terminals.slice(0,1),Array.from({length:20},(_,index)=>({
  ...ready.terminals[0],terminalId:`PILOT-POS-${index+1}`,role:`POS_${index+1}`
}))]){
  fs.writeFileSync(complete,JSON.stringify({...ready,terminals}));
  const result=run(complete);
  assert.equal(result.status,0,result.stderr||result.stdout);
}

for(const [label,terminals,reason] of [
  ["empty",[],"Τουλάχιστον ένα πραγματικό POS terminal"],
  ["duplicate-id",[{...ready.terminals[0]},{...ready.terminals[1],terminalId:"pilot-pos-01"}],"Μοναδικό Terminal ID"],
  ["duplicate-role",[{...ready.terminals[0]},{...ready.terminals[1],role:"POS_1"}],"Μοναδικός ρόλος"]
]){
  fs.writeFileSync(complete,JSON.stringify({...ready,terminals}));
  const result=run(complete);
  assert.equal(result.status,1,`${label}: ${result.stdout}`);
  assert.match(result.stdout,new RegExp(reason));
}

fs.rmSync(incomplete,{force:true});
fs.rmSync(complete,{force:true});
fs.rmSync(unsafeFile,{force:true});
console.log("Pilot installation readiness checker passed");
