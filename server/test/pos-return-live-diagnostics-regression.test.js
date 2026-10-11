import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const patch=await readFile(new URL("../scripts/patch-pos-return-diagnostics.js",import.meta.url),"utf8");
const render=await readFile(new URL("../../render.yaml",import.meta.url),"utf8");

test("live POS return diagnostics are safe and Render-enabled",()=>{
  assert.match(patch,/POS_RETURN_\$\{stage\}_FAILED/);
  for(const stage of ["SALE_LINE","PAYMENT","STOCK","LEDGER","AUDIT","SALE","UNKNOWN"])assert.match(patch,new RegExp(`\\"${stage}\\"`));
  assert.doesNotMatch(patch,/return res\.status\(500\)\.json\(\{[^}]*raw/);
  assert.match(render,/node server\/scripts\/patch-pos-return-diagnostics\.js/);
});

test("startup patch preserves current inventory guard, remains idempotent and refuses unknown handlers",async()=>{
  const {mkdtemp,mkdir,writeFile,rm}=await import("node:fs/promises");
  const {tmpdir}=await import("node:os");
  const {join}=await import("node:path");
  const {spawnSync}=await import("node:child_process");
  const {runInNewContext}=await import("node:vm");
  const root=await mkdtemp(join(tmpdir(),"mws-return-startup-"));
  try{
    await mkdir(join(root,"scripts"));await mkdir(join(root,"src"));
    const script=join(root,"scripts/patch-pos-return-diagnostics.mjs");
    const target=join(root,"src/index.js");
    await writeFile(script,patch);
    const current=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
    const start=current.indexOf("app.use((err,req,res,next)=>");
    const end=current.indexOf("const __dirname",start);
    assert.ok(start>=0&&end>start);
    const handler=current.slice(start,end);
    await writeFile(target,handler);
    const first=spawnSync(process.execPath,[script],{encoding:"utf8"});
    assert.equal(first.status,0,first.stderr);
    const patched=await readFile(target,"utf8");
    const second=spawnSync(process.execPath,[script],{encoding:"utf8"});
    assert.equal(second.status,0,second.stderr);
    assert.equal(await readFile(target,"utf8"),patched);
    let middleware;
    runInNewContext(patched,{app:{use(fn){middleware=fn}},console:{error(){}}});
    const response=(err,url="/api/store-pos/stores/store/sales/sale/reverse")=>{
      let status,body;const res={status(n){status=n;return this},json(v){body=v;return this}};
      middleware(err,{originalUrl:url},res,()=>{});
      return {status,body:JSON.parse(JSON.stringify(body))};
    };
    assert.equal(response({meta:{message:"MWS_BAKED_TOTAL_GUARD"}}).status,409);
    const reversal=response({meta:{code:"42P01 secret",message:"Payment secret credentials"}});
    assert.equal(reversal.status,500);
    assert.equal(reversal.body.stage,"PAYMENT");
    assert.equal(reversal.body.code,"POS_RETURN_PAYMENT_FAILED");
    assert.doesNotMatch(JSON.stringify(reversal.body),/secret credentials/);
    const ordinary=response({message:"private database detail"},"/api/unrelated");
    assert.deepEqual(ordinary,{status:500,body:{error:"Παρουσιάστηκε εσωτερικό σφάλμα."}});
    const unknown="app.use((err,req,res,next)=>res.json({changed:true}));";
    await writeFile(target,unknown);
    const refused=spawnSync(process.execPath,[script],{encoding:"utf8"});
    assert.notEqual(refused.status,0);
    assert.equal(await readFile(target,"utf8"),unknown);
  }finally{await rm(root,{recursive:true,force:true})}
});
