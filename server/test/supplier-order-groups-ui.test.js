import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {buildSupplierOrderGroups} from '../src/lib/supplier-order-groups.js';

test('supplier proposal production panel consumes actual grouping contract without writes',async t=>{
  const bundle=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/OrderSuggestionsPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty'}});
  const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://isolated.invalid'});
  const keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));
  const baseRows=Array.from({length:4},(_,i)=>({productId:`p${i}`,name:`Product ${i}`,sku:`SKU${i}`,unitLabel:'τεμ.',currentStock:i,minStock:2,netQuantity:30,dailyDemand:1,soldQuantity:35,returnedQuantity:5,suggestedQuantity:10-i,reason:'Demand.',warnings:[]}));
  const evidence=[['p0','s1','Alpha','d1'],['p0','s1','Alpha','d2'],['p0','s2','Beta','d3'],['p1','s1','Alpha','d1'],['p1','s2','Beta','d3'],['p3','s2','Beta','d4']].map(([productId,supplierId,supplierName,documentId])=>({productId,supplierId,supplierName,documentId}));
  const flat=(storeId='A',options={historyDays:30,coverageDays:7,leadDays:3})=>({storeId,options,generatedAt:'2026-10-18T12:00:00.000Z',from:'2026-09-18T12:00:00.000Z',to:'2026-10-18T12:00:00.000Z',rows:structuredClone(baseRows)});
  const grouped=(storeId='A',complete=true,options)=>{const source=flat(storeId,options);return {...source,...buildSupplierOrderGroups(source.rows,complete?evidence:[],{complete}),supplierEvidence:{from:source.from,to:source.to,historyDays:source.options.historyDays,limit:20000,complete,observedDocumentProductSupplierCount:complete?evidence.length:20001,physicalDeliveryFrequencyVerified:false}};};
  const render=(api,storeId='A')=>act(async()=>root.render(React.createElement(module.exports.default,{api,storeId})));
  const mount=async(api,storeId='A')=>{await act(async()=>root.render(null));await render(api,storeId);};
  const select=(label,value)=>act(async()=>{const el=document.querySelector(`select[aria-label="${label}"]`);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));});
  const click=text=>act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===text).click());
  const text=()=>document.querySelector('.order-suggestions').textContent;
  const rows=()=>[...document.querySelectorAll('tbody tr')];
  const type=(input,value)=>act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
  const apiFor=(calls,custom)=>async(...args)=>{calls.push(args);const u=new URL(args[0],'https://isolated.invalid');return custom?custom(u):u.pathname.endsWith('/by-supplier')?grouped(u.searchParams.get('storeId')):flat(u.searchParams.get('storeId'));};
  try{
    await t.test('actual CSV download exports filtered canonical rows across pages with no extra API',async()=>{
      const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL,originalClick=dom.window.HTMLAnchorElement.prototype.click;
      const downloads=[],revoked=[];let payload;
      URL.createObjectURL=blob=>{payload=blob;return 'blob:isolated-review';};URL.revokeObjectURL=url=>revoked.push(url);
      dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push({href:this.href,filename:this.download});};
      const exportButton=()=>[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('CSV πρότασης'));
      try{
        const calls=[];await mount(apiFor(calls));assert.equal(exportButton(),undefined);
        await select('Προβολή προτάσεων','supplier');assert.equal(exportButton().disabled,false);assert.equal(rows().length,2);
        await act(async()=>exportButton().click());assert.equal(calls.length,2);assert.equal(downloads.length,1);assert.match(downloads[0].filename,/supplier-proposal-A-20261018120000000\.csv/);
        let csv=await payload.text();assert.equal(payload.type,'text/csv;charset=utf-8');for(let i=0;i<4;i++)assert.ok(csv.includes(`"Product ${i}"`));assert.match(csv,/"10"/);assert.match(csv,/APPROVED_DOCUMENT_FREQUENCY_PROXY/);assert.match(csv,/DOCUMENT_FREQUENCY_TIE/);
        await select('Φίλτρο προμηθευτή','unassigned');await act(async()=>exportButton().click());csv=await payload.text();assert.match(csv,/Product 1/);assert.match(csv,/Product 2/);assert.doesNotMatch(csv,/Product 0|Product 3/);
        await type(document.querySelector('[placeholder="Αναζήτηση προτάσεων"]'),'SKU2');await act(async()=>exportButton().click());csv=await payload.text();assert.match(csv,/Product 2/);assert.doesNotMatch(csv,/Product 1/);assert.match(csv,/"SKU2","unassigned","YES"/);assert.equal(calls.length,2);
        await type(document.querySelector('[placeholder="Αναζήτηση προτάσεων"]'),'absent');assert.equal(exportButton().disabled,true);
        const withZero=grouped();withZero.rows[3].suggestedQuantity=0;await mount(apiFor([],u=>u.pathname.endsWith('/by-supplier')?withZero:flat()));await select('Προβολή προτάσεων','supplier');await act(async()=>exportButton().click());assert.doesNotMatch(await payload.text(),/Product 3/);
        await act(async()=>document.querySelector('.order-suggestions-check input').click());await act(async()=>exportButton().click());csv=await payload.text();assert.match(csv,/Product 3/);assert.match(csv,/"all","NO","CURRENT_FILTERED_ROWS_ALL_PAGES"/);
        await render(apiFor(calls),'');assert.equal(exportButton().disabled,true);assert.equal(document.querySelector('a[download]'),null);
        await new Promise(done=>setTimeout(done,5));assert.equal(revoked.length,downloads.length);
      }finally{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;dom.window.HTMLAnchorElement.prototype.click=originalClick;}
    });
    await t.test('CSV remains disabled while loading, stale store responses, invalid contract and errors',async()=>{
      const exportButton=()=>[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('CSV πρότασης'));
      let resolve;const api=apiFor([],u=>u.pathname.endsWith('/by-supplier')?new Promise(done=>resolve=done):flat(u.searchParams.get('storeId')));
      await mount(api);await select('Προβολή προτάσεων','supplier');assert.equal(exportButton().disabled,true);
      const resolveA=resolve;await render(api,'B');assert.equal(exportButton().disabled,true);await act(async()=>resolveA(grouped('A')));assert.equal(exportButton().disabled,true);
      await act(async()=>resolve(grouped('B')));assert.equal(exportButton().disabled,false);
      await mount(apiFor([],u=>{if(u.pathname.endsWith('/by-supplier'))throw Error('Unavailable');return flat();}));await select('Προβολή προτάσεων','supplier');assert.equal(exportButton().disabled,true);
      for(const mutate of [data=>data.reviewRequired=false,data=>data.generatedAt='invalid',data=>data.generatedAt='2026-10-18T11:00:00.000Z']){const invalid=grouped();mutate(invalid);await mount(apiFor([],u=>u.pathname.endsWith('/by-supplier')?invalid:flat()));await select('Προβολή προτάσεων','supplier');assert.equal(exportButton().disabled,true);}
    });
    await t.test('flat default unchanged, grouped quantities and document proxy, tie/no evidence stay unassigned',async()=>{
      const calls=[];await mount(apiFor(calls));assert.equal(calls.length,1);assert.equal(new URL(calls[0][0],'https://x').pathname,'/api/commerce/order-suggestions');assert.doesNotMatch(text(),/PROXY/);
      await select('Προβολή προτάσεων','supplier');assert.match(calls[1][0],/by-supplier\?storeId=A&historyDays=30&coverageDays=7&leadDays=3/);assert.match(text(),/PROXY/);assert.match(text(),/όχι επιβεβαιωμένες φυσικές παραδόσεις/);assert.match(text(),/Δεν ορίζεται κύριος προμηθευτής/);assert.match(rows()[0].textContent,/Alpha/);assert.equal(rows()[0].querySelector('.order-suggestions-quantity').firstChild.textContent,'10');assert.match(rows()[0].textContent,/Alpha: 2 εγκεκριμένα παραστατικά/);
      await select('Φίλτρο προμηθευτή','unassigned');assert.equal(rows().length,2);assert.match(rows()[0].textContent,/Ισοβαθμία/);assert.match(rows()[1].textContent,/Χωρίς εγκεκριμένα παραστατικά/);assert.deepEqual(rows().map(r=>r.querySelector('.order-suggestions-quantity').firstChild.textContent),['9','8']);
      await select('Φίλτρο προμηθευτή','s2');assert.equal(rows().length,1);assert.match(rows()[0].textContent,/Product 3/);assert.equal(rows()[0].querySelector('.order-suggestions-quantity').firstChild.textContent,'7');assert.match(text(),/Δεν υποβάλλεται παραγγελία/);assert.ok(calls.every(args=>args.length===1));
    });
    await t.test('incomplete document evidence has no candidate and retains quantities',async()=>{
      const calls=[];await mount(apiFor(calls,u=>u.pathname.endsWith('/by-supplier')?grouped('A',false):flat()));await select('Προβολή προτάσεων','supplier');assert.match(text(),/Ελλιπής πηγή: όλες οι προτάσεις χωρίς ανάθεση/);assert.match(rows()[0].textContent,/Ελλιπή στοιχεία/);assert.doesNotMatch(rows()[0].textContent,/Alpha|Beta/);assert.equal(rows()[0].querySelector('.order-suggestions-quantity').firstChild.textContent,'10');assert.equal(document.querySelector('[aria-label="Φίλτρο προμηθευτή"]').options.length,2);
    });
    await t.test('malformed authoritative grouping contract clears rows and does not fall back',async()=>{
      const mutations=[d=>d.automaticTransmission=true,d=>d.supplierBasis='DELIVERIES',d=>d.rows[0].primarySupplierId='s1',d=>d.rows[1].candidateSupplierId='s1',d=>d.groups[0].rows.push(d.rows[0]),d=>d.unassigned=[],d=>d.supplierEvidence.complete=false,d=>d.supplierEvidence.from='wrong',d=>d.rows[0].supplierCandidates[0].documentCount=999,d=>d.supplierEvidence.physicalDeliveryFrequencyVerified=true,
        d=>{d.supplierEvidence.limit=1;d.supplierEvidence.observedDocumentProductSupplierCount=1;},
        d=>d.supplierEvidence.limit=1e12,
        d=>d.supplierEvidence.observedDocumentProductSupplierCount=0,
        d=>d.supplierEvidence.observedDocumentProductSupplierCount=5,
        d=>{d.supplierEvidence.observedDocumentProductSupplierCount=Number.MAX_SAFE_INTEGER+1;d.complete=false;d.supplierEvidence.complete=false;},
        d=>{d.supplierEvidence.observedDocumentProductSupplierCount=20002;d.complete=false;d.supplierEvidence.complete=false;},
        d=>d.rows[0].supplierCandidates[0].documentCount=Number.MAX_SAFE_INTEGER+1,
        d=>d.rows[0].supplierCandidates[0].documentCount=20001,
        d=>d.rows[0].productId={forged:'p0'},
        d=>d.rows[0].supplierCandidates[0].supplierId={forged:'s1'},
        d=>d.rows[0].supplierCandidates[0].supplierName={forged:'Alpha'},
        d=>d.rows[0].supplierCandidates[0].documentIds[0]={forged:'d1'},
        d=>d.groups[0].candidateSupplierId={forged:'s1'},
        d=>d.groups[0].supplierName='  ',
        d=>{d.from=d.to;d.supplierEvidence.from=d.to;},
        d=>{const from=d.from;d.from=d.to;d.to=from;d.supplierEvidence.from=d.from;d.supplierEvidence.to=d.to;},
        d=>d.options.coverageDays=0,
        d=>d.options.leadDays='3',
        d=>{d.options.historyDays=91;d.supplierEvidence.historyDays=91;},
      ];
      for(const mutate of mutations){const data=grouped();mutate(data);const calls=[];await mount(apiFor(calls,u=>u.pathname.endsWith('/by-supplier')?data:flat()));await select('Προβολή προτάσεων','supplier');assert.equal(rows().length,0);assert.match(document.querySelector('[role="alert"]').textContent,/Μη έγκυρα στοιχεία/);assert.equal(calls.length,2);}
    });
    await t.test('store change and absent selection clear groups and reject delayed/foreign replies',async()=>{
      let resolve;const calls=[];const api=apiFor(calls,u=>u.pathname.endsWith('/by-supplier')&&u.searchParams.get('storeId')==='A'?new Promise(done=>resolve=done):u.pathname.endsWith('/by-supplier')?grouped('B'):flat(u.searchParams.get('storeId')));
      await mount(api);await select('Προβολή προτάσεων','supplier');assert.equal(rows().length,0);await render(api,'B');assert.match(text(),/PROXY/);await act(async()=>resolve(grouped('A')));assert.equal(document.querySelector('[role="alert"]'),null);await render(api,'');assert.equal(rows().length,0);assert.match(text(),/Επίλεξε κατάστημα/);const count=calls.length;await render(api,'');assert.equal(calls.length,count);
      await mount(apiFor([],u=>u.pathname.endsWith('/by-supplier')?grouped('B'):flat()));await select('Προβολή προτάσεων','supplier');assert.equal(rows().length,0);assert.match(text(),/Μη έγκυρη απάντηση/);
    });
    await t.test('delayed supplier view cannot overwrite newly requested flat view, failures are retryable',async()=>{
      let resolve;const calls=[];const api=apiFor(calls,u=>u.pathname.endsWith('/by-supplier')?new Promise(done=>resolve=done):flat());await mount(api);await select('Προβολή προτάσεων','supplier');await select('Προβολή προτάσεων','flat');await act(async()=>resolve(grouped()));assert.doesNotMatch(text(),/PROXY/);assert.equal(rows().length,2);
      let failed=true;const retryApi=apiFor([],u=>{if(u.pathname.endsWith('/by-supplier')){if(failed)throw Error('Unavailable');return grouped();}return flat();});await mount(retryApi);await select('Προβολή προτάσεων','supplier');assert.equal(rows().length,0);assert.match(text(),/Unavailable/);failed=false;await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.match(text(),/PROXY/);assert.equal(rows().length,2);
    });
    await t.test('grouped search/pagination and parameter application use one server response',async()=>{
      const calls=[];await mount(apiFor(calls,u=>{const options=Object.fromEntries(['historyDays','coverageDays','leadDays'].map(k=>[k,Number(u.searchParams.get(k))]));return u.pathname.endsWith('/by-supplier')?grouped('A',true,options):flat('A',options);}));await select('Προβολή προτάσεων','supplier');await click('Επόμενα');assert.match(rows()[0].textContent,/Product 2/);await type(document.querySelector('[placeholder="Αναζήτηση προτάσεων"]'),'SKU3');assert.equal(rows().length,1);assert.match(rows()[0].textContent,/Product 3/);await type(document.querySelectorAll('input[type="number"]')[2],'6');assert.match(text(),/παράδοση 3 ημερών/);assert.equal(calls.length,2);await select('Προβολή προτάσεων','flat');assert.match(calls[2][0],/leadDays=3/);await select('Προβολή προτάσεων','supplier');assert.match(calls[3][0],/leadDays=3/);await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.match(text(),/παράδοση 6 ημερών/);assert.match(calls[4][0],/by-supplier.*leadDays=6/);assert.ok(calls.every(args=>args.length===1));
    });
  }finally{await act(async()=>root.unmount());dom.window.close();for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
