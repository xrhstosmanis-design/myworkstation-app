import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {cashChatEvidenceLines} from '../../client/src/lib/cash-chat-evidence.js';

test('shared written labels retain source identity, unread/missing/limited coverage and do not turn upload time into document date',()=>{
 const evidence={chatEvidence:{status:'LIMITED',sources:[{references:[{messageId:'paper-1',filename:'<img onerror=alert(1)>',uploadedAt:'2026-10-26T10:00Z'}]}]},handoffs:{status:'CONTEXT_ONLY',rows:[{previousSessionId:'old',nextSessionId:null,status:'AWAITING_NEXT_SHIFT'}]}};
 const text=cashChatEvidenceLines(evidence).join('\n');assert.match(text,/paper-1/);assert.match(text,/περιορισμένη κάλυψη/);assert.match(text,/Εκκρεμούν ανάγνωση/);assert.match(text,/Αναμονή επόμενης βάρδιας/);assert.match(text,/δεν είναι ημερομηνία παραστατικού/);
 const platform=readFileSync(new URL('../../client/src/components/platform/PlatformAdminApp.jsx',import.meta.url),'utf8');assert.match(platform,/rows\.flatMap\(row=>cashChatEvidenceLines\(row\.investigation\?\.reviewEvidence\)\)/);assert.match(platform,/cashChatEvidenceLines\(row\.investigation\?\.reviewEvidence\)\.map/);
});

test('actual mounted Backoffice shows read-only handoff/chat evidence, escapes filename and rejects late old-store result without remount',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/cloud/CashControlPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById('root')),calls=[];let active='A',hold=false,resolveOld;
 const session=store=>({id:`shift-${store}`,storeId:store,openedByName:store,openedAt:'2026-10-25T04:00Z',closedAt:'2026-10-25T12:00Z',variance:-3});
 const evidence=store=>({session:session(store),initialVariance:-3,cardVariance:8,reviewEvidence:{chatEvidence:{status:'AWAITING_READING',sources:[{references:[{messageId:`paper-${store}`,filename:'<img src=x onerror=alert(1)>'}]}]},handoffs:{status:'CONTEXT_ONLY',rows:[{previousSessionId:'prior',nextSessionId:`shift-${store}`,status:'MISMATCH',closingOperational:100,openingOperational:97,difference:-3,nextShiftClosed:true}]}}});
 const api=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/investigation'))return hold?new Promise(resolve=>{resolveOld=()=>resolve(evidence('A'));}):evidence(active);if(path.includes('daily-summary'))return {sessions:[session(active)]};return {recent:[]};};
 const render=async store=>{active=store;await act(async()=>root.render(React.createElement(module.exports.default,{api,store:{id:store,name:store}})));};
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 try{
  await render('A');await act(async()=>button('Ανάλυση παράδοσης και χειρόγραφων').click());
  assert.match(document.body.textContent,/paper-A/);assert.match(document.body.textContent,/Διαφορά παράδοσης–παραλαβής/);assert.match(document.body.textContent,/8,00/);assert.equal(document.querySelector('img'),null);assert.equal(calls.filter(c=>c.options.method).length,0);
  await act(async()=>button('Κλείσιμο').click());hold=true;await act(async()=>button('Ανάλυση παράδοσης και χειρόγραφων').click());assert.equal(typeof resolveOld,'function');
  await render('B');await act(async()=>resolveOld());assert.doesNotMatch(document.body.textContent,/paper-A/);assert.equal(button('Ανάλυση παράδοσης και χειρόγραφων').disabled,false);
  hold=false;await act(async()=>button('Ανάλυση παράδοσης και χειρόγραφων').click());assert.match(document.body.textContent,/paper-B/);assert.doesNotMatch(document.body.textContent,/paper-A/);
  assert.equal(calls.filter(c=>c.options.method).length,0);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d] of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}
});
