import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('actual reconciliation panel rejects old store replies and never loads or exports automatically',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/inventory/InventoryReconciliationPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
  const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const calls=[],pending=[],api=(path,options)=>{calls.push({path,options});return new Promise(resolve=>pending.push(resolve));};
  const root=createRoot(document.getElementById('root')),render=(id,storeId)=>act(async()=>root.render(React.createElement(module.exports.default,{api,stocktakeId:id,storeId})));
  const click=text=>act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent===text).click());
  const report=(id,storeId,name)=>({current:{id,storeId},previous:{id:'old'},candidates:[{id:'old',name:'Παλιά'}],fingerprint:'a'.repeat(64),explanation:name,costMethod:'Unknown cost',summary:{shortageQuantity:11,surplusQuantity:0,netQuantity:-11,shortageValue:null,surplusValue:null,netValue:null,uncomputedItems:0,missingCostItems:1},rows:[]});
  try {
    await render('a','A');assert.equal(calls.length,0);await click('Έλεγχος προηγούμενης απογραφής');assert.equal(calls.length,1);
    await render('b','B');await click('Έλεγχος προηγούμενης απογραφής');assert.equal(calls.length,2);
    await act(async()=>pending[0](report('a','A','STALE SECRET')));assert.doesNotMatch(document.body.textContent,/STALE SECRET/);
    await act(async()=>pending[1](report('b','B','CORRECT REPORT')));assert.match(document.body.textContent,/CORRECT REPORT/);assert.match(document.body.textContent,/Άγνωστο/);
    await render('c','C');assert.doesNotMatch(document.body.textContent,/CORRECT REPORT/);assert.equal(calls.length,2);
    await click('Έλεγχος προηγούμενης απογραφής');await act(async()=>pending[2](report('wrong','B','FOREIGN SECRET')));
    assert.doesNotMatch(document.body.textContent,/FOREIGN SECRET/);assert.match(document.body.textContent,/δεν αντιστοιχεί/);assert.ok(calls.every(x=>!x.options?.method));
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,d]of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key];}}
});

