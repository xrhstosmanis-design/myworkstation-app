import test from "node:test";
import assert from "node:assert/strict";
import {readCanonicalPlatformCash} from "../src/services/assistant-cash-tools.js";
import {createPlatformAssistantSession} from "../src/services/platform-assistant-products.js";
const req={user:{isSuperAdmin:true},headers:{authorization:"Bearer fixture"}};
const scope={companyId:"c",storeId:"s",companyName:"Company",storeName:"Selected"};
const report={date:"2026-10-10",rows:[{companyId:"c",storeId:"s",sessionId:"closed",variance:-5.5,privateNote:"never project"}],totals:{variance:-5.5}};
test("selected central cash uses existing daily store filter and same canonical amounts without private fields",async()=>{
 let sent;
 const out=await readCanonicalPlatformCash(req,"2026-10-10",{scope,port:8080,fetchImpl:async(url,options)=>{sent={url,options};return {ok:true,json:async()=>report}}});
 const u=new URL(sent.url);assert.equal(u.hostname,"127.0.0.1");assert.equal(u.searchParams.get("storeId"),"s");assert.equal(u.searchParams.get("date"),"2026-10-10");
 assert.equal(sent.options.headers.Authorization,"Bearer fixture");assert.equal(out.scope,"PLATFORM_SELECTED_STORE");assert.equal(out.totals.variance,-5.5);assert.equal(out.storeId,"s");assert.equal(out.rows[0].privateNote,undefined);
});
test("selected cash refuses other company/store rows rather than returning global totals or false zero",async()=>{
 for(const changed of [{companyId:"other"},{storeId:"other"}]){
  await assert.rejects(readCanonicalPlatformCash(req,"2026-10-10",{scope,fetchImpl:async()=>({ok:true,json:async()=>({...report,rows:[{...report.rows[0],...changed}]})})}),e=>e.status===502);
 }
 const out=await readCanonicalPlatformCash(req,"2026-10-10",{fetchImpl:async url=>{assert.equal(new URL(url).searchParams.has("storeId"),false);return {ok:true,json:async()=>report}}});
 assert.equal(out.scope,"PLATFORM_ALL_STORES");
});
test("dispatcher binds cash to fresh authorized selected region, retaining central no-selection behavior",async()=>{
 for(const selected of [scope,null]){
  let reads=0,providerCalls=0,authCalls=0;
  const assistant=await createPlatformAssistantSession(req,selected,{allStores:selected===null,authorize:async()=>{authCalls++;return selected},readCash:async(_req,date,options)=>{reads++;assert.equal(date,"2026-10-10");assert.deepEqual(options.scope,selected);return {...report,scope:selected?"PLATFORM_SELECTED_STORE":"PLATFORM_ALL_STORES"}}});
  const result=await assistant.run({prompt:"cash",requestProvider:async()=>{providerCalls++;return {response:{ok:true},raw:providerCalls===1?{output:[{type:"function_call",name:"cash_details",call_id:"cash",arguments:JSON.stringify({date:"2026-10-10"})}]}:{output_text:'{"answer":"same"}',output:[]}}}});
  assert.equal(reads,1);assert.equal(providerCalls,2);assert.ok(authCalls>=4);assert.equal(result.evidence[0].scope,selected?"PLATFORM_SELECTED_STORE":"PLATFORM_ALL_STORES");
 }
});

test("empty selected region cannot silently become an all-store cash query",async()=>{
 await assert.rejects(createPlatformAssistantSession(req,null,{authorize:async()=>null}),e=>e.status===422&&e.code==="PLATFORM_ASSISTANT_SCOPE_REQUIRED");
});

test("shared cash source panel labels selected Platform and Owner reports without presenting them as all stores",async()=>{
 const {build}=await import("esbuild"),{createRequire}=await import("node:module"),{fileURLToPath}=await import("node:url");
 const out=await build({stdin:{contents:'export {default} from "./client/src/components/voice/CashAssistantEvidence.jsx";',resolveDir:fileURLToPath(new URL("../../",import.meta.url)),loader:"jsx"},bundle:true,write:false,format:"cjs",platform:"node",external:["react"]});
 const module={exports:{}};new Function("require","module","exports",out.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const React=await import("react"),{renderToStaticMarkup}=await import("react-dom/server"),Panel=module.exports.default;
 const render=scope=>renderToStaticMarkup(React.createElement(Panel,{evidence:[{...report,scope,storeName:"Selected",rows:[]}]}));
 for(const scope of ["PLATFORM_SELECTED_STORE","OWNER_SELECTED_STORE"]){assert.match(render(scope),/μόνο Selected/);assert.doesNotMatch(render(scope),/όλα τα καταστήματα/);assert.match(render(scope),/Δεν βρέθηκαν κλεισμένες βάρδιες/)}
 assert.match(render("PLATFORM_ALL_STORES"),/όλα τα καταστήματα/);
});
