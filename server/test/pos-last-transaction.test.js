import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {completedPosAmount,usePosLastTransaction} from '../../client/src/utils/pos-last-transaction.js';

const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StorePosPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'},logOverride:{'empty-import-meta':'silent'}});

async function fixture(run){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','MutationObserver','localStorage','fetch','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:k==='fetch'?async()=>({ok:true}):dom.window[k]});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 const calls=[],checkouts=[],polls=[],product={id:'water',sku:'2270',name:'Fixture water',salePrice:1,currentStock:100,barcodes:['52101588']};
 const api=async(path,options={})=>{
  calls.push({path,options});
  if(path.endsWith('/checkout'))return new Promise((resolve,reject)=>checkouts.push({resolve,reject,body:JSON.parse(options.body)}));
  if(path.endsWith('/rbs-capdriver-v1/last-fixture'))return new Promise(resolve=>polls.push(resolve));
  if(/^\/api\/store-pos\/stores\/[^/]+$/.test(path))return {products:[product],layout:{quickKeys:[],categories:[]},access:{}};
  if(path.endsWith('/table-service')||path==='/api/netlink/status')throw Error('not enabled');
  return {rows:[],items:[],requests:[],offers:[],stations:[],state:{}};
 };
 const input=()=>document.querySelector('[data-pos-scanner]'),button=()=>document.querySelector('[data-pos-last-transaction]'),amount=()=>button().querySelector('strong').textContent.replace(/\s/g,'');
 const render=async(store='A',operator='one',company='C')=>act(async()=>root.render(React.createElement(module.exports.default,{api,store:{id:store,name:'Fixture '+store},company:{id:company},operator:{id:operator,fullName:operator,terminalPos:'MAIN'}})));
 const scan=async()=>{await act(async()=>{input().focus();Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input(),'52101588');input().dispatchEvent(new dom.window.Event('input',{bubbles:true}))});await act(async()=>input().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})))};
 const click=async(selector)=>act(async()=>document.querySelector(selector).click());
 const finish=async(total,method='CASH')=>{await scan();await click('button.'+(method==='CARD'?'card':'cash'));if(method==='CARD')await click('.pos-card-terminal-picker .pos-primary-inline');await act(async()=>checkouts.at(-1).resolve({total,payments:[{method,amount:total}]}))};
 try{await render();await run({dom,act,root,calls,checkouts,polls,render,scan,click,finish,input,button,amount});}
 finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d] of previous){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
}

test('completed totals accept genuine zero/signed numeric totals and reject fabricated or nonfinite amounts',()=>{
 for(const [value,expected] of [[0,0],['0.00',0],[1.25,1.25],['9.87',9.87],[-.5,-.5]])assert.equal(completedPosAmount(value),expected);
 for(const value of [null,undefined,'',' ',true,false,{},[],NaN,Infinity,-Infinity,'bad','1,25',1e20])assert.equal(completedPosAmount(value),null);
});

test('mounted POS header retains actual completed amount and tap reset changes no payment, cart or tender',async()=>fixture(async f=>{
 assert.equal(f.amount(),'0,00€');assert.ok(f.button().closest('.store-pos-top'));assert.equal(f.button().type,'button');
 await f.scan();await f.click('button.cash');assert.equal(f.amount(),'0,00€');await f.act(async()=>f.checkouts.at(-1).resolve({total:9.25,payments:[{method:'CASH',amount:9.25}]}));assert.equal(f.amount(),'9,25€');
 await f.scan();await f.act(async()=>[...document.querySelectorAll('.number-grid button')].find(b=>b.textContent==='2').click());
 const beforeCalls=f.calls.length,cart=document.querySelector('.standard-lines').textContent,tender=document.querySelector('.money-cards').textContent;
 await f.click('[data-pos-last-transaction]');assert.equal(f.amount(),'0,00€');assert.equal(f.calls.length,beforeCalls);assert.equal(document.querySelector('.standard-lines').textContent,cart);assert.equal(document.querySelector('.money-cards').textContent,tender);assert.equal(document.activeElement,f.input());
 await f.click('button.cash');await f.act(async()=>f.checkouts.at(-1).resolve({total:4.30}));assert.equal(f.amount(),'4,30€');
 await f.finish(6.70,'CARD');assert.equal(f.amount(),'6,70€');assert.equal(f.checkouts.at(-1).body.paymentMethod,'CARD');assert.equal('lastTransaction' in f.checkouts.at(-1).body,false);
 await f.scan();await f.click('button.mixed');await f.click('.pos-primary-action');assert.equal(f.checkouts.at(-1).body.paymentMethod,'MIXED');assert.equal(f.checkouts.at(-1).body.payments.length,2);
 await f.act(async()=>f.checkouts.at(-1).resolve({total:3.45,payments:[{method:'CASH',amount:1.10},{method:'CARD',amount:2.35}]}));assert.equal(f.amount(),'3,45€');
 await f.scan();await f.click('button.cash');assert.equal(f.amount(),'3,45€');await f.act(async()=>f.checkouts.at(-1).reject(Error('rejected')));assert.equal(f.amount(),'3,45€');assert.ok(document.querySelector('.standard-line'));
 await f.click('button.cash');await f.act(async()=>f.checkouts.at(-1).resolve({total:null}));assert.equal(f.amount(),'3,45€');
 await f.finish(0);assert.equal(f.amount(),'0,00€');await f.finish(1.80);assert.equal(f.amount(),'1,80€');
}));

