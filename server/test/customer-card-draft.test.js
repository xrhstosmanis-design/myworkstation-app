import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('actual customer editor preserves unsaved basic and discount fields across tabs and refuses an unnamed account',async()=>{
 const source=await fs.readFile(new URL('../../client/src/components/commerce/installCustomerControlSuiteV2.js',import.meta.url),'utf8');
 const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
 const implementation=extract('function basicTab(', 'function addressesTab(')+extract('function otherTab(', 'async function receiptModal(');
 const dom=new JSDOM('<body></body>'),document=dom.window.document,calls=[],alerts=[];
 let saved=null;
 const api=async(url,options={})=>{if(options.method){const body=JSON.parse(options.body);calls.push({url,method:options.method,body});saved={...saved,...body,id:'new-account'};return {id:saved.id}}return {customer:{...saved},addresses:[]}};
 const modal=html=>{const el=document.createElement('section');el.innerHTML=html;document.body.appendChild(el);return el};
 const editor=new Function('api','modal','esc','num','loadReport','addressesTab','customerCardModal','alert','FormData',implementation+';return customerModal;')(api,modal,String,v=>Number(v||0),async()=>{},()=>'',()=>{},s=>alerts.push(s),dom.window.FormData);
 const click=tab=>document.querySelector(`[data-customer-modal-tab="${tab}"]`).click();
 const set=(name,value)=>{document.querySelector(`[name="${name}"]`).value=value};
 const submit=async selector=>{document.querySelector(selector).dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));for(let i=0;i<8;i++)await Promise.resolve()};
 try{
  await editor(document.body);
  set('name','Named LAB account');set('phone','virtual-phone');
  click('other');set('discountAudience','DOCTOR');set('discountPercent','20');set('creditLimit','10');
  click('basic');assert.equal(document.querySelector('[name="name"]').value,'Named LAB account');assert.equal(document.querySelector('[name="phone"]').value,'virtual-phone');
  click('other');assert.equal(document.querySelector('[name="discountPercent"]').value,'20');
  await submit('[data-customer-other]');assert.equal(calls.length,1);assert.equal(calls[0].method,'POST');assert.equal(calls[0].body.name,'Named LAB account');assert.equal(calls[0].body.discountAudience,'DOCTOR');assert.equal(calls[0].body.discountPercent,20);assert.equal(calls[0].body.creditLimit,10);assert.equal(calls[0].body.phone,'virtual-phone');assert.equal(document.querySelector('[data-customer-modal-tab="addresses"]').disabled,false);
  document.body.innerHTML='';await editor(document.body);click('other');set('discountPercent','15');
  await submit('[data-customer-other]');assert.equal(calls.length,1);assert.match(alerts.at(-1),/επωνυμία/);assert.ok(document.querySelector('[data-customer-basic]'));
  set('name','Second virtual account');await submit('[data-customer-basic]');assert.equal(calls.length,2);assert.equal(calls[1].body.name,'Second virtual account');assert.equal(calls[1].body.discountPercent,15);
 }finally{dom.window.close()}
});
