import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const compiled=await build({stdin:{contents:`import React from 'react';import Catalog from './client/src/components/store/PosModernCatalog.jsx';import Editor from './client/src/components/store/StorePosButtonEditor.jsx';import {createPosCatalogResolver} from './client/src/utils/pos-catalog-resolver.js';export default function Fixture(p){return <div className="mws-standard-pos"><Catalog storeId={p.catalogStoreId||p.store.id} quickButtons={(p.layout.quickKeys||[]).filter(x=>x.visible)} categoryButtons={(p.layout.categories||[]).filter(x=>x.visible)} quickProduct={createPosCatalogResolver(p.products,Boolean(p.layout.catalogCompanyId)).quickProduct} categoryProducts={createPosCatalogResolver(p.products,Boolean(p.layout.catalogCompanyId)).categoryProducts} categoryCount={createPosCatalogResolver(p.products,Boolean(p.layout.catalogCompanyId)).categoryCount} onQuick={p.onQuick} onProduct={()=>{}} search={null} query="" searchRows={[]}/><Editor {...p}/></div>}`,resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom','react-dom/client'],loader:{'.css':'empty'},logLevel:'silent'});
const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const products=[{id:'product-A',name:'SYNTHETIC PRODUCT A',sku:'LEGACY-A',barcodes:['5200000000001'],salePrice:2},{id:'product-B',name:'SYNTHETIC PRODUCT B',sku:'LEGACY-B',barcodes:[],salePrice:3}];
const callback=(element,key='onClick')=>element[Object.keys(element).find(key=>key.startsWith('__reactProps$'))]?.[key];
async function fixture(run,{layout={quickKeys:[],categories:[]},enabled=true,api:override,catalogStoreId,catalogProducts=products}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'];
 const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.querySelector('#root')),calls=[],completed=[],added=[];
 const api=async(path,options)=>{calls.push({path,options});return override?override(path,options):{layout:JSON.parse(options.body).layout,version:2}};
 let props={api,store:{id:'store-A'},layout,products:catalogProducts,enabled,catalogStoreId,onSaved:result=>completed.push(result),onQuick:button=>added.push(button.id)};
 const render=async updates=>React.act(async()=>{props={...props,...updates};root.render(React.createElement(module.exports.default,props))});
 const click=async element=>{assert.ok(element);await React.act(async()=>element.click())};
 const launcher=()=>document.querySelector('[aria-label="Ρύθμιση πλήκτρων POS"]');
 const slot=async(kind,index)=>{await click(launcher());await click(document.querySelector(`[data-pos-edit-kind="${kind}"][data-pos-edit-index="${index}"]`))};
 const save=()=>document.querySelector('.pos-button-editor-overlay .save');
 try{await render({});await run({dom,React,render,click,launcher,slot,save,calls,completed,added,layout})}
 finally{await React.act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}
}

test('empty quick position has an explicit editor, preserves selling clicks and saves one canonical product without mutating input',()=>fixture(async f=>{
 const before=JSON.stringify(f.layout),normal=document.querySelector('.standard-quick>div>button');
 await f.React.act(async()=>normal.dispatchEvent(new f.dom.window.MouseEvent('click',{bubbles:true,clientX:999,clientY:1})));
 assert.deepEqual(f.added,['assigned']);assert.equal(document.querySelector('[role="dialog"]'),null);
 assert.equal(normal.contains(f.launcher()),false);assert.equal(document.querySelectorAll('.standard-quick>div>button').length,20);
 await f.click(f.launcher());assert.equal(document.querySelectorAll('[data-pos-edit-kind]').length,40);
 await f.click(document.querySelector('[data-pos-edit-kind="quick"][data-pos-edit-index="19"]'));
 assert.match(document.querySelector('[role="dialog"]').textContent,/Κουμπί 20/);assert.equal(f.calls.length,0);
 await f.click(document.querySelector('.pos-button-product-list button'));
 assert.equal(f.calls.length,0);await f.click(f.save());
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].path,'/api/store-pos/stores/store-A/layout');assert.equal(f.calls[0].options.method,'PUT');
 const result=JSON.parse(f.calls[0].options.body).layout;
 assert.equal(result.quickKeys.length,20);assert.deepEqual(result.quickKeys[19].productCodes,['product-A']);assert.equal(result.quickKeys[19].productQuery,'product-A');
 assert.equal(result.quickKeys.every(x=>x&&typeof x==='object'),true);assert.deepEqual(result.quickKeys[0],f.layout.quickKeys[0]);
 assert.equal(JSON.stringify(f.layout),before);assert.equal(f.completed.length,1);assert.equal(document.querySelector('[role="dialog"]'),null);
},{layout:{catalogCompanyId:'company-A',quickKeys:[{id:'assigned',label:'Assigned',visible:true,productCodes:['product-A']}],categories:[]}}));

