import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm,access,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {renderPosFixture} from './helpers/pos-ui-browser.mjs';
import {withMountedPos} from './helpers/pos-modern-fixture.mjs';

// Capture the actual production component after isolated synthetic cart interactions.
// No manual approximation of the POS DOM and no checkout/network/business writes.
const dir=new URL('../../client/src/components/store/',import.meta.url);
const files=['store-pos.css','store-pos-viewport-fit.css','store-pos-standard-modals.css','store-pos-aux-actions.css','pos-categories-readable.css','pos-collapsible-header.css','pos-header-actions-menu.css','pos-last-transaction.css','pos-credit-customer.css','pos-customer-account.css','store-chat.css','pos-ui-v2.css'];
const css=(await Promise.all(files.map(f=>readFile(new URL(f,dir),'utf8')))).join('\n').replace(/@import\s+[^;]+;/g,'');
const snapshots=new Map();
async function fixture(keypad,notices=false,textSize='FONT_12'){const key=keypad+'/'+notices+'/'+textSize;if(!snapshots.has(key))snapshots.set(key,await withMountedPos({keypad,notices,textSize}));return '<!doctype html><meta charset="utf-8"><style>body{margin:0}*{box-sizing:border-box}'+css+'</style>'+snapshots.get(key);}
let chrome=process.env.CHROME_BIN;
for(const bin of ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'])if(!chrome){try{await access(bin);chrome=bin}catch{}}
const verify=`try{const check=(v,m)=>{if(!v)throw Error(m)},R=e=>e.getBoundingClientRect(),article=document.querySelector('article.pos-modern'),footer=document.querySelector('.standard-action-bar'),primary=document.querySelector('.pos-modern-primary-payments');check(article,'real modern root');check(document.documentElement.scrollWidth<=innerWidth,'page horizontal overflow');check(R(article).bottom<=innerHeight+1,'page vertical overflow');const exposed=el=>{el.scrollIntoView({block:'nearest',inline:'nearest'});const r=R(el);check(r.width>=35&&r.height>=40,'touch target '+el.textContent+' '+r.width+'/'+r.height);check(r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,'control in viewport '+el.textContent);check(el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),'hit target '+el.textContent+' actual '+document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,120))};for(const el of [...primary.querySelectorAll('button'),...footer.querySelectorAll('button')])exposed(el);const payButtons=[...primary.querySelectorAll('button')],cash=primary.querySelector('.cash'),card=primary.querySelector('.card');check(payButtons.map(button=>button.className).join(',')==='cash,credit,iris,card','payment DOM order matches separate positions');check(R(cash).right<R(card).left&&R(card).left-R(cash).right>R(cash).width,'cash and card are not neighboring targets');const basket=document.querySelector('.pos-modern-cart'),last=document.querySelector('[data-pos-last-transaction]');check(document.querySelectorAll('[data-pos-last-transaction]').length===1&&basket.firstElementChild===last,'one last transaction at basket top');exposed(last);check(R(last).bottom<=R(basket.querySelector('header')).top+1,'last transaction above cart title');const work=document.querySelector('.standard-pos-grid'),cart=document.querySelector('.pos-modern-cart .standard-lines');cart.scrollIntoView({block:'nearest'});check(R(cart).height>=90&&R(cart).width>=240,'useful actual basket '+R(cart).width+'/'+R(cart).height);check(Math.min(R(cart).bottom,R(work).bottom)-Math.max(R(cart).top,R(work).top)>=90,'basket visible working area '+(Math.min(R(cart).bottom,R(work).bottom)-Math.max(R(cart).top,R(work).top)));check(document.querySelectorAll('.standard-line').length===15,'same actual15line cart');const search=document.querySelector('.standard-sale-panel .standard-search input');search.scrollIntoView({block:'nearest'});check(R(search).width>=150,'usable actual scanner');const categories=[...document.querySelectorAll('.standard-category-strip>div>button')];check(categories.length===20,'all20 configured categories');for(const el of categories)exposed(el);const quick=document.querySelector('.standard-quick>div');check(quick.children.length===20,'all20 quickkeys');if((parseFloat(getComputedStyle(article).getPropertyValue('--pos-text-scale'))||1)===1&&innerHeight>620){check(R(quick.children[0]).height<150,'compact product tile remains below prior150px height');}for(const el of quick.children){exposed(el);const r=R(el),name=R(el.querySelector('.quick-product-name'));check(name.top>=r.top&&name.bottom<=r.bottom+1,'quickname visible');}work.scrollTop=0;quick.scrollTop=0;for(const el of document.querySelectorAll('.store-pos-alert')){const r=R(el);check(r.top>=0&&r.bottom<=R(work).top+1,'notice does notcover workspace');for(const button of el.querySelectorAll('button')){const b=R(button);check(b.width>=28&&b.height>=32,'notice dismiss target');check(button.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),'notice dismiss hit');}}document.body.dataset.result='PASS'}catch(e){document.body.dataset.result='FAIL:'+e.message}`;
const cases=[
  {width:1366,height:768,scale:1,textSize:'FONT_20'},
  {width:1024,height:768,scale:1,textSize:'FONT_20'},
  ...[[1024,768],[1280,800],[1366,768],[1920,1080],[1024,681],[1366,681],[1366,625]].map(([width,height])=>({width,height,scale:1})),
  ...[1366,1024].flatMap(screenWidth=>[1.25,1.5].map(scale=>({width:Math.floor(screenWidth/scale),height:Math.floor(768/scale),scale}))),
];
for(const {width,height,scale,textSize='FONT_12'} of cases)for(const keypad of [true,false])for(const notices of (width===1366||scale!==1?[false,true]:[false]))test(`rendered POS viewport ${width}x${height}, scale ${scale}, font ${textSize}, keypad ${keypad?'shown':'hidden'}, notices ${notices}`,{skip:!chrome&&!process.env.CI,timeout:40000},async()=>{
  assert.ok(chrome,'Chromium required in CI');
  const temp=await mkdtemp(path.join(tmpdir(),'mws-pos-v2-layout-'));
  const shots=process.env.POS_UI_SCREENSHOTS;
  if(shots)await mkdir(shots,{recursive:true});
  const name=`pos-${width}x${height}-${scale}-${textSize}-${keypad?'keypad':'wide'}-${notices?'notices':'plain'}`;
  try{
    const file=path.join(temp,'fixture.html');
    const html=await fixture(keypad,notices,textSize);await writeFile(file,html+'<script>'+verify+'</script>');
    if(shots)await writeFile(path.join(shots,name+'.html'),html);
    const result=await renderPosFixture({chrome,file,width,height,scale,profile:path.join(temp,'profile'),screenshot:shots&&path.join(shots,name+'.png')});
    assert.deepEqual(result.viewport,{width,height,scale},'actual CSS viewport and zoom-equivalent DPR');
    assert.equal(result.result,'PASS',result.result);
  }finally{await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
