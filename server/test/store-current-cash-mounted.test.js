import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {currentShiftCash} from '../../client/src/components/store/current-shift-cash.js';

const summary=(cashSales=0,expensesTotal=0,extra={})=>({cashSales,expensesTotal,transferIn:0,transferOut:0,...extra});
test('cash balance follows cent-accurate complete ledger with refunds and transfers',()=>{
 assert.equal(currentShiftCash({openingOperational:100},summary()).balance,100);
 assert.equal(currentShiftCash({openingOperational:100},summary(50)).balance,150);
 assert.equal(currentShiftCash({openingOperational:100},summary(50,10)).balance,140);
 assert.equal(currentShiftCash({openingOperational:100,openingSafe:1000},summary(50,10,{transferIn:5,transferOut:20,cardSales:500,irisSales:100})).balance,125);
 assert.equal(currentShiftCash({openingOperational:'0.10'},summary('0.20','0.10')).balance,0.20);
 assert.equal(currentShiftCash({openingOperational:0},summary(-10,-2)).balance,-8);
 assert.equal(currentShiftCash({openingOperational:100},null),null);
 assert.equal(currentShiftCash({openingOperational:100},{cashSales:50}),null);
 assert.equal(currentShiftCash({openingOperational:'bad'},summary()),null);
});

test('actual overview ledger excludes reversals and external expenses and includes customer cash and bank outflow',async()=>{
 const source=await readFile(new URL('../src/routes/store-transactions.js',import.meta.url),'utf8');
 const start=source.indexOf('function totals(rows){'),end=source.indexOf('\nconst transactionSchema=',start);
 assert.ok(start>=0&&end>start);
 const ledger=new Function(source.slice(start,end)+';return totals;')();
 const rows=[{type:'SALE_CASH',amount:50},{type:'SALE_CARD',amount:200},{type:'SALE_IRIS',amount:80},{type:'OTHER_EXPENSE',amount:10,subtractFromShift:true},{type:'SUPPLIER_PAYMENT',amount:99,subtractFromShift:false},{type:'SALE_CASH',amount:999,reversedAt:'2026-10-11'}];
 assert.equal(currentShiftCash({openingOperational:100},ledger(rows)).balance,140);
 rows.push({type:'CUSTOMER_RECEIPT_CASH',amount:5},{type:'TRANSFER_AMOUNT',amount:20},{type:'TRANSFER_OUT',amount:2},{type:'BANK_DEPOSIT',amount:3,subtractFromShift:true});
 assert.equal(currentShiftCash({openingOperational:100},ledger(rows)).balance,160);
});

test('mounted shift center updates current cash and protects complete terminal/store boundaries',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StoreTransactionsPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'});
 const keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT','setInterval','clearInterval'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 let tick,cleared=0,cash=0,expense=0,fail=false,hold=null,release,calls=[];
 globalThis.setInterval=fn=>{tick=fn;return 1};globalThis.clearInterval=()=>{cleared++};
 const api=async(path,options={})=>{
  calls.push({path,options});const storeId=path.match(/stores\/([^/]+)/)[1];
  if(path.includes('/transactions/')){
   if(fail)throw Error('offline');
   const result={store:{id:storeId},openSessions:[{id:storeId+'-main',terminalPos:'MAIN',openingOperational:storeId==='A'?100:7},{id:storeId+'-control',terminalPos:'CONTROL',openingOperational:20}],summaryBySession:{[storeId+'-main']:summary(cash,expense,{cardSales:500,irisSales:80}),[storeId+'-control']:summary(2)},recent:[]};
   if(hold===storeId)return new Promise(r=>{release=()=>r(result)});
   return result;
  }
  if(path.includes('/cash/'))return {store:{id:storeId}};
  // Deliberately empty capped recent lists: authoritative summaries still hold every movement.
  return {rows:[]};
 };
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 const settle=async fn=>act(async()=>{await fn()});
 const mount=id=>settle(()=>root.render(React.createElement(m.exports.default,{api,store:{id}})));
 const text=selector=>document.querySelector(selector)?.textContent;
 const amount=selector=>document.querySelector(selector+' strong')?.textContent;
 const format=v=>v.toLocaleString('el-GR',{style:'currency',currency:'EUR'});
 try{
  await mount('A');assert.equal(amount('.current-shift-cash'),format(100));assert.equal(amount('.current-store-cash'),format(122));
  cash=50;await settle(tick);assert.equal(amount('.current-shift-cash'),format(150));
  expense=10;await settle(()=>window.dispatchEvent(new Event('focus')));assert.equal(amount('.current-shift-cash'),format(140));assert.equal(amount('.current-store-cash'),format(162));
  assert.equal(document.querySelector('.current-shift-cash .cash-balance-breakdown').textContent.includes(format(10)),true);
  const cards=[...document.querySelectorAll('.active-shift-card')];await settle(()=>cards[1].click());assert.equal(amount('.current-shift-cash'),format(22));
  fail=true;await settle(tick);assert.match(text('.cloud-error'),/Αποτυχία ανανέωσης/);assert.equal(amount('.current-shift-cash'),format(22));fail=false;
  hold='A';await settle(tick);const before=calls.length;await settle(tick);assert.equal(calls.length,before,'polls never overlap');
  await mount('B');assert.equal(amount('.current-shift-cash'),format(47));assert.equal(amount('.current-store-cash'),format(69));
  await settle(release);assert.equal(amount('.current-shift-cash'),format(47),'late store A response cannot overwrite B');
  assert.ok(calls.every(c=>!c.options.method||c.options.method==='GET'));
  await settle(()=>root.unmount());assert.ok(cleared>=2);
 }finally{if(document.getElementById('root').hasChildNodes())await act(async()=>root.unmount());dom.window.close();for(const [k,d]of previous){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
