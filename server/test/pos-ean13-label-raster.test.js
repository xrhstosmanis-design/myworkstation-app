import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {build} from 'esbuild';
import {writeEan13Label} from '../../client/src/utils/ean13-label.js';
import {renderPosFixture} from './helpers/pos-ui-browser.mjs';
const chrome=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>p&&existsSync(p));
const label={barcode:'5201219000118',productName:'ΝΕΡΟ 500ML',price:0.5,storeName:'ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ',settings:{widthMm:60,heightMm:40}};
function htmlFor(options=label){let html;const popup={opener:{},document:{open(){},write(value){html=value},close(){}}};writeEan13Label(popup,options);assert.equal(popup.opener,null);return html;}

test('raster label bounds paper sizes and escapes text without a network/vector fallback',()=>{
 const html=htmlFor({...label,productName:'</script><script>window.pwned=true</script>',settings:{widthMm:Infinity,heightMm:1000000,printerName:'<img src=x onerror=alert(1)>'}});
 assert.match(html,/@page\{size:60mm 38mm;margin:0\}/);
 assert.equal((html.match(/<script>/g)||[]).length,1);
 assert.ok(!html.includes('<svg'));
 assert.ok(!html.includes('<img src=x'));
 assert.ok(html.includes('\\u003c/script>'));
 assert.match(html,/id="print-label"[^>]*disabled/);
});

test('actual Chromium renders one decoded raster, readable EAN, fixed paper and explicit printing only',{skip:!chrome,timeout:90000},async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mws-label-raster-'));
 try{
  await build({stdin:{contents:"import{MultiFormatReader,RGBLuminanceSource,BinaryBitmap,HybridBinarizer}from'@zxing/library';window.readBarcode=(canvas)=>{const c=canvas.getContext('2d'),p=c.getImageData(0,0,canvas.width,canvas.height).data,l=new Uint8ClampedArray(canvas.width*canvas.height);for(let i=0;i<l.length;i++)l[i]=(p[i*4]+2*p[i*4+1]+p[i*4+2])/4;return new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(l,canvas.width,canvas.height)))).getText()};",resolveDir:path.resolve('client'),loader:'js'},bundle:true,format:'iife',outfile:path.join(temp,'decoder.js'),logLevel:'error'});
  for(const [widthMm,heightMm,fail]of[[60,40,false],[30,25,false],[100,80,false],[60,40,true]]){
   const html=htmlFor({...label,productName:'ΝΕΡΟ 500ML </script><script>window.pwned=true</script>',settings:{widthMm,heightMm}});
   const stub=`<script>window.printCalls=0;window.networkCalls=0;window.print=()=>window.printCalls++;window.fetch=()=>{window.networkCalls++;throw Error('network')};${fail?"HTMLImageElement.prototype.decode=()=>Promise.reject(Error('fixture decode failure'));":''}</script><script src="decoder.js"></script>`;
   const verification=`<script>window.print();document.getElementById('print-label').click();window.verifyLabel=()=>{const check=(ok,msg)=>{if(!ok)throw Error(msg)};const img=document.getElementById('label-image'),button=document.getElementById('print-label');check(!window.pwned,'injected script');check(window.networkCalls===0,'network');check(window.printCalls===0,'automatic/early print');if(${fail}){check(button.disabled&&img.hidden&&!img.hasAttribute('src'),'failure must refuse');window.print();button.click();check(window.printCalls===0,'failed image printed')}else{check(!button.disabled&&!img.hidden&&img.complete,'decoded image');check(img.naturalWidth===Math.round(${widthMm}*300/25.4)&&img.naturalHeight===Math.round(${heightMm}*300/25.4),'raster dimensions');const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext('2d').drawImage(img,0,0);check(window.readBarcode(canvas)==='5201219000118','barcode readback');const b=img.getBoundingClientRect();check(Math.abs(b.width-${widthMm}*96/25.4)<0.1&&Math.abs(b.height-${heightMm}*96/25.4)<0.1,'physical dimensions');check(img.alt.includes('ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ')&&img.alt.includes('0,50'),'Greek fields');button.click();check(window.printCalls===1,'explicit single print')}document.body.dataset.result='PASS'};</script>`;
   const file=path.join(temp,`label-${widthMm}-${heightMm}-${fail}.html`);
   await fs.writeFile(file,html.replace('<body>','<body>'+stub).replace('</body>',verification+'</body>'));
   const result=await renderPosFixture({chrome,file,width:1000,height:800,profile:path.join(temp,`profile-${widthMm}-${fail}`),steps:[{evaluate:`(async()=>{for(let i=0;i<200&&!document.body.dataset.labelReady;i++)await new Promise(r=>setTimeout(r,10));window.verifyLabel()})()`}]});
   assert.equal(result.result,'PASS');
  }
 }finally{await fs.rm(temp,{recursive:true,force:true,maxRetries:3,retryDelay:100})}
});