test('result navigation opens only group members and relevant correction/revoke evidence without requests or changed totals',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/inventory/InventoryReconciliationPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
  const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const row=(id,difference)=>({productId:id,sku:id,name:id,difference,differenceValue:null,findings:[],movements:[{id:`movement-${id}`,movementType:`MOVEMENT-${id}`,quantity:1,included:true}],countHistory:[]});
  const group=(id,productIds,initialDifference,correctionQuantity)=>({id,sku:id,name:id,productIds,initialDifference,correctionQuantity,finalDifference:initialDifference+correctionQuantity,unitCost:null,finalValue:null,staleCorrectionIds:[]});
  const history=[
    {id:'link',action:{kind:'LINK',productIds:['umbrella-a','umbrella-b'],canonicalProductId:'umbrella-a',reason:'umbrella proof',evidence:'sheet U'},active:true},
    {id:'glasses-correction',action:{kind:'CORRECTION',productId:'glasses',quantity:240,reason:'glasses proof',evidence:'sheet G'},active:true},
    {id:'old-glasses',action:{kind:'CORRECTION',productId:'glasses',quantity:5,reason:'old correction',evidence:'old sheet'},active:false},
    {id:'revoke-glasses',action:{kind:'REVOKE',actionId:'old-glasses',reason:'revoked proof',evidence:'revoke sheet'},active:false},
    {id:'unrelated',action:{kind:'CORRECTION',productId:'other',quantity:1,reason:'UNRELATED PROOF',evidence:'other sheet'},active:true}
  ];
  const report={current:{id:'new',storeId:'store'},previous:{id:'old'},candidates:[{id:'old',name:'Old'}],fingerprint:'a'.repeat(64),summary:{shortageQuantity:34,surplusQuantity:0,netQuantity:-34,shortageValue:null,surplusValue:null,netValue:null,uncomputedItems:0,missingCostItems:3},rows:[row('umbrella-a',-244),row('umbrella-b',233),row('glasses',-263),row('other',-1)],groups:[group('umbrella-a',['umbrella-a','umbrella-b'],-11,0),group('glasses',['glasses'],-263,240),group('other',['other'],-1,1)],review:{canWrite:false,history}};
  report.candidates.push({id:'older',name:'Older'});
  const calls=[],api=async(path,options)=>{calls.push({path,options});return path.includes('previousStocktakeId=older')?{...report,previous:{id:'older'},fingerprint:'b'.repeat(64)}:report;};
  const root=createRoot(document.getElementById('root')),render=(id='new',storeId='store')=>act(async()=>root.render(React.createElement(module.exports.default,{api,stocktakeId:id,storeId})));
  const button=text=>[...document.querySelectorAll('button')].find(x=>x.textContent===text),click=el=>act(async()=>el.click());
  const memberDetails=()=>[...document.querySelectorAll('details[id]')];
  const selection=()=>document.querySelector('section[aria-label="Ανάλυση επιλεγμένου αποτελέσματος"]');
  try{
    await render();await click(button('Έλεγχος προηγούμενης απογραφής'));assert.equal(calls.length,1);
    const umbrella=button('Ανάλυση κινήσεων: umbrella-a · umbrella-a');assert.ok(umbrella,'each result must have a native keyboard-accessible button');
    assert.equal(umbrella.getAttribute('aria-expanded'),'false');
    const controlled=umbrella.getAttribute('aria-controls').split(' ');assert.equal(controlled.length,2);assert.ok(controlled.every(id=>document.getElementById(id)));
    await click(umbrella);assert.equal(umbrella.getAttribute('aria-expanded'),'true');assert.deepEqual(memberDetails().filter(x=>x.open).map(x=>x.id),controlled);
    assert.equal(document.activeElement,selection().querySelector('h4'));assert.match(selection().textContent,/umbrella proof/);assert.doesNotMatch(selection().textContent,/glasses proof|UNRELATED PROOF/);
    assert.match(selection().textContent,/-11/);assert.equal(calls.length,1);
    memberDetails().find(x=>x.id===controlled[0]).open=false;await click(umbrella);assert.ok(document.getElementById(controlled[0]).open,'reopening same result restores its member details');
    await click(button('Ανάλυση κινήσεων: glasses · glasses'));
    assert.equal(memberDetails().filter(x=>x.open).length,1);assert.match(memberDetails().find(x=>x.open).textContent,/MOVEMENT-glasses/);
    assert.match(selection().textContent,/-263.*240.*-23/);assert.match(selection().textContent,/glasses proof/);assert.match(selection().textContent,/old correction/);assert.match(selection().textContent,/revoked proof/);assert.doesNotMatch(selection().textContent,/umbrella proof|UNRELATED PROOF/);
    assert.match(document.body.textContent,/-34/);assert.match(document.body.textContent,/Άγνωστο/);assert.equal(calls.length,1,'drilldown must use already-authorized data only');
    const glasses=button('Ανάλυση κινήσεων: glasses · glasses');await click(button('Επιστροφή στο αποτέλεσμα'));assert.equal(selection(),null);assert.equal(document.activeElement,glasses);
    await click(glasses);await click(button('Έλεγχος προηγούμενης απογραφής'));assert.equal(selection(),null);assert.ok(memberDetails().every(x=>!x.open));assert.equal(calls.length,2);
    await click(button('Ανάλυση κινήσεων: umbrella-a · umbrella-a'));
    await act(async()=>{const pair=document.querySelector('select');pair.value='older';pair.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
    assert.equal(selection(),null);assert.ok(memberDetails().every(x=>!x.open),'changing comparison must clear old selected evidence');
    await click(button('Ανάλυση κινήσεων: umbrella-a · umbrella-a'));await render('foreign','another-store');assert.equal(selection(),null);assert.equal(memberDetails().length,0);assert.ok(calls.every(x=>!x.options?.method));
    report.viewerId='owner';report.generation='0';report.review.canWrite=true;
    dom.window.sessionStorage.setItem(`mws:inventory-review:${JSON.stringify(['store','new','old','owner','0'])}`,JSON.stringify({version:1,body:{requestId:'pending-review'}}));
    await render();await click(button('Έλεγχος προηγούμενης απογραφής'));
    assert.match(document.body.textContent,/Υπάρχει ενέργεια προς επαλήθευση/);
    assert.ok([...document.querySelectorAll('button')].filter(x=>x.textContent.startsWith('Ανάλυση κινήσεων:')).every(x=>x.disabled),'pending review locks all new navigation controls');
    assert.ok(calls.every(x=>!x.options?.method),'even a retained uncertain review is never resent by navigation');
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,d]of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key];}}
});