test('slot selection binds the raw position rather than the filtered visible index and retains existing aliases',()=>fixture(async f=>{
 const before=JSON.stringify(f.layout);await f.slot('quick',1);
 assert.equal(document.querySelector('.pos-button-product-list button').className,'selected');
 await f.click(document.querySelectorAll('.pos-button-product-list button')[1]);await f.click(f.save());
 const result=JSON.parse(f.calls[0].options.body).layout;
 assert.deepEqual(result.quickKeys[0],f.layout.quickKeys[0]);assert.equal(result.quickKeys[1].id,'visible');assert.deepEqual(result.quickKeys[1].productCodes,['product-B']);assert.equal(JSON.stringify(f.layout),before);
},{layout:{quickKeys:[{id:'hidden',visible:false,label:'HIDDEN SLOT',productCodes:['product-B']},{id:'visible',visible:true,label:'Visible',productCodes:['LEGACY-A']}],categories:[]}}));

test('permission absent or revoked hides editing and a retained save callback cannot submit',()=>fixture(async f=>{
 assert.equal(f.launcher(),null);await f.render({enabled:true});await f.slot('quick',0);await f.click(document.querySelector('.pos-button-product-list button'));
 const oldSave=callback(f.save());assert.equal(typeof oldSave,'function');
 await f.render({enabled:false});assert.equal(f.launcher(),null);assert.equal(document.querySelector('[role="dialog"]'),null);
 await f.React.act(async()=>oldSave());assert.equal(f.calls.length,0);
 await f.render({enabled:undefined});assert.equal(f.launcher(),null);
},{enabled:false}));

test('scope changes invalidate retained callbacks and late saves cannot update a different store',()=>fixture(async f=>{
 await f.slot('quick',0);await f.click(document.querySelector('.pos-button-product-list button'));
 const oldSave=callback(f.save());await f.render({store:{id:'store-B'},layout:{quickKeys:[],categories:[]}});
 await f.React.act(async()=>oldSave());assert.equal(f.calls.length,0);assert.equal(document.querySelector('[role="dialog"]'),null);
 await f.slot('quick',0);await f.click(document.querySelector('.pos-button-product-list button'));
 let release;const pending=new Promise(resolve=>{release=resolve});await f.render({api:async(path,options)=>{f.calls.push({path,options});return pending}});
 // An API identity change also invalidates the previously open draft.
 assert.equal(document.querySelector('[role="dialog"]'),null);await f.slot('quick',0);await f.click(document.querySelector('.pos-button-product-list button'));
 const submit=callback(f.save());await f.React.act(async()=>{submit();submit()});assert.equal(f.calls.length,1);assert.equal(f.calls[0].path,'/api/store-pos/stores/store-B/layout');
 await f.render({store:{id:'store-C'},layout:{quickKeys:[],categories:[]}});
 await f.React.act(async()=>release({layout:{quickKeys:[{label:'OLD RESULT'}]},version:2}));
 assert.equal(f.completed.length,0);assert.doesNotMatch(document.body.textContent,/OLD RESULT/);assert.equal(document.querySelector('[role="dialog"]'),null);
}));

