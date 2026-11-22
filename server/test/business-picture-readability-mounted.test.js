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
 const values={salesGross:124,salesNet:100,salesVat:24,margin:null,grossProfit:null,netProfit:null,expenseGross:24,expenses:24,expenseVat:0,missingCostLines:1,salesLines:3,missingExpenseVatPayments:1,expensePayments:2,returnTransactions:1,cancelTransactions:0};
 const report={calendarFrom:'2026-09-01',calendarTo:'2026-09-30',monthly:[{...values,month:'2026-09'}],daily:[{...values,month:'2026-09',day:'2026-09-12',transactions:3,documents:0}],totals:{...values,missingExpenseVatPayments:2},missingExpenseVatDetails:[{id:'sep',storeId:'LAB',day:'2026-09-12',month:'2026-09',occurredAt:'2026-09-12T12:00:00Z',description:'Έξοδο <έλεγχος>',actorName:'Χειριστής LAB',amount:24,evidenceReason:'NO_LINKED_DOCUMENT'},{id:'aug',storeId:'LAB',day:'2026-08-12',month:'2026-08',occurredAt:'2026-08-12T12:00:00Z',description:'Άλλο έξοδο',amount:12,evidenceReason:'INVALID_DOCUMENT',documentNumber:'DOC',documentStatus:'DRAFT',documentNet:10,documentVat:2,documentGross:12}],calculationNotes:{reversals:'REVERSALS NOTE',expenses:'EXPENSES NOTE',costCoverage:'COST NOTE',grossProfit:'GROSS NOTE',netProfit:'NET NOTE'}};
 const original=JSON.stringify(report),calls=[],api=async(path,options)=>{assert.equal(options,undefined);calls.push(path);return report},root=createRoot(document.getElementById('root'));
 try{
 await act(async()=>root.render(React.createElement(module.exports.default,{api,store:{id:'LAB',name:'LAB'},onClose(){}})));
 assert.equal(new URL(calls[0],'https://isolated.invalid').searchParams.get('storeId'),'LAB');
 const details=document.querySelector('details');assert.equal(details.open,false);assert.match(document.querySelector('.business-loaded-period').textContent,/2026-09-01 έως 2026-09-30/);
 assert.deepEqual([...document.querySelectorAll('[role=status]')].map(e=>e.textContent),['Ελλιπές κόστος: 1/3 γραμμές']);
 const before=document.querySelector('tbody').textContent;
 await act(async()=>details.querySelector('summary').click());assert.equal(details.open,true);for(const note of Object.values(report.calculationNotes))assert.ok(details.textContent.includes(note));assert.match(details.textContent,/Κέρδος και Margin εμφανίζονται ως «—»/);assert.match(details.textContent,/1 επιστροφές και 0 ακυρώσεις/);
 await act(async()=>details.querySelector('summary').click());assert.equal(details.open,false);assert.equal(document.querySelector('tbody').textContent,before);assert.equal(document.querySelector('tbody tr td:nth-child(2)').textContent,'—');
 await act(async()=>document.querySelector('.business-month button').click());assert.equal(document.querySelectorAll('.business-day').length,1);
 await act(async()=>document.querySelectorAll('input[type=radio]')[1].click());assert.equal(document.querySelector('tbody tr td:nth-child(6)').textContent,'—');
 await act(async()=>document.querySelectorAll('input[type=radio]')[0].click());assert.match(document.querySelector('tbody tr td:nth-child(6)').textContent,/100,00/);
 const vatWarning=document.querySelector('button.business-data-warning.business-expense-link');assert.match(vatWarning.textContent,/2\/2 έξοδα/);assert.match(vatWarning.textContent,/ΦΠΑ 0%/);assert.match(details.textContent,/ολόκληρο το ποσό αφαιρείται/);assert.match(document.querySelector('tbody tr td:nth-child(10)').textContent,/24,00/);
 await act(async()=>vatWarning.click());assert.equal(document.querySelectorAll('.business-expense-table tbody tr').length,2);
 await act(async()=>document.querySelector('.business-expense-table button').click());assert.match(document.querySelector('.business-expense-entry').textContent,/Έξοδο <έλεγχος>/);assert.equal(document.querySelector('.business-expense-entry έλεγχος'),null);assert.match(document.querySelector('.business-expense-entry').textContent,/Χειριστής LAB/);assert.match(document.querySelector('.business-expense-panel').textContent,/αφαιρούνται ολόκληρα με ΦΠΑ 0%/);
 await act(async()=>document.querySelector('.business-expense-panel header button').click());assert.equal(document.querySelector('.business-expense-panel'),null);assert.equal(document.querySelectorAll('.business-day').length,1);
 await act(async()=>document.querySelector('.business-month .business-expense-link:not(.business-cost-link)').click());assert.equal(document.querySelectorAll('.business-expense-table tbody tr').length,1);assert.match(document.querySelector('.business-expense-table').textContent,/Έξοδο <έλεγχος>/);await act(async()=>document.querySelector('.business-expense-panel header button').click());assert.equal(document.querySelectorAll('.business-day').length,1);
 assert.equal(calls.length,1);assert.equal(JSON.stringify(report),original);assert.equal(document.querySelectorAll('thead th').length,21);assert.equal(document.querySelectorAll('tfoot td').length,21);
 // The same mounted owner report must show provisional values in every view,
 // retain day-specific product scope and never issue a writer request.
 const estimated={...values,estimatedMargin:40,estimatedGrossProfit:40,estimatedNetProfit:16,profitEstimateBasis:'CATEGORY_KNOWN_SALES',unestimatedCostLines:0,costCoveragePercent:90};
 const next={...report,monthly:[{...estimated,month:'2026-09'}],daily:[{...estimated,month:'2026-09',day:'2026-09-12'},{...estimated,month:'2026-09',day:'2026-09-13'}],totals:estimated,missingCostDetails:[{storeId:'LAB2',productId:'p1',name:'Είδος <test>',sku:'P1',day:'2026-09-12',month:'2026-09',reason:'MISSING_COST',lines:1,quantity:2,salesGross:4},{storeId:'LAB2',productId:'p1',name:'Είδος <test>',sku:'P1',day:'2026-09-13',month:'2026-09',reason:'MISSING_COST',lines:1,quantity:3,salesGross:6},{storeId:'LAB2',productId:'old',name:'Άλλη περίοδος',day:'2026-08-12',month:'2026-08',lines:1,quantity:1,salesGross:9}]};
 const nextApi=async(path,options)=>{assert.equal(options,undefined);calls.push(path);return next};
 await act(async()=>root.render(React.createElement(module.exports.default,{api:nextApi,store:{id:'LAB2',name:'LAB2'},onClose(){}})));
 assert.equal(new URL(calls.at(-1),'https://isolated.invalid').searchParams.get('storeId'),'LAB2');
 assert.match(document.querySelector('.business-month td:nth-child(2)').textContent,/≈ 40,00%Εκτίμηση/);assert.match(document.querySelector('.business-month td:nth-child(8)').textContent,/≈ 40,00.*Εκτίμηση/);assert.match(document.querySelector('tfoot .business-profit').textContent,/≈ 16,00.*Εκτίμηση/);
 assert.match(document.querySelector('.business-report-information').textContent,/Κάλυψη κόστους 90,00%/);
 await act(async()=>document.querySelector('.business-month .business-cost-link').click());assert.equal(document.querySelectorAll('.business-cost-panel tbody tr').length,1);assert.match(document.querySelector('.business-cost-panel').textContent,/Είδος <test>/);assert.equal(document.querySelector('.business-cost-panel test'),null);assert.equal(document.querySelector('.business-cost-panel tbody td:nth-child(5)').textContent,'5');
 await act(async()=>document.querySelector('.business-cost-panel header button').click());
 if(!document.querySelector('.business-day'))await act(async()=>document.querySelector('.business-month button').click());
 await act(async()=>document.querySelector('.business-day .business-cost-link').click());assert.equal(document.querySelector('.business-cost-panel tbody td:nth-child(5)').textContent,'2');
 assert.equal(calls.length,2);assert.equal(JSON.stringify(report),original);

 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d]of previous){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
