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
import {salesReportCalendar} from '../src/services/sales-report-calendar.js';

const source=readFileSync(new URL('../../client/src/components/voice/SalesAssistantEvidence.jsx',import.meta.url),'utf8');
const module={exports:{}};
new Function('require','module','exports',transformSync(source,{loader:'jsx',format:'cjs'}).code)(createRequire(import.meta.url),module,module.exports);
const Evidence=module.exports.default;
const args={product:'UNIT_FIXTURE',from:'2026-10-10',to:'2026-10-10'},scope={companyId:'c',storeId:'s',storeName:'Fixture LAB'};
function evidence(unit,{missing=false,coverage='COMPLETE'}={}){
 const calendar=salesReportCalendar(args.from,args.to);
 const report={companyId:'c',storeId:'s',period:{calendarFrom:args.from,calendarTo:args.to,timeZone:calendar.timeZone,from:calendar.from.toISOString(),toExclusive:calendar.to.toISOString()},reversalAware:true,count:1,
  items:[{productId:'p',sku:args.product,name:'Fixture product',storeId:'s',salesQuantity:-.25,grossSales:-3.5,netSales:-3,vatValue:-.5,normalSaleCount:0,reversalCount:1,returnGrossValue:3.5,...(missing?{}:{unit})}],
  ...(coverage==='UNKNOWN'?{}:{sourceCoverage:coverage==='INVALID'?null:{complete:coverage==='COMPLETE',returnedGroupCount:1,totalGroupCount:coverage==='COMPLETE'?1:2,limit:coverage==='PARTIAL'?1:10000,totalsScope:coverage==='COMPLETE'?'COMPLETE_SOURCE':'RETURNED_GROUPS'}})};
 return productSalesEvidence(report,args,scope);
}

test('actual product evidence UI distinguishes quantity units without changing signed quantities or money',()=>{
 for(const [value,label,options] of [['PIECE','τεμάχια'],['KG','κιλά'],['LITER','λίτρα'],['PACKAGE','συσκευασίες'],[null,'Μη καταγεγραμμένη'],[undefined,'Μη καταγεγραμμένη',{missing:true}],['',''],['CUSTOM_UNIT','CUSTOM_UNIT'],['toString','toString'],['__proto__','__proto__'],['<img src=x onerror=alert(1)>','<img src=x onerror=alert(1)>']]){
  const input=evidence(value,options),before=JSON.stringify(input);
  const html=renderToStaticMarkup(React.createElement(Evidence,{evidence:[input]})),dom=new JSDOM(html);
  try{
   assert.equal(dom.window.document.querySelectorAll('tbody tr').length,1);
   assert.deepEqual([...dom.window.document.querySelectorAll('th')].map(x=>x.textContent),['Είδος','SKU','Μονάδα','Ποσότητα','Τζίρος με ΦΠΑ','Καθαρή αξία','ΦΠΑ','Επιστροφές / ακυρώσεις']);
   const cells=[...dom.window.document.querySelectorAll('tbody td')].map(x=>x.textContent.replace(/\s/g,' '));
   assert.equal(cells[0],'Fixture product');assert.equal(cells[1],args.product);assert.equal(cells[2],label);
   assert.equal(cells[3],'-0,25');assert.equal(cells[4],'-3,50 €');assert.equal(cells[5],'-3,00 €');assert.equal(cells[6],'-0,50 €');assert.equal(cells[7],'1 · 3,50 €');
   assert.equal(dom.window.document.querySelector('img'),null);assert.equal(JSON.stringify(input),before);
  }finally{dom.window.close();}
 }
});

test('mounted unit evidence removes stale details for partial or invalid sources and retains legacy warnings',async()=>{
 const dom=new JSDOM('<div id="root"></div>'),saved={window:globalThis.window,document:globalThis.document,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const root=createRoot(dom.window.document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(Evidence,{evidence:[evidence('KG')]})));
  assert.equal(dom.window.document.querySelectorAll('tbody td')[2].textContent,'κιλά');
  for(const coverage of ['PARTIAL','INVALID']){
   const input=evidence('KG',{coverage});assert.equal(input.sourceCoverageStatus,coverage);
   await act(async()=>root.render(React.createElement(Evidence,{evidence:[input]})));
   assert.equal(dom.window.document.querySelector('table'),null);assert.match(dom.window.document.body.textContent,/Δεν εμφανίζονται ποσά/);
   assert.doesNotMatch(dom.window.document.body.textContent,/κιλά|Fixture product|-0,25/);
  }
  await act(async()=>root.render(React.createElement(Evidence,{evidence:[evidence(null,{coverage:'UNKNOWN'})]})));
  assert.equal(dom.window.document.querySelectorAll('tbody td')[2].textContent,'Μη καταγεγραμμένη');assert.match(dom.window.document.querySelector('[role="status"]').textContent,/δεν παρέχει επιβεβαίωση/);
 }finally{await act(async()=>root.unmount());globalThis.window=saved.window;globalThis.document=saved.document;globalThis.IS_REACT_ACT_ENVIRONMENT=saved.act;dom.window.close();}
});