test('display reset retains completion identities: repeated old completion cannot restore a cleared amount',async()=>fixture(async f=>{
 const React=await import('react');let tracker;
 function Header(){tracker=usePosLastTransaction('one-scope');return React.createElement('button',{onClick:tracker.reset},String(tracker.amount));}
 await f.act(async()=>f.root.render(React.createElement(Header)));
 await f.act(async()=>tracker.remember(8.90,'completed-1'));assert.equal(document.querySelector('#root button').textContent,'8.9');
 await f.act(async()=>document.querySelector('#root button').click());assert.equal(document.querySelector('#root button').textContent,'0');
 await f.act(async()=>tracker.remember(8.90,'completed-1'));assert.equal(document.querySelector('#root button').textContent,'0');
 await f.act(async()=>tracker.remember(-.5,'completed-2'));assert.equal(document.querySelector('#root button').textContent,'-0.5');
 await f.act(async()=>tracker.remember(NaN,'invalid'));assert.equal(document.querySelector('#root button').textContent,'-0.5');
 await f.act(async()=>tracker.remember(0,'completed-free'));assert.equal(document.querySelector('#root button').textContent,'0');
}));

test('mounted RBS pending/check phases never replace amount; committed poll updates once and cleared old responses stay zero',async()=>fixture(async f=>{
 await f.finish(2.50);await f.scan();await f.click('button.card');await f.click('.pos-card-terminal-picker .pos-primary-inline');
 const request={id:'last-fixture',status:'PENDING',paymentMethod:'CARD',total:7.30,clientTransactionId:f.checkouts.at(-1).body.clientTransactionId};
 await f.act(async()=>f.checkouts.at(-1).resolve({fiscalPending:true,request}));assert.equal(f.amount(),'2,50€');assert.ok(f.input().disabled);assert.ok(document.querySelector('.pos-card-confirmation-readable'));
 await f.act(async()=>{for(const resolve of f.polls.splice(0))resolve({request:{...request,status:'REQUIRES_CHECK'}})});assert.equal(f.amount(),'2,50€');
 const waiting=f.polls.splice(0);assert.ok(waiting.length);
 await f.act(async()=>waiting[0]({request:{...request,status:'SALE_COMMITTED',saleId:'sale-fixture'}}));assert.equal(f.amount(),'7,30€');assert.equal(document.querySelector('.standard-line'),null);assert.equal(f.checkouts.length,2);
 const calls=f.calls.length;await f.click('[data-pos-last-transaction]');assert.equal(f.amount(),'0,00€');
 await f.act(async()=>{for(const resolve of [...waiting.slice(1),...f.polls.splice(0)])resolve({request:{...request,status:'SALE_COMMITTED',saleId:'sale-fixture'}})});assert.equal(f.amount(),'0,00€');assert.equal(f.calls.length,calls);assert.equal(f.checkouts.length,2);
}));

test('mounted scope changes mask previous amounts and reject late completion even when returning A to B to A',async()=>fixture(async f=>{
 await f.finish(3.40);await f.scan();await f.click('button.cash');const late=f.checkouts.at(-1);
 await f.render('B');assert.equal(f.amount(),'0,00€');await f.render('A');assert.equal(f.amount(),'0,00€');await f.act(async()=>late.resolve({total:9.87}));assert.equal(f.amount(),'0,00€');
 await f.finish(2.13);assert.equal(f.amount(),'2,13€');await f.render('A','two');assert.equal(f.amount(),'0,00€');await f.render('A','one');assert.equal(f.amount(),'0,00€');
 await f.finish(1.10);await f.render('A','one','Other');assert.equal(f.amount(),'0,00€');
}));

test('locally queued offline checkout does not claim a new server completed amount',async()=>fixture(async f=>{
 await f.finish(1.20);await f.scan();Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});await f.click('button.cash');await f.act(async()=>f.checkouts.at(-1).reject(Error('Failed to fetch')));
 assert.equal(document.querySelector('.standard-line'),null);assert.match(document.querySelector('.store-pos-alert.success').textContent,/OFFLINE/);assert.equal(f.amount(),'1,20€');
 const count=f.calls.length;await f.click('[data-pos-last-transaction]');assert.equal(f.amount(),'0,00€');assert.equal(f.calls.length,count);
}));
