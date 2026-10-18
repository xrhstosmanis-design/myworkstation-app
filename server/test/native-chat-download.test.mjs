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
