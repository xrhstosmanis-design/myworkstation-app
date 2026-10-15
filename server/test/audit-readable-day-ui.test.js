import test from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {readFile} from "node:fs/promises";
import {build} from "esbuild";
import {createRequire} from "node:module";
test("actual Events installer starts today in Athens, preserves explicit refresh, sends hour filters and exports readable Greek evidence",async()=>{
 const dom=new JSDOM('<div class="commerce-hub" data-report-store-id="s"><section class="kiosk-reports-suite" data-report-store-id="s"><div class="kr-tabs"><button data-kr-tab="audit-events">Συμβάντα</button><button data-kr-tab="other">Άλλο</button></div><div class="kr-filter"><div><label>Από<input data-kr-from value="2026-09-01"></label><label>Έως<input data-kr-to value="2026-10-15"></label><input data-kr-q><select data-kr-store><option value="s">Κατάστημα</option></select><button data-kr-search>Αναζήτηση</button></div></div><div class="kr-toolbar"><button data-kr-refresh>Ανανέωση</button><button data-kr-export>CSV</button></div></section></div>',{url:"https://isolated.invalid/"});
 const names=["window","document","location","localStorage","fetch","alert","Date"],saved=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)])),RealDate=Date,calls=[],blobs=[];
 class Clock extends RealDate{constructor(...args){super(...(args.length?args:["2026-10-15T21:03:00Z"]))}static now(){return new RealDate("2026-10-15T21:03:00Z").getTime()}}
 for(const n of names)if(n!=="Date")Object.defineProperty(globalThis,n,{configurable:true,writable:true,value:dom.window[n]});globalThis.Date=Clock;
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;URL.createObjectURL=b=>{blobs.push(b);return"blob:isolated"};URL.revokeObjectURL=()=>{};dom.window.HTMLAnchorElement.prototype.click=function(){};
 const tick=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setTimeout(r,0))};
 globalThis.fetch=async path=>{calls.push(new URL(path,location.href));return {ok:true,json:async()=>({items:[{id:"internal-id",createdAt:"2026-10-15T21:02:00Z",eventType:"STOCK_SALE",eventLabel:"Έξοδος αποθέματος από πώληση",description:"original-id",readableDescription:"ΝΕΡΟ · Έξοδος 2",readableFinancials:"Μεταβολή αποθέματος: -2",actorName:"Ντίνος",storeName:"Κατάστημα",sourceType:"StockMovement"}]})}};
 try{
 const {installKioskReportsAuditV2}=await import("../../client/src/components/commerce/installKioskReportsAuditV2.js");installKioskReportsAuditV2();
 const root=document.querySelector("section"),click=s=>root.querySelector(s).click();
 click('[data-kr-tab="audit-events"]');await tick();
 assert.equal(root.querySelector("[data-kr-from]").value,"2026-10-16");assert.equal(calls.at(-1).searchParams.get("from"),"2026-10-16");assert.equal(calls.at(-1).searchParams.get("storeId"),"s");
 root.querySelector("[data-kr-from]").value="2026-10-10";root.querySelector('[data-video-filter="timeFrom"]').value="00:01";root.querySelector('[data-video-filter="timeTo"]').value="00:10";click("[data-kr-search]");await tick();assert.equal(calls.at(-1).searchParams.get("from"),"2026-10-10");assert.equal(calls.at(-1).searchParams.get("timeFrom"),"00:01");assert.equal(calls.at(-1).searchParams.get("timeTo"),"00:10");
 click("[data-kr-refresh]");await tick();assert.equal(calls.at(-1).searchParams.get("from"),"2026-10-10");
 assert.match(root.textContent,/ΝΕΡΟ · Έξοδος 2/);assert.ok(root.querySelector(".kr-audit-technical"));assert.equal(root.querySelector(".kr-audit-technical").open,false);assert.doesNotMatch(root.querySelector(".kr-head").textContent,/Transaction ID/);
 click("[data-kr-export]");assert.equal(blobs.length,1);const csv=await blobs[0].text();assert.match(csv,/Ημερομηνία και ώρα Ελλάδας/);assert.match(csv,/ΝΕΡΟ · Έξοδος 2/);assert.match(csv,/Ντίνος/);assert.match(csv,/original-id/);
 click('[data-kr-tab="other"]');click('[data-kr-tab="audit-events"]');await tick();assert.equal(root.querySelector("[data-kr-from]").value,"2026-10-16");assert.equal(root.querySelector('[data-video-filter="timeFrom"]').value,"");
 }finally{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;dom.window.close();for(const[n,d]of saved){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n]}}
});
test("actual central Events component defaults both dates to Athens today and carries hours without accepting an old response",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid/"}),names=["window","document","navigator","HTMLElement","IS_REACT_ACT_ENVIRONMENT"],saved=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
 for(const n of names)Object.defineProperty(globalThis,n,{configurable:true,writable:true,value:n==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[n]});
 const React=await import("react"),{createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root")),calls=[],pending=[];let delay=false;
 try{
 const result=await build({entryPoints:[new URL("../../client/src/components/platform/SuperAdminEventsCenter.jsx",import.meta.url).pathname],bundle:true,platform:"node",format:"cjs",external:["react","react-dom"],write:false,logLevel:"silent"}),m={exports:{}};new Function("require","module","exports",result.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const request=async path=>{calls.push(new URL(path,"https://isolated.invalid"));if(delay)await new Promise(r=>pending.push(r));return{items:[{id:"old",description:delay?"OLD RESPONSE":"ΝΕΡΟ",createdAt:new Date().toISOString(),actorName:"Ντίνος"}]}};
 await React.act(async()=>{root.render(React.createElement(m.exports.default,{request,companies:[],onClose:()=>{}}));await new Promise(r=>setTimeout(r,0))});
 const expected=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens"}).format(new Date()),dates=[...document.querySelectorAll('input[type="date"]')];assert.equal(dates[0].value,expected);assert.equal(dates[1].value,expected);
 const time=document.querySelector('input[type="time"]'),set=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set;
 await React.act(async()=>{set.call(time,"08:00");time.dispatchEvent(new dom.window.Event("input",{bubbles:true}));time.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
 delay=true;await React.act(async()=>{document.querySelector(".sa-actions button").click();await new Promise(r=>setTimeout(r,0))});
 assert.equal(calls.at(-1).searchParams.get("timeFrom"),"08:00");
 await React.act(async()=>{set.call(dates[0],"2026-10-01");dates[0].dispatchEvent(new dom.window.Event("input",{bubbles:true}));dates[0].dispatchEvent(new dom.window.Event("change",{bubbles:true}));await new Promise(r=>setTimeout(r,0));});
 await React.act(async()=>{for(const done of pending)done();await new Promise(r=>setTimeout(r,0))});assert.doesNotMatch(document.body.textContent,/OLD RESPONSE/);
 }finally{await React.act(async()=>root.unmount());dom.window.close();for(const[n,d]of saved){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n]}}
});
