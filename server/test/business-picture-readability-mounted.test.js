import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('disclosure keeps report warnings, values, daily drilldown and VAT scope without writes',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/cloud/OwnerBusinessPicture.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const values={salesGross:124,salesNet:100,salesVat:24,margin:null,grossProfit:null,netProfit:null,expenses:null,expenseVat:null,missingCostLines:1,salesLines:3,missingExpenseVatPayments:1,expensePayments:2,returnTransactions:1,cancelTransactions:0};
 const report={calendarFrom:'2026-09-01',calendarTo:'2026-09-30',monthly:[{...values,month:'2026-09'}],daily:[{...values,month:'2026-09',day:'2026-09-12',transactions:3,documents:0}],totals:values,calculationNotes:{reversals:'REVERSALS NOTE',expenses:'EXPENSES NOTE',costCoverage:'COST NOTE',grossProfit:'GROSS NOTE',netProfit:'NET NOTE'}};
 const original=JSON.stringify(report),calls=[],api=async(path,options)=>{assert.equal(options,undefined);calls.push(path);return report},root=createRoot(document.getElementById('root'));
 try{
 await act(async()=>root.render(React.createElement(module.exports.default,{api,store:{id:'LAB',name:'LAB'},onClose(){}})));
 assert.equal(new URL(calls[0],'https://isolated.invalid').searchParams.get('storeId'),'LAB');
 const details=document.querySelector('details');assert.equal(details.open,false);assert.match(document.querySelector('.business-loaded-period').textContent,/2026-09-01 έως 2026-09-30/);
 assert.deepEqual([...document.querySelectorAll('[role=status]')].map(e=>e.textContent),['Ελλιπές κόστος: 1/3 γραμμές','Ελλιπής τεκμηρίωση ΦΠΑ: 1/2 έξοδα']);
 const before=document.querySelector('tbody').textContent;
 await act(async()=>details.querySelector('summary').click());assert.equal(details.open,true);for(const note of Object.values(report.calculationNotes))assert.ok(details.textContent.includes(note));assert.match(details.textContent,/Κέρδος και Margin εμφανίζονται ως «—»/);assert.match(details.textContent,/1 επιστροφές και 0 ακυρώσεις/);
 await act(async()=>details.querySelector('summary').click());assert.equal(details.open,false);assert.equal(document.querySelector('tbody').textContent,before);assert.equal(document.querySelector('tbody tr td:nth-child(2)').textContent,'—');
 await act(async()=>document.querySelector('.business-month button').click());assert.equal(document.querySelectorAll('.business-day').length,1);
 await act(async()=>document.querySelectorAll('input[type=radio]')[1].click());assert.equal(document.querySelector('tbody tr td:nth-child(6)').textContent,'—');
 await act(async()=>document.querySelectorAll('input[type=radio]')[0].click());assert.match(document.querySelector('tbody tr td:nth-child(6)').textContent,/100,00/);
 assert.equal(calls.length,1);assert.equal(JSON.stringify(report),original);assert.equal(document.querySelectorAll('thead th').length,21);assert.equal(document.querySelectorAll('tfoot td').length,21);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d]of previous){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
