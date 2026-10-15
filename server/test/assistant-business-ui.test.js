import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const result={kind:'business_records',domain:'TRANSFERS_TO_OWNER',title:'Μετρητά προς ιδιοκτήτη',source:'Μετρητά προς ιδιοκτήτη',companyName:'Εταιρεία',storeName:'LAB',from:'2026-10-01',to:'2026-10-15',result:'matched',rows:[{recordId:'r',recordedAt:'2026-10-02T10:00:00Z',recordType:'TRANSFER_OUT',label:'<img src=x>',amount:7.6,operatorName:'Χειριστής',reference:'MAIN',status:null}],totals:{count:1,amount:7.6}};
test('actual business report component shows source count/amount/operator and escapes names without cash fallback',async()=>{
 const out=await build({stdin:{contents:'export {default} from "./client/src/components/voice/AssistantReportEvidence.jsx"',resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom/server']});const m={exports:{}};new Function('require','module','exports',out.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const render=r=>renderToStaticMarkup(React.createElement(m.exports.default,{result:{answer:'BUSINESS_SNAPSHOT',evidence:[r]}}));
 const html=render(result);assert.match(html,/Μετρητά προς ιδιοκτήτη/);assert.match(html,/7,60/);assert.match(html,/Χειριστής/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|Έλεγχος Ταμείων|cash_details|BUSINESS_SNAPSHOT/);
 const capped=render({...result,result:'source_limited',rows:[],totals:null,reason:'Ελλιπής πηγή'});assert.match(capped,/Ελλιπής πηγή/);assert.doesNotMatch(capped,/<table|Συνολικό καταχωρημένο ποσό|0,00/);
 const empty=render({...result,result:'no_records',rows:[],totals:{count:0,amount:0}});assert.match(empty,/Δεν βρέθηκαν καταχωρημένες/);assert.doesNotMatch(empty,/<table|Συνολικό καταχωρημένο ποσό/);
});
