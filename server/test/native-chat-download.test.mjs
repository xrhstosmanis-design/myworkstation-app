import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformSync} from 'esbuild';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import QRCode from 'qrcode';
import {PNG} from 'pngjs';
import {RGBLuminanceSource,BinaryBitmap,HybridBinarizer,QRCodeReader} from '@zxing/library';

test('mounted Android download dialog exposes a decodable public install QR without account/store credentials',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/store/private-store?token=PRIVATE'}),previous={};
 for(const key of ['window','document','navigator','location']){previous[key]=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]})}
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false};
 const source=fs.readFileSync(new URL('../../client/src/components/store/NativeChatDownload.jsx',import.meta.url),'utf8'),module={exports:{}};
 const dependencies={react:React,qrcode:QRCode,'./native-chat-download.css':{}};
 new Function('require','module','exports',transformSync(source,{loader:'jsx',format:'cjs'}).code)(name=>dependencies[name],module,module.exports);
 const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(module.exports.default)));
  for(let attempt=0;attempt<100&&!document.querySelector('img');attempt++)await act(async()=>new Promise(r=>setTimeout(r,20)));
  await act(async()=>document.querySelector('button').click());assert.equal(document.querySelector('dialog').open,true);
  const link=document.querySelector('a');assert.equal(link.href,'https://fixture.invalid/downloads/chat-android/');
  const image=document.querySelector('img');assert.ok(image);
  const png=PNG.sync.read(Buffer.from(image.src.split(',')[1],'base64')),pixels=new Int32Array(png.width*png.height);
  for(let i=0;i<pixels.length;i++)pixels[i]=(png.data[4*i]<<16)|(png.data[4*i+1]<<8)|png.data[4*i+2];
  const decoded=new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,png.width,png.height)))).getText();
  assert.equal(decoded,link.href);assert.equal(decoded.includes('PRIVATE'),false);assert.equal(decoded.includes('private-store'),false);
  await act(async()=>document.querySelector('[aria-label="Κλείσιμο λήψης Android"]').click());assert.equal(document.querySelector('dialog').open,false);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const key of Object.keys(previous)){if(previous[key])Object.defineProperty(globalThis,key,previous[key]);else delete globalThis[key]}delete globalThis.IS_REACT_ACT_ENVIRONMENT}
});

test('public install page fails closed until a valid versioned APK manifest exists',async()=>{
 const html=fs.readFileSync(new URL('../../client/public/downloads/chat-android/index.html',import.meta.url),'utf8');
 for(const mode of ['ready','missing','foreign']){
  let options;
  const dom=new JSDOM(html,{url:'https://fixture.invalid/downloads/chat-android/',runScripts:'dangerously',beforeParse(window){window.fetch=async(path,opts)=>{assert.equal(path,'./release.json');options=opts;return {ok:mode!=='missing',json:async()=>({package:'gr.myworkstation.chat.preview',version:'0.1.3-preview',path:mode==='foreign'?'https://foreign.invalid/app.apk':'/downloads/chat-android/MyWorkStation-Chat-Android-0.1.3-Preview.apk',sha256:'a'.repeat(64),bytes:3600000})}}}});
  await new Promise(r=>setTimeout(r,10));const link=dom.window.document.getElementById('download');
  assert.equal(options.credentials,'omit');assert.equal(link.hidden,mode!=='ready');
  if(mode==='ready'){assert.equal(new URL(link.href).origin,'https://fixture.invalid');assert.match(link.download,/0\.1\.3-Preview\.apk$/)}
  else assert.equal(link.hasAttribute('href'),false);
  dom.window.close();
 }
});

test('selected-store QR, explicit share/copy and store switching never reuse a prior invitation',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/store/ignored?token=PRIVATE'}),previous={};
 for(const key of ['window','document','navigator','location']){previous[key]=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]})}
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false};
 const copied=[],shared=[];dom.window.navigator.clipboard={writeText:async value=>copied.push(value)};dom.window.navigator.share=async value=>shared.push(value);
 const source=fs.readFileSync(new URL('../../client/src/components/store/NativeChatDownload.jsx',import.meta.url),'utf8'),module={exports:{}};
 new Function('require','module','exports',transformSync(source,{loader:'jsx',format:'cjs'}).code)(name=>({react:React,qrcode:QRCode,'./native-chat-download.css':{}})[name],module,module.exports);
 const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(module.exports.default,{store:{id:'store-A',name:'Fixture A'}})));
  for(let i=0;i<100&&!document.querySelector('img');i++)await act(async()=>new Promise(r=>setTimeout(r,10)));
  assert.equal(copied.length,0);assert.equal(shared.length,0);await act(async()=>document.querySelector('button').click());
  const url='https://fixture.invalid/downloads/chat-android/?store=store-A';assert.equal(document.querySelector('a').href,url);
  const png=PNG.sync.read(Buffer.from(document.querySelector('img').src.split(',')[1],'base64')),pixels=new Int32Array(png.width*png.height);for(let i=0;i<pixels.length;i++)pixels[i]=(png.data[4*i]<<16)|(png.data[4*i+1]<<8)|png.data[4*i+2];
  assert.equal(new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,png.width,png.height)))).getText(),url);
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Αντιγραφή συνδέσμου').click());assert.deepEqual(copied,[url]);
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Κοινοποίηση συνδέσμου').click());assert.equal(shared[0].url,url);
  await act(async()=>root.render(React.createElement(module.exports.default,{store:{id:'store-B',name:'Fixture B'}})));
  assert.equal(document.querySelector('dialog').open,false);assert.equal(document.querySelector('a').href,'https://fixture.invalid/downloads/chat-android/?store=store-B');assert.equal(document.body.textContent.includes('Fixture A'),false);assert.equal(document.body.textContent.includes('PRIVATE'),false);
  assert.equal(module.exports.nativeChatDownloadUrl('https://fixture.invalid','bad/id'),'https://fixture.invalid/downloads/chat-android/');
 }finally{await act(async()=>root.unmount());dom.window.close();for(const key of Object.keys(previous)){if(previous[key])Object.defineProperty(globalThis,key,previous[key]);else delete globalThis[key]}delete globalThis.IS_REACT_ACT_ENVIRONMENT}
});
test('post-install page exposes only validated explicit store handoff for a supporting APK',async()=>{
 const html=fs.readFileSync(new URL('../../client/public/downloads/chat-android/index.html',import.meta.url),'utf8');
 for(const [query,versionCode,expected] of [['?store=store-A',12,true],['?store=store-A',11,false],['?store=bad%2Fpath',12,false],['?store=A&store=B',12,false],['?token=PRIVATE',12,false]]){
  const dom=new JSDOM(html,{url:'https://fixture.invalid/downloads/chat-android/'+query,runScripts:'dangerously',beforeParse(w){w.fetch=async()=>({ok:true,json:async()=>({package:'gr.myworkstation.chat.preview',version:'0.1.11-preview',versionCode,path:'/downloads/chat-android/MyWorkStation-Chat-Android-0.1.11-Preview.apk',sha256:'a'.repeat(64),bytes:3600000})})}});
  await new Promise(r=>setTimeout(r,15));const link=dom.window.document.getElementById('open-chat');assert.equal(!link.hidden,expected);if(expected)assert.equal(link.getAttribute('href'),'intent://store/store-A#Intent;scheme=myworkstation-chat;package=gr.myworkstation.chat.preview;end');else assert.equal(link.hasAttribute('href'),false);assert.equal(dom.window.location.origin,'https://fixture.invalid');dom.window.close();
 }
});
