import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {renderPosFixture} from './helpers/pos-ui-browser.mjs';
import {withMountedPos} from './helpers/pos-modern-fixture.mjs';
const dir=new URL('../../client/src/components/store/',import.meta.url),files=['store-pos.css','store-pos-viewport-fit.css','store-pos-standard-modals.css','store-pos-aux-actions.css','pos-categories-readable.css','pos-collapsible-header.css','pos-header-actions-menu.css','pos-last-transaction.css','pos-credit-customer.css','pos-customer-account.css','store-chat.css','pos-ui-v2.css'];
const css=(await Promise.all(files.map(f=>readFile(new URL(f,dir),'utf8')))).join('\n').replace(/@import\s+[^;]+;/g,'');
let chrome=process.env.CHROME_BIN;for(const bin of ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'])if(!chrome){try{await access(bin);chrome=bin}catch{}}
const selectors=['.standard-category-strip button span','.standard-action-bar>.danger','.pos-modern-primary-payments>.cash','.pos-modern-total>strong','.standard-search input','.line-name b','.number-grid button','.standard-quick button>small','.money-cards b','.pos-modern-banknotes button'];
const snapshots=new Map();
for(const [width,height] of [[1024,768],[1366,768],[682,512]])test(`actual POS FONT9/12/20 scales all text and retains reachable controls at ${width}x${height}`,{skip:!chrome&&!process.env.CI,timeout:90000},async()=>{
 assert.ok(chrome,'Chromium required in CI');const temp=await mkdtemp(path.join(tmpdir(),'pos-modern-text-')),sizes={};
 try{for(const [font,scale] of [['FONT_9',.75],['FONT_12',1],['FONT_20',1.6]]){
 if(!snapshots.has(font))snapshots.set(font,await withMountedPos({textSize:font}));
 const verify=`try{const check=(v,m)=>{if(!v)throw Error(m)},root=document.querySelector('.pos-modern'),R=e=>e.getBoundingClientRect();check(Number(root.style.getPropertyValue('--pos-text-scale'))===${scale},'actual persisted font preference');check(document.documentElement.scrollWidth<=innerWidth,'page width');for(const el of document.querySelectorAll('.pos-modern-primary-payments>button,.standard-action-bar>button')){el.scrollIntoView({block:'nearest',inline:'nearest'});const r=R(el);check(r.height>=40&&r.top>=0&&r.bottom<=innerHeight+1,'payment/action bounds '+el.textContent);check(el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),'payment/action hit '+el.textContent)}const cart=document.querySelector('.standard-lines'),work=document.querySelector('.standard-pos-grid');cart.scrollIntoView({block:'nearest'});check(R(cart).width>=240&&Math.min(R(cart).bottom,R(work).bottom)-Math.max(R(cart).top,R(work).top)>=90,'useful visible cart');const input=document.querySelector('.standard-search input');input.scrollIntoView({block:'nearest'});check(R(input).width>=150,'scanner width');for(const button of document.querySelectorAll('.standard-quick>div>button')){button.scrollIntoView({block:'nearest',inline:'nearest'});const r=R(button),name=R(button.querySelector('.quick-product-name'));check(name.top>=r.top&&name.bottom<=r.bottom+1,'full product name');check(button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),'quick hit '+button.textContent)}document.body.dataset.result=JSON.stringify(${JSON.stringify(selectors)}.map(s=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize)))}catch(e){document.body.dataset.result='FAIL:'+e.message}`;
 const file=path.join(temp,font+'.html');await writeFile(file,'<!doctype html><meta charset="utf-8"><style>body{margin:0}*{box-sizing:border-box}'+css+'</style>'+snapshots.get(font)+'<script>'+verify+'</script>');
 const result=await renderPosFixture({chrome,file,width,height,profile:path.join(temp,font)});assert.ok(!result.result.startsWith('FAIL:'),result.result);sizes[font]=JSON.parse(result.result);
 }
 for(let i=0;i<selectors.length;i++){assert.ok(Math.abs(sizes.FONT_9[i]/sizes.FONT_12[i]-.75)<.015,selectors[i]+' FONT9 ratio');assert.ok(Math.abs(sizes.FONT_20[i]/sizes.FONT_12[i]-1.6)<.015,selectors[i]+' FONT20 ratio')}
 }finally{await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
});
