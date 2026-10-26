import test from "node:test";
import assert from "node:assert/strict";
import {createCameraAcquisition,cameraConstraints,captureCameraFrame} from "../../client/src/lib/camera-acquisition.js";
import {scanDocument,pairDocumentScanner,decodeScannedPages,ScannerPairingRequired} from "../../client/src/lib/document-scanner.js";

const memory=()=>{const data=new Map();return{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}};
const response=(value,status=200)=>({ok:status<400,status,text:async()=>JSON.stringify(value)});
const token="a".repeat(64),jpeg="/9j/2Q==";

test("camera acquires full document detail with capability fallback, never retries permission denial",async()=>{
  const calls=[];let focused=0,stopped=0;const stream={getVideoTracks:()=>[{}],getTracks:()=>[{stop:()=>stopped++}]};
  const camera=createCameraAcquisition({mediaDevices:{getUserMedia:async c=>{calls.push(c);if(calls.length===1)throw Object.assign(Error(),{name:"OverconstrainedError"});return stream}},focus:async()=>focused++});
  assert.equal(await camera.open(),stream);assert.equal(calls.length,2);assert.equal(calls[0].video.width.ideal,3840);assert.equal(focused,1);camera.dispose();assert.equal(stopped,1);
  let tries=0;const refused=createCameraAcquisition({mediaDevices:{getUserMedia:async()=>{tries++;throw Object.assign(Error(),{name:"NotAllowedError"})}}});
  await assert.rejects(refused.open(),{name:"NotAllowedError"});assert.equal(tries,1);assert.equal(cameraConstraints("qr").video.width.ideal,1920);
});
test("cancel, superseding open and unmount stop streams arriving after browser permission",async()=>{
  const pending=[];let stops=0;const stream=()=>({getTracks:()=>[{stop:()=>stops++}],getVideoTracks:()=>[]});
  const camera=createCameraAcquisition({mediaDevices:{getUserMedia:()=>new Promise(resolve=>pending.push(resolve))},focus:async()=>{}});
  const first=camera.open();camera.cancel();pending.shift()(stream());assert.equal(await first,null);assert.equal(stops,1);
  const old=camera.open(),fresh=camera.open();pending.shift()(stream());pending.shift()(stream());assert.equal(await old,null);assert.ok(await fresh);assert.equal(stops,2);camera.dispose();assert.equal(stops,3);
  const after=camera.open();assert.equal(await after,null);assert.equal(pending.length,0);
});
test("capture refuses an unready camera rather than inventing a black 1280x720 frame",async()=>{
  await assert.rejects(captureCameraFrame({readyState:1,videoWidth:0,videoHeight:0}),/Περίμενε/);
});
test("pairing is explicit, validates tokens and never invokes scan or a business endpoint",async()=>{
  const storage=memory(),calls=[];const fetcher=async(url,options)=>{calls.push({url,options});return response({token})};
  await assert.rejects(pairDocumentScanner("12345",{storage,fetcher}),/εξαψήφιο/);assert.equal(calls.length,0);
  await pairDocumentScanner("123456",{storage,fetcher});assert.equal(calls.length,1);assert.equal(calls[0].url,"http://127.0.0.1:17839/pair");assert.equal(calls[0].options.credentials,"omit");assert.equal(calls[0].options.redirect,"error");
  assert.equal([...Object.keys(calls[0].options.headers)].includes("Authorization"),false);
});
test("scan requires pairing and rejects malformed or oversized device pages",async()=>{
  await assert.rejects(scanDocument({storage:memory(),fetcher:()=>assert.fail()}),ScannerPairingRequired);
  for(const value of [null,{pages:[]},{pages:[{jpeg:"https://example.com/a.jpg"}]},{pages:[{jpeg:"/9j/AAAA"}]},{pages:Array.from({length:6},()=>({jpeg}))}])assert.throws(()=>decodeScannedPages(value));
  const pages=decodeScannedPages({pages:[{jpeg},{jpeg}]},2);assert.equal(pages.length,2);assert.equal(pages[0].type,"image/jpeg");assert.equal(pages[1].name,"sarosi-selida-2.jpg");
});
test("one explicit scan at a time; a cancelled late response cannot supply files; no retry",async()=>{
  const storage=memory();await pairDocumentScanner("123456",{storage,fetcher:async()=>response({token})});
  let finish,calls=0;const fetcher=async(url,options)=>{calls++;assert.equal(url,"http://127.0.0.1:17839/scan");assert.equal(options.headers.Authorization,`Bearer ${token}`);assert.match(JSON.parse(options.body).requestId,/^[a-f0-9-]{36}$/);return new Promise(resolve=>finish=resolve)};
  const controller=new AbortController(),first=scanDocument({storage,signal:controller.signal,fetcher});
  await assert.rejects(scanDocument({storage,fetcher}),/ήδη/);controller.abort();finish(response({pages:[{jpeg}]}));await assert.rejects(first,{name:"AbortError"});assert.equal(calls,1);
  assert.equal((await scanDocument({storage,fetcher:async()=>response({pages:[{jpeg}]})})).length,1);
});
