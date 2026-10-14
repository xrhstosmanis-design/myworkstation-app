import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('mounted screen recorder selects real MP4, downloads same blob, rejects unsupported/wrong formats and releases capture',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','MediaRecorder','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/ScreenRecorderControl.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime'],loader:{'.css':'empty'}});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const urls=[],revoked=[],downloads=[],recorders=[],captures=[];let supports=true,failConstructor=false,pendingCapture=null,stops=0,ended=null;
 const track={stop(){stops++},addEventListener(name,fn){assert.equal(name,'ended');ended=fn}},stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
 Object.defineProperty(navigator,'mediaDevices',{value:{getDisplayMedia:async options=>{captures.push(options);return pendingCapture?await pendingCapture:stream}}});
 class Recorder{
  static isTypeSupported(type){return supports&&type==='video/mp4;codecs=avc1'}
  constructor(s,options){if(failConstructor)throw new Error('encoder unavailable');assert.equal(s,stream);this.mimeType=options.mimeType;this.state='inactive';recorders.push(this)}
  start(slice){assert.equal(slice,1000);this.state='recording'}
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['one'],{type:this.mimeType})});this.ondataavailable?.({data:new Blob(['two'],{type:this.mimeType})});this.onstop?.()}
 }
 window.MediaRecorder=globalThis.MediaRecorder=Recorder;
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
 URL.createObjectURL=blob=>{const url='blob:recording-'+urls.length;urls.push({url,blob});return url};URL.revokeObjectURL=url=>revoked.push(url);
 dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,href:this.href})};
 let root=createRoot(document.getElementById('root'));
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text)),click=text=>act(async()=>button(text).click());
 try{
  await act(async()=>root.render(React.createElement(module.exports.default)));
  await click('Εγγραφή οθόνης');assert.equal(recorders[0].mimeType,'video/mp4;codecs=avc1');assert.equal(captures[0].audio,false);
  await click('Διακοπή');assert.equal(stops,1);assert.equal(urls[0].blob.type,'video/mp4;codecs=avc1');assert.equal(await urls[0].blob.text(),'onetwo');assert.equal(document.querySelector('video').getAttribute('src'),urls[0].url);
  await click('Αποθήκευση MP4');assert.match(downloads[0].name,/^myworkstation-screen-\d{4}-\d\d-\d\d-\d\d-\d\d-\d\d\.mp4$/);assert.equal(downloads[0].href,urls[0].url);assert.equal(button('Ανέβασμα στο site').disabled,true);
  await click('Εγγραφή οθόνης');await act(async()=>ended());assert.equal(urls.length,2);assert.ok(revoked.includes(urls[0].url));
  await act(async()=>document.querySelector('header button').click());assert.ok(revoked.includes(urls[1].url));assert.equal(document.querySelector('video'),null);
  supports=false;await click('Εγγραφή οθόνης');assert.match(document.body.textContent,/δεν υποστηρίζει εγγραφή MP4/);assert.equal(captures.length,2,'unsupported MP4 does not open capture chooser or silently record WebM');
  supports=true;failConstructor=true;await click('Εγγραφή οθόνης');assert.equal(stops,3,'constructor failure releases selected screen');failConstructor=false;
  await click('Εγγραφή οθόνης');recorders.at(-1).mimeType='video/webm';await click('Διακοπή');assert.equal(urls.length,2,'WebM must never be relabelled MP4');assert.match(document.body.textContent,/Δεν δημιουργήθηκε βίντεο MP4/);
  await click('Εγγραφή οθόνης');await click('Διακοπή');const last=urls.at(-1).url;await act(async()=>root.unmount());assert.ok(revoked.includes(last),'unmount releases latest preview URL');
  root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(module.exports.default)));
  await click('Εγγραφή οθόνης');const active=recorders.at(-1),stopsBeforeUnmount=stops,urlsBeforeUnmount=urls.length;
  await act(async()=>root.unmount());assert.equal(active.state,'inactive');assert.equal(stops,stopsBeforeUnmount+1);assert.equal(urls.length,urlsBeforeUnmount,'unmount cannot create an orphan preview');
  root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(module.exports.default)));
  const stopsBeforePending=stops,capturesBeforePending=captures.length;let resolveCapture;pendingCapture=new Promise(resolve=>{resolveCapture=resolve});
  await click('Εγγραφή οθόνης');await click('Εγγραφή οθόνης');const count=recorders.length,captureCount=captures.length;
  assert.equal(captureCount,capturesBeforePending+1,'duplicate start opens only one chooser');
  await act(async()=>root.unmount());await act(async()=>resolveCapture(stream));assert.equal(recorders.length,count,'late permission result cannot start after unmount');assert.equal(captures.length,captureCount);assert.equal(stops,stopsBeforePending+1);
 }finally{await act(async()=>root.unmount());URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;dom.window.close();for(const [key,d] of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}}
});