test('a changed layout refuses overwrite while a failed explicit save retains the draft without retry',()=>fixture(async f=>{
 await f.slot('quick',0);await f.click(document.querySelector('.pos-button-product-list button'));
 await f.render({layout:{quickKeys:[{id:'newer',label:'Newer',visible:true}],categories:[]}});await f.click(f.save());
 assert.match(document.querySelector('[role="alert"]').textContent,/Η διάταξη άλλαξε/);assert.equal(f.calls.length,0);
 await f.click(document.querySelector('[aria-label="Κλείσιμο ρύθμισης πλήκτρου"]'));await f.slot('quick',0);await f.click(document.querySelector('.pos-button-product-list button'));await f.click(f.save());
 assert.equal(f.calls.length,1);assert.match(document.querySelector('[role="alert"]').textContent,/synthetic rejection/);assert.ok(document.querySelector('.pos-button-editor-product-list')||document.querySelector('.pos-button-product-list'));
 assert.equal(f.completed.length,0);
},{api:async()=>{throw Error('synthetic rejection')}}));

test('editor chooser and draft trap focus, dismiss with Escape and restore the explicit launcher',()=>fixture(async f=>{
 await f.click(f.launcher());let dialog=document.querySelector('[role="dialog"]'),first=dialog.querySelector('button'),last=dialog.querySelector('footer button');
 assert.equal(document.activeElement,first);first.focus();await f.React.act(async()=>first.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true})));assert.equal(document.activeElement,last);
 await f.React.act(async()=>last.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(document.activeElement,f.launcher());
 await f.slot('quick',0);dialog=document.querySelector('[role="dialog"]');assert.equal(dialog.getAttribute('aria-modal'),'true');
 await f.React.act(async()=>dialog.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));assert.equal(document.activeElement,f.launcher());assert.equal(f.calls.length,0);
}));

test('new slot IDs never collide with an existing ID in another position or category',()=>fixture(async f=>{
 const before=JSON.stringify(f.layout);await f.slot('quick',5);await f.click(document.querySelector('.pos-button-product-list button'));await f.click(f.save());
 const result=JSON.parse(f.calls[0].options.body).layout;
 assert.notEqual(result.quickKeys[5].id,'quick-6');assert.notEqual(result.quickKeys[5].id,'quick-6-2');
 assert.equal(result.quickKeys[0].id,'quick-6');assert.equal(result.categories[0].id,'quick-6-2');
 assert.equal(new Set([...result.quickKeys,...result.categories].map(x=>x?.id).filter(Boolean)).size,7);
 assert.equal(JSON.stringify(f.layout),before);
},{layout:{quickKeys:[{id:'quick-6',label:'Keep ID',visible:true,productCodes:['product-B']}],categories:[{id:'quick-6-2',label:'Keep category ID',visible:true}]}}));

test('a late save response cannot replace a newer layout for the same store and API',()=>fixture(async f=>{
 await f.slot('quick',0);await f.click(document.querySelector('.pos-button-product-list button'));
 await f.click(f.save());assert.equal(f.calls.length,1);
 const newer={quickKeys:[{id:'concurrent',label:'NEWER LAYOUT',visible:true}],categories:[]};await f.render({layout:newer});
 await f.React.act(async()=>releasePending({layout:{quickKeys:[{id:'old',label:'OLD RESPONSE'}]},version:2}));
 assert.equal(f.completed.length,0);assert.doesNotMatch(document.body.textContent,/OLD RESPONSE/);assert.equal(f.calls.length,1);
},{api:()=>new Promise(resolve=>{releasePending=resolve})}));
let releasePending;

