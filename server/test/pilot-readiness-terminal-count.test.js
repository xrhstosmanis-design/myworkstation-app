import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";

const sample=JSON.parse(await readFile(new URL("../../tools/pilot-readiness/pilot-site.sample.json",import.meta.url),"utf8"));
const script=new URL("../../tools/pilot-readiness/check-pilot-readiness.mjs",import.meta.url).pathname;
const terminal=index=>({terminalId:`PILOT-POS-${index}`,device:`PC ${index}`,role:`POS_${index}`,scanner:"USB",printer:"USB",rbs:"NON_FISCAL",eftpos:"NOT_CONNECTED"});

async function check(terminals){
  const dir=await mkdtemp(path.join(tmpdir(),"pilot-readiness-"));
  try{
    const profile=structuredClone(sample);
    Object.assign(profile.store,{name:"PILOT",address:"Test 1",visitTime:"10:00",receiverName:"Owner",rollbackOwner:"Owner"});
    Object.assign(profile.release,{productionRevision:"abc123",ciGreen:true,backupVerified:true,maintenanceWindowApproved:true});
    Object.keys(profile.operations).forEach(key=>profile.operations[key]=true);
    Object.assign(profile.safety,{nonFiscalScopeConfirmed:true,openGatesRecorded:true});
    profile.terminals=terminals;
    const filename=path.join(dir,"profile.json");
    await writeFile(filename,JSON.stringify(profile));
    const result=spawnSync(process.execPath,[script,filename],{encoding:"utf8"});
    return {code:result.status,...JSON.parse(result.stdout)};
  }finally{await rm(dir,{recursive:true,force:true});}
}

test("each installation accepts one or arbitrarily many real POS terminals",async()=>{
  for(const count of [1,2,3,20]){
    const result=await check(Array.from({length:count},(_,index)=>terminal(index+1)));
    assert.equal(result.status,"READY",JSON.stringify(result.missing));
    assert.equal(result.code,0);
  }
});

test("empty, duplicate ID and duplicate role terminals remain NOT_READY",async()=>{
  for(const terminals of [[],[terminal(1),{...terminal(2),terminalId:"pilot-pos-1"}],[terminal(1),{...terminal(2),role:"POS_1"}]]){
    const result=await check(terminals);
    assert.equal(result.status,"NOT_READY");
    assert.equal(result.code,1);
  }
});
