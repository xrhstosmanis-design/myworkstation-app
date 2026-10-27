import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash,webcrypto} from 'node:crypto';
import {transform} from 'esbuild';
import XLSX from 'xlsx';
import {fetchCashArchive,saveCashArchive,cashArchivePreviewPayload} from '../../client/src/lib/cash-reviewed-archive.js';
const receipt={storeId:'store',from:'2026-10-21',to:'2026-10-21',generation:'0',head:'b'.repeat(64),reportHash:'a'.repeat(64),report:{text:'Synthetic',rows:[]}};
const previewHash=createHash('sha256').update(cashArchivePreviewPayload(receipt.report)).digest('hex');
function response(){const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([['Synthetic']]),'Αναφορά');return {storeId:'store',period:{from:receipt.from,to:receipt.to},generation:receipt.generation,head:receipt.head,reportHash:receipt.reportHash,previewHash,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',filename:'cash-reviewed-2026-10-21-2026-10-21.xlsx',base64:XLSX.write(b,{type:'base64',bookType:'xlsx'})};}
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
test('actual download reader binds every receipt field and never releases late, foreign, wrong-format or oversized responses',async()=>{
 let calls=0,seen;const run=(value=response(),isCurrent=()=>true)=>fetchCashArchive(async url=>{calls++;seen=url;return value;},receipt,{isCurrent,cryptoImpl:webcrypto});
 const result=await run();assert.match(seen,/\/stores\/store\/archive\?/);assert.equal(new URL('https://fixture.invalid'+seen).searchParams.get('head'),receipt.head);assert.equal(result.filename,response().filename);assert.equal(result.blob.type,response().mimeType);
 for(const patch of [{storeId:'foreign'},{generation:'1'},{head:'c'.repeat(64)},{reportHash:'c'.repeat(64)},{filename:'unsafe.xlsm'},{mimeType:'text/html'},{base64:'not a workbook'},{previewHash:'c'.repeat(64)},{base64:'UEsDB'+'A'.repeat(12*1024*1024)}])await assert.rejects(run({...response(),...patch}));
 const before=calls;assert.equal(await run(response(),()=>false),null);assert.equal(calls,before);
 let current=true;assert.equal(await fetchCashArchive(async()=>{current=false;return response();},receipt,{isCurrent:()=>current,cryptoImpl:webcrypto}),null);
 const events=[],link={click:()=>events.push('click'),remove:()=>events.push('remove')};saveCashArchive(result,{documentImpl:{createElement:()=>link,body:{appendChild:()=>events.push('append')}},urlImpl:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL:url=>events.push(url)}});assert.deepEqual(events,['append','click','remove','blob:synthetic']);assert.equal(link.download,result.filename);
});

async function actualPanel(){
 const key='archive-ui-'+randomUUID(),f={states:0,refIndex:0,values:[],refs:[],saved:[],setters:[],apiCalls:[],api:async()=>response()};f.called=new Promise(resolve=>f.notifyApi=resolve);globalThis[key]=f;
 const react=import.meta.resolve('react'),helper=new URL('../../client/src/lib/cash-reviewed-archive.js',import.meta.url).href;
 const hooks=data(`import React from ${JSON.stringify(react)};export default React;export function useState(initial){const f=globalThis[${JSON.stringify(key)}],i=f.states++;if(!Object.hasOwn(f.values,i))f.values[i]=i===0?true:i===1?{...${JSON.stringify(receipt)},rows:[],context:[],text:'Synthetic',history:[]}:initial;return [f.values[i],v=>{f.values[i]=v;f.setters.push([i,v]);}];}export function useRef(value){const f=globalThis[${JSON.stringify(key)}],i=f.refIndex++;return f.refs[i]||(f.refs[i]={current:value});}export function useEffect(){}`);
 const helpers=data(`import {fetchCashArchive as read} from ${JSON.stringify(helper)};import {webcrypto} from 'node:crypto';export function fetchCashArchive(api,receipt,options){return read(api,receipt,{...options,cryptoImpl:webcrypto});}export function saveCashArchive(value){globalThis[${JSON.stringify(key)}].saved.push(value);}`);
 let source=await readFile(new URL('../../client/src/components/shared/CashReconciliationPanel.jsx',import.meta.url),'utf8');source=source.replace("from 'react'",'from '+JSON.stringify(hooks)).replace("from '../../lib/cash-reviewed-archive.js'",'from '+JSON.stringify(helpers));const compiled=await transform(source,{loader:'jsx',format:'esm'});const {default:Panel}=await import(data(compiled.code));
 f.render=()=>{f.states=0;f.refIndex=0;return Panel({api:async(...args)=>{f.apiCalls.push(args);f.notifyApi();return f.api(...args);},storeId:receipt.storeId,from:receipt.from,to:receipt.to});};const tree=f.render();
 const find=node=>{if(!node||typeof node!=='object')return null;if(node.type==='button'&&node.props.children==='Excel με επανυπολογισμούς')return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child);if(found)return found;}return null;};
 f.findDownload=find;const button=find(tree);assert(button);assert.equal(f.apiCalls.length,0);return {f,button,cleanup:()=>delete globalThis[key]};
}
test('actual panel download action makes one GET for repeated click, saves current receipt and resets busy without provider/mail/review writes',async()=>{
 const {f,button,cleanup}=await actualPanel();let finish;f.api=()=>new Promise(resolve=>finish=resolve);
 try{const first=button.props.onClick();await button.props.onClick();await f.called;assert.equal(f.apiCalls.length,1);finish(response());await first;assert.equal(f.saved.length,1);assert.equal(f.refs[2].current,false);assert(f.setters.some(([,value])=>typeof value==='string'&&value.includes('Δημιουργήθηκε')));assert(f.apiCalls.every(args=>args.length===1));}finally{cleanup();}
});
test('actual panel discards a completed old-store download and requires refresh after a failed receipt without retry',async()=>{
 for(const stale of [true,false]){const {f,button,cleanup}=await actualPanel();let finish;f.api=()=>new Promise((resolve,reject)=>finish=stale?()=>resolve(response()):()=>reject(Error('changed source')));
  try{const work=button.props.onClick();await f.called;if(stale){f.refs[0].current='another selection';f.refs[1].current++;}finish();await work;assert.equal(f.saved.length,0);assert.equal(f.apiCalls.length,1);if(!stale)assert.equal(f.findDownload(f.render()).props.disabled,true);}finally{cleanup();}
 }
});