test('initially absent matching host is found on a props refresh without exposing another store launcher',()=>fixture(async f=>{
 assert.equal(f.launcher(),null);await f.render({catalogStoreId:'store-A'});assert.ok(f.launcher());
 await f.render({catalogStoreId:'store-B'});assert.equal(f.launcher(),null);
 await f.render({catalogStoreId:'store-A'});assert.ok(f.launcher());assert.equal(f.calls.length,0);
},{catalogStoreId:'store-B'}));

test('actual catalog resolver never binds generated empty positions to a product named KENO, while legacy bindings remain unchanged',()=>fixture(async f=>{
 await f.slot('quick',19);await f.click(document.querySelectorAll('.pos-button-product-list button')[1]);await f.click(f.save());
 const result=JSON.parse(f.calls[0].options.body).layout;assert.equal(result.quickKeys[0].emptySlot,true);assert.equal(result.quickKeys[19].emptySlot,undefined);
 await f.render({layout:result});const buttons=[...document.querySelectorAll('.standard-quick>div>button')];
 assert.equal(buttons[0].disabled,true);assert.equal(buttons[0].textContent,'ΚΕΝΟ');await f.click(buttons[0]);assert.equal(f.added.length,0);
 assert.equal(buttons[19].disabled,false);assert.match(buttons[19].textContent,/DELIBERATE CHOICE/);await f.click(buttons[19]);assert.equal(f.added.length,1);
 await f.render({layout:{quickKeys:[{id:'legacy',label:'ΚΕΝΟ',visible:true,productCodes:[]}],categories:[]}});
 assert.match(document.querySelector('.standard-quick>div>button').textContent,/ΚΕΝΟ ΜΠΟΥΚΑΛΙ/);assert.equal(document.querySelector('.standard-quick>div>button').disabled,false);
},{catalogProducts:[{id:'unrelated',name:'ΚΕΝΟ ΜΠΟΥΚΑΛΙ',salePrice:9},{id:'chosen',name:'DELIBERATE CHOICE',salePrice:2}]}));

test('saving a new target without choosing a product, even with blank label, remains inert under the actual resolver',()=>fixture(async f=>{
 await f.slot('quick',0);const input=document.querySelector('.pos-button-editor-fields input');
 await f.React.act(async()=>{Object.getOwnPropertyDescriptor(f.dom.window.HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}))});
 await f.click(f.save());const result=JSON.parse(f.calls[0].options.body).layout;assert.equal(result.quickKeys[0].emptySlot,true);
 await f.render({layout:result});const button=document.querySelector('.standard-quick>div>button');assert.equal(button.disabled,true);assert.doesNotMatch(button.textContent,/FIRST UNCHOSEN/);await f.click(button);assert.equal(f.added.length,0);
 await f.slot('quick',0);await f.click(document.querySelector('.pos-button-product-list button'));await f.click(f.save());
 const configured=JSON.parse(f.calls[1].options.body).layout;assert.equal(configured.quickKeys[0].emptySlot,undefined);assert.deepEqual(configured.quickKeys[0].productCodes,['unrelated']);
},{catalogProducts:[{id:'unrelated',name:'FIRST UNCHOSEN',salePrice:9}]}));

test('generated category placeholders stay disabled until explicitly configured',()=>fixture(async f=>{
 await f.slot('category',1);await f.click(f.save());const result=JSON.parse(f.calls[0].options.body).layout;
 assert.equal(result.categories[0].emptySlot,true);assert.equal(result.categories[1].emptySlot,true);await f.render({layout:result});
 const categories=[...document.querySelectorAll('.standard-category-strip>div>button')];assert.equal(categories.length,2);assert.equal(categories.every(button=>button.disabled),true);assert.equal(categories[0].textContent.includes('0 προϊόντα'),true);
},{catalogProducts:[{id:'unrelated',name:'UNRELATED',categoryName:'ΚΕΝΟ',salePrice:9}]}));

