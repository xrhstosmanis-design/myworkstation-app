import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {fetchDeviceSetup} from "../../client/src/lib/device-setup-download.js";
const hash=async bytes=>Buffer.from(await webcrypto.subtle.digest("SHA-256",bytes)).toString("hex");
async function fixture(){const bytes=new Uint8Array(2048).fill(7);bytes[0]=77;bytes[1]=90;const parts=[bytes.slice(0,1024),bytes.slice(1024)];return{bytes,parts,manifest:{version:"1.0.0",size:2048,sha256:await hash(bytes),parts:await Promise.all(parts.map(async(p,i)=>({name:`part-00${i}.bin`,size:p.length,sha256:await hash(p)})))}}}
test("device helper downloads only fixed assets, verifies bytes and returns one unchanged executable",async()=>{
 const f=await fixture(),calls=[],progress=[];const result=await fetchDeviceSetup({device:"printer",crypto:webcrypto,onProgress:n=>progress.push(n),fetcher:async(url,options)=>{calls.push({url,options});return new Response(url.endsWith("manifest.json")?JSON.stringify(f.manifest):f.parts[Number(url.match(/part-00(\d)/)[1])])}});
 assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()),f.bytes);assert.equal(result.filename,"MyWorkStation-LabelPrinter-Setup.exe");assert.equal(progress.at(-1),100);assert.equal(calls.length,3);for(const c of calls){assert.ok(c.url.startsWith("/downloads/device-setup/v1/"));assert.equal(c.options.credentials,"omit");assert.equal(c.options.redirect,"error");assert.equal(c.options.body,undefined)}
});
test("device helper refuses unsafe manifests before requesting any binary",async()=>{
 const f=await fixture();for(const modify of [m=>null,m=>({...m,size:90*1024*1024}),m=>({...m,parts:[{...m.parts[0],name:"../evil.exe"}]}),m=>({...m,parts:[{...m.parts[0],name:"https://example.com/evil"}]}),m=>({...m,parts:[null]}),m=>({...m,parts:[m.parts[0],m.parts[0]]})]){let count=0;await assert.rejects(fetchDeviceSetup({crypto:webcrypto,fetcher:async()=>{count++;return new Response(JSON.stringify(modify(f.manifest)))}}));assert.equal(count,1)}
});
test("device helper refuses corruption, streamed excess and cancellation without a completed download",async()=>{
 const f=await fixture();let progress=0;
 await assert.rejects(fetchDeviceSetup({crypto:webcrypto,onProgress:n=>progress=n,fetcher:async u=>new Response(u.endsWith("manifest.json")?JSON.stringify(f.manifest):new Uint8Array(1024))}));assert.notEqual(progress,100);
 let cancelled=false;await assert.rejects(fetchDeviceSetup({crypto:webcrypto,fetcher:async u=>u.endsWith("manifest.json")?new Response(JSON.stringify(f.manifest)):new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(1025))},cancel(){cancelled=true}}))}));assert.equal(cancelled,true);
 const control=new AbortController();let calls=0;await assert.rejects(fetchDeviceSetup({crypto:webcrypto,signal:control.signal,fetcher:async u=>{calls++;if(u.endsWith("manifest.json"))return new Response(JSON.stringify(f.manifest));control.abort();return new Response(f.parts[0])}}),e=>e.name==="AbortError");assert.equal(calls,2);
 let read=false;await assert.rejects(fetchDeviceSetup({device:"unknown",crypto:webcrypto,fetcher:async()=>{read=true}}));assert.equal(read,false);
});
