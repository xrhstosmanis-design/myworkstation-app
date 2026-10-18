import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import React,{act} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {productSalesEvidence} from '../src/services/owner-sales-tools.js';
import {assistantAnswerFromResponse} from '../src/services/assistant-answer-response.js';
import {assistantReportTables} from '../src/services/assistant-report-table.js';
import {buildAssistantReportFile} from '../src/services/assistant-report-files.js';
import {salesReportCalendar} from '../src/services/sales-report-calendar.js';

const args={product:'TEST1',from:'2026-10-10',to:'2026-10-10'},scope={companyId:'c',storeId:'s',storeName:'Fixture'};
const item={productId:'p',name:'Νερό',sku:'TEST1',storeId:'s',salesQuantity:2,grossSales:1,netSales:.8,vatValue:.2,normalSaleCount:1,reversalCount:0,returnGrossValue:0};
const coverage=(complete=true)=>({complete,returnedGroupCount:1,totalGroupCount:complete?1:2,limit:10000,totalsScope:complete?'COMPLETE_SOURCE':'RETURNED_GROUPS'});
const report=(sourceCoverage=coverage())=>{const c=salesReportCalendar(args.from,args.to);return {companyId:'c',storeId:'s',period:{calendarFrom:args.from,calendarTo:args.to,timeZone:c.timeZone,from:c.from.toISOString(),toExclusive:c.to.toISOString()},reversalAware:true,count:1,items:[item],...(sourceCoverage===undefined?{}:{sourceCoverage})};};
const project=r=>productSalesEvidence(r,args,scope);
const model={status:'completed',output_text:JSON.stringify({answer:'MODEL_PRIVATE 999 ευρώ',highlights:['999'],limitations:''})};