test('callbacks from an old dialog cannot save, choose, rename or close a newer draft in the same scope',()=>fixture(async f=>{
 await f.slot('quick',0);await f.click(document.querySelector('.pos-button-product-list button'));
 const oldSave=callback(f.save()),oldChoose=callback(document.querySelector('.pos-button-product-list button')),oldRename=callback(document.querySelector('.pos-button-editor-fields input'),'onChange'),oldClose=callback(document.querySelector('[aria-label="Κλείσιμο ρύθμισης πλήκτρου"]'));
 await f.click(document.querySelector('[aria-label="Κλείσιμο ρύθμισης πλήκτρου"]'));await f.slot('quick',1);await f.click(document.querySelectorAll('.pos-button-product-list button')[1]);
 await f.React.act(async()=>{oldChoose();oldRename({target:{value:'OLD DIALOG INJECTION'}});oldClose();oldSave()});
 assert.equal(f.calls.length,0);assert.match(document.querySelector('[role="dialog"]').textContent,/Κουμπί 2/);assert.equal(document.querySelector('.pos-button-editor-fields input').value,'SYNTHETIC PRODUCT B');
 await f.click(f.save());assert.equal(f.calls.length,1);const saved=JSON.parse(f.calls[0].options.body).layout;
 assert.deepEqual(saved.quickKeys[0],f.layout.quickKeys[0]);assert.deepEqual(saved.quickKeys[1].productCodes,['product-B']);assert.doesNotMatch(JSON.stringify(saved),/OLD DIALOG INJECTION/);
},{layout:{quickKeys:[{id:'old-slot',label:'Old slot',visible:true,productCodes:['product-A']},{id:'new-slot',label:'New slot',visible:true,productCodes:['product-B']}],categories:[]}}));

test('an old chooser or product callback cannot acquire a new store draft authority',()=>fixture(async f=>{
 await f.click(f.launcher());const oldSlot=callback(document.querySelector('[data-pos-edit-kind="quick"][data-pos-edit-index="0"]'));
 await f.click(document.querySelector('[aria-label="Κλείσιμο επιλογής πλήκτρου"]'));await f.click(f.launcher());
 await f.React.act(async()=>oldSlot());assert.equal(document.querySelectorAll('[data-pos-edit-kind]').length,40);
 await f.click(document.querySelector('[data-pos-edit-kind="quick"][data-pos-edit-index="0"]'));const oldChoose=callback(document.querySelector('.pos-button-product-list button'));
 await f.render({store:{id:'store-B'},layout:{quickKeys:[],categories:[]},products:[products[1]]});await f.slot('quick',0);await f.click(document.querySelector('.pos-button-product-list button'));
 await f.React.act(async()=>oldChoose());await f.click(f.save());
 const saved=JSON.parse(f.calls[0].options.body).layout;assert.equal(f.calls[0].path,'/api/store-pos/stores/store-B/layout');assert.deepEqual(saved.quickKeys[0].productCodes,['product-B']);
}));

test('clearing or blanking a new category label never activates fallback category matching',()=>fixture(async f=>{
 for(const label of ['', '   ']){
  await f.slot('category',0);const input=document.querySelector('.pos-button-editor-fields input');
  await f.React.act(async()=>{Object.getOwnPropertyDescriptor(f.dom.window.HTMLInputElement.prototype,'value').set.call(input,label);input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}))});
  await f.click(f.save());const result=JSON.parse(f.calls.at(-1).options.body).layout;assert.equal(result.categories[0].emptySlot,true);
  await f.render({layout:result});const button=document.querySelector('.standard-category-strip>div>button');assert.equal(button.disabled,true);assert.match(button.textContent,/0 προϊόντα/);await f.click(button);assert.equal(document.querySelector('.pos-modern-product'),null);
 }
},{catalogProducts:[{id:'default',name:'DEFAULT MATCH',categoryName:'ΚΑΤΗΓΟΡΙΑ',salePrice:3},{id:'uncategorized',name:'NO CATEGORY',categoryName:'',salePrice:4}]}));