test('checked product coverage rejects partial and inconsistent metadata before matching or claiming absence',()=>{
 const partial=project(report(coverage(false)));assert.equal(partial.sourceCoverageStatus,'PARTIAL');assert.equal(partial.result,'source_limited');assert.deepEqual(partial.rows,[]);assert.deepEqual(partial.sourceCoverage,coverage(false));
 for(const bad of [null,{}, {...coverage(),returnedGroupCount:0},{...coverage(),totalGroupCount:2},{...coverage(),limit:0},{...coverage(),limit:10001},{...coverage(),totalsScope:'RETURNED_GROUPS'},{...coverage(false),complete:true},{...coverage(),totalGroupCount:'1'}]){
  const e=project(report(bad));assert.equal(e.sourceCoverageStatus,'INVALID');assert.equal(e.result,'source_limited');assert.deepEqual(e.rows,[]);assert.equal(Object.hasOwn(e,'sourceCoverage'),false);
 }
 const absent=report(coverage(false));absent.items=[{...item,name:'Other',sku:'OTHER'}];assert.equal(project(absent).result,'source_limited');
});
test('complete metadata preserves canonical amounts; missing legacy metadata stays UNKNOWN with existing cap guard',()=>{
 const complete=project(report());assert.equal(complete.sourceCoverageStatus,'COMPLETE');assert.equal(complete.result,'matched');assert.equal(complete.rows[0].grossSales,1);
 const legacy=report();delete legacy.sourceCoverage;const unknown=project(legacy);assert.equal(unknown.sourceCoverageStatus,'UNKNOWN');assert.equal(unknown.result,'matched');assert.match(unknown.coverageWarning,/δεν παρέχει/);
 legacy.items=Array.from({length:10000},()=>item);legacy.count=10000;assert.equal(project(legacy).result,'source_limited');
 const empty=report({...coverage(),returnedGroupCount:0,totalGroupCount:0});empty.items=[];empty.count=0;const e=project(empty);assert.equal(e.result,'no_match');assert.equal(e.sourceCoverageStatus,'COMPLETE');
});
test('limited product source overrides valid model amounts while refusal and other report kinds retain existing handling',()=>{
 for(const metadata of [coverage(false),null]){const e=project(report(metadata)),answer=assistantAnswerFromResponse(model,[e]);assert.equal(answer.sourceOnly,true);assert.doesNotMatch(JSON.stringify(answer),/MODEL_PRIVATE|999/);assert.match(answer.limitations,/μηδενικό/);}
 const legacy=report();delete legacy.sourceCoverage;assert.match(assistantAnswerFromResponse(model,[project(legacy)]).limitations,/δεν παρέχει/);
 assert.equal(assistantAnswerFromResponse(model,[{kind:'product_stock',result:'source_limited',rows:[]}]).answer,'MODEL_PRIVATE 999 ευρώ');
 assert.equal(assistantAnswerFromResponse(model,[project(report())]).answer,'MODEL_PRIVATE 999 ευρώ');
 assert.throws(()=>assistantAnswerFromResponse({output:[{content:[{type:'refusal'}]}]},[project(report(coverage(false)))]),e=>e.code==='AI_RESPONSE_REFUSED');
});
test('actual React sales evidence renders coverage limits and hides incomplete-source monetary rows',async()=>{
 const source=readFileSync(new URL('../../client/src/components/voice/SalesAssistantEvidence.jsx',import.meta.url),'utf8');
 const compiled=transformSync(source,{loader:'jsx',format:'cjs'}).code,module={exports:{}};
 new Function('require','module','exports',compiled)(createRequire(import.meta.url),module,module.exports);
 const Evidence=module.exports.default;
 for(const metadata of [coverage(false),null]){const html=renderToStaticMarkup(React.createElement(Evidence,{evidence:[project(report(metadata))]}));assert.match(html,/Δεν εμφανίζονται ποσά/);assert.doesNotMatch(html,/<table/);}
 const legacy=report();delete legacy.sourceCoverage;const unknown=renderToStaticMarkup(React.createElement(Evidence,{evidence:[project(legacy)]}));assert.match(unknown,/δεν παρέχει επιβεβαίωση/);assert.match(unknown,/<table/);
 assert.match(renderToStaticMarkup(React.createElement(Evidence,{evidence:[project(report())]})),/επιβεβαιώθηκαν όλες/);
 // Exercise a mounted component changing from complete data to a limited
 // response: monetary rows must disappear rather than survive stale rendering.
 const dom=new JSDOM('<div id="root"></div>'),saved={window:globalThis.window,document:globalThis.document,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const root=createRoot(dom.window.document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(Evidence,{evidence:[project(report())]})));
  assert.equal(dom.window.document.querySelectorAll('tbody tr').length,1);
  for(const metadata of [coverage(false),null]){
   await act(async()=>root.render(React.createElement(Evidence,{evidence:[project(report(metadata))]})));
   assert.equal(dom.window.document.querySelector('table'),null);assert.match(dom.window.document.body.textContent,/Δεν εμφανίζονται ποσά/);
  }
  await act(async()=>root.render(React.createElement(Evidence,{evidence:[project(legacy)]})));
  assert.match(dom.window.document.querySelector('[role="status"]').textContent,/δεν παρέχει επιβεβαίωση/);
 }finally{await act(async()=>root.unmount());globalThis.window=saved.window;globalThis.document=saved.document;globalThis.IS_REACT_ACT_ENVIRONMENT=saved.act;dom.window.close();}
});
test('real CSV output and shared export table retain COMPLETE/PARTIAL/INVALID/UNKNOWN coverage and suppress limited amounts',async()=>{
 const legacy=report();delete legacy.sourceCoverage;
 for(const [input,status,pattern] of [[report(),'COMPLETE',/επιβεβαιώθηκαν όλες/],[report(coverage(false)),'PARTIAL',/Δεν εξάγονται ποσά/],[report(null),'INVALID',/Δεν εξάγονται ποσά/],[legacy,'UNKNOWN',/δεν παρέχει επιβεβαίωση/]]){
  const e=project(input);assert.equal(e.sourceCoverageStatus,status);const table=assistantReportTables([e])[0];assert.match(table.notes.join(' '),pattern);
  const file=await buildAssistantReportFile('csv',[e]);const csv=Buffer.from(file.base64,'base64').toString('utf8');assert.match(csv,pattern);
  if(['PARTIAL','INVALID'].includes(status)){assert.deepEqual(table.rows,[]);assert.doesNotMatch(csv,/Νερό|TEST1/);}else assert.equal(table.rows.length,1);
 }
});
