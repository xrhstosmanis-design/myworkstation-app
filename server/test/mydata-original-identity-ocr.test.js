import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fetchOriginalPdf} from '../src/mydata-original.js';

const bytes=Buffer.from('%PDF-1.4\n'+'synthetic transport fixture '.repeat(8));
const checksum=crypto.createHash('sha256').update(bytes).digest('hex');
const identity={issuerVat:'099999999',counterpartVat:'088888888',mark:'400000000000042',documentNumber:'42'};
const embedded=`MARK ${identity.mark} RECIPIENT ${identity.counterpartVat} DOCUMENT 42`;
const profiles=[['epsilondigital-3rdparte.epsilonnet.gr','169'],['epsilondigital-cosmote.epsilonnet.gr','22'],['epsilondigital-telekom.epsilonnet.gr','22']];
const urlFor=(host,format)=>`https://${host}/fd/${'a'.repeat(32)}:${format}`;
const rowFor=(host=profiles[0][0],format=profiles[0][1],extra={})=>({...identity,...extra,rawPayload:{xml:`<downloadingInvoiceUrl>${urlFor(host,format)}</downloadingInvoiceUrl>`}});
const proof=(extra={})=>({text:`ISSUER VAT ${identity.issuerVat}`,confidence:75,pageCount:1,checksum,region:'FIRST_PAGE_TOP_45_PERCENT',...extra});
const pdfResponse=(data=bytes,headers={'content-type':'application/pdf'})=>new Response(data,{status:200,headers});
const read=async()=>({text:embedded,pageCount:1});

test('all three exact image-header profiles use only same-PDF bytes and the shared signal for identity OCR',async()=>{
 for(const [host,format]of profiles){
  const row=rowFor(host,format),frozen=structuredClone(row);let calls=0,fetchSignal;
  const result=await fetchOriginalPdf(row,async(url,options)=>{
   assert.equal(url,urlFor(host,format)+'/pdf');assert.equal(options.redirect,'error');fetchSignal=options.signal;return pdfResponse();
  },read,async(...args)=>{
   calls++;assert.equal(args.length,2);assert.deepEqual(args[0],bytes);
   assert.deepEqual(Object.keys(args[1]),['signal']);assert.equal(args[1].signal,fetchSignal);assert.ok(fetchSignal instanceof AbortSignal);
   return proof();
  });
  assert.equal(calls,1);assert.equal(result.pageCount,1);assert.equal(result.checksum,checksum);assert.deepEqual(result.bytes,bytes);
  assert.equal(result.text,embedded+'\nISSUER VAT '+identity.issuerVat);assert.deepEqual(row,frozen);
 }
});

test('embedded identity success bypasses OCR for both new and existing profiles',async()=>{
 const full=embedded+' ISSUER '+identity.issuerVat;
 for(const [host,format]of [...profiles,['epsilondigital.epsilonnet.gr','8']]){
  let calls=0;
  const result=await fetchOriginalPdf(rowFor(host,format),async()=>pdfResponse(),async()=>({text:full,pageCount:1}),async()=>{calls++;throw Error('OCR must be bypassed');});
  assert.equal(calls,0);assert.equal(result.text,full);assert.equal(result.checksum,checksum);
 }
});

test('missing or wrong MARK, recipient VAT or number cannot be repaired through header OCR',async()=>{
 const invalid=[
  embedded.replace(identity.mark,'400000000000043'),embedded.replace(identity.mark,''),
  embedded.replace(identity.counterpartVat,'077777777'),embedded.replace(identity.counterpartVat,''),
  embedded.replace('DOCUMENT 42','DOCUMENT 43'),embedded.replace('DOCUMENT 42','DOCUMENT'),
 ];
 for(const text of invalid){let calls=0;
  await assert.rejects(fetchOriginalPdf(rowFor(),async()=>pdfResponse(),async()=>({text,pageCount:1}),async()=>{calls++;return proof({text:Object.values(identity).join(' ')});}),/δεν επιβεβαιώνει/);
  assert.equal(calls,0,text);
 }
});

test('header recognition preserves existing invoice-number zero padding and exact VAT/MARK tokens',async()=>{
 const result=await fetchOriginalPdf(rowFor(undefined,undefined,{documentNumber:'00042'}),async()=>pdfResponse(),read,async()=>proof());
 assert.equal(result.checksum,checksum);
 for(const text of ['0099999999','09999999','099999998','O99999999','099 999 999','']){
  await assert.rejects(fetchOriginalPdf(rowFor(),async()=>pdfResponse(),read,async()=>proof({text})),/δεν επιβεβαιώνει/);
 }
 // The retained verifier requires exact token presence. This proves refusal
 // without the expected issuer, not detection of every other VAT in a PDF.
 await assert.rejects(fetchOriginalPdf(rowFor(),async()=>pdfResponse(),read,async()=>proof({text:'ISSUER VAT 077777777'})),/δεν επιβεβαιώνει/);
});

test('untrusted OCR provenance and low confidence cannot authorize identity',async()=>{
 const invalid=[
  null,{},proof({checksum:'b'.repeat(64)}),proof({checksum:checksum.toUpperCase()}),
  proof({pageCount:2}),proof({pageCount:'1'}),proof({region:'FULL_PAGE'}),proof({region:'FIRST_PAGE_TOP_50_PERCENT'}),
  proof({confidence:49.99}),proof({confidence:100.01}),proof({confidence:NaN}),proof({confidence:Infinity}),proof({confidence:'75'}),
  proof({text:null}),proof({text:[]}),proof({text:'   '}),proof({text:'x'.repeat(20001)}),
 ];
 for(const value of invalid){let calls=0;
  await assert.rejects(fetchOriginalPdf(rowFor(),async()=>pdfResponse(),read,async()=>{calls++;return value;}),/δεν επιβεβαιώνει/);
  assert.equal(calls,1);
 }
 const boundary=await fetchOriginalPdf(rowFor(),async()=>pdfResponse(),read,async()=>proof({confidence:50}));
 assert.equal(boundary.checksum,checksum);
});

test('multi-page or existing non-OCR provider identity failures do not enter OCR',async()=>{
 for(const pageCount of [0,2,20,21,null,'1']){let calls=0;
  await assert.rejects(fetchOriginalPdf(rowFor(),async()=>pdfResponse(),async()=>({text:embedded,pageCount}),async()=>{calls++;return proof();}),/δεν επιβεβαιώνει/);
  assert.equal(calls,0);
 }
 for(const [host,format]of [['epsilondigital.epsilonnet.gr','8'],['epsilondigital14.epsilonnet.gr','160']]){let calls=0;
  await assert.rejects(fetchOriginalPdf(rowFor(host,format),async()=>pdfResponse(),read,async()=>{calls++;return proof();}),/δεν επιβεβαιώνει/);
  assert.equal(calls,0);
 }
});

test('unknown profile, host, query and issuer refusal precede provider or OCR calls',async()=>{
 const urls=[urlFor('epsilondigital-3rdpartd.epsilonnet.gr','158'),urlFor(profiles[0][0],'22'),urlFor(profiles[1][0],'169'),urlFor(profiles[0][0]+'.invalid','169'),urlFor(profiles[0][0],'169')+'?next=1',urlFor(profiles[0][0],'169')+'#fragment',urlFor(profiles[0][0],'169').replace('https:','http:')];
 const rows=urls.map(url=>({...identity,rawPayload:{xml:`<downloadingInvoiceUrl>${url}</downloadingInvoiceUrl>`}}));
 rows.push(rowFor(undefined,undefined,{issuerVat:'invalid'}));
 for(const row of rows){let fetches=0,ocrs=0;
  await assert.rejects(fetchOriginalPdf(row,async()=>{fetches++;return pdfResponse();},read,async()=>{ocrs++;return proof();}));
  assert.equal(fetches,0);assert.equal(ocrs,0);
 }
});

test('content, magic, minimum-size and maximum-byte refusals happen before OCR',async()=>{
 const responses=[
  ()=>pdfResponse(bytes,{'content-type':'text/html'}),
  ()=>pdfResponse(Buffer.from('HTML'.repeat(50))),
  ()=>pdfResponse(Buffer.from('%PDF-short')),
  ()=>pdfResponse(bytes,{'content-type':'application/pdf','content-length':'3400001'}),
  ()=>pdfResponse(Buffer.concat([Buffer.from('%PDF-'),Buffer.alloc(3400000)])),
  ()=>new Response(null,{status:302,headers:{location:'https://example.invalid'}}),
 ];
 for(const response of responses){let readers=0,ocrs=0;
  await assert.rejects(fetchOriginalPdf(rowFor(),async()=>response(),async()=>{readers++;return read();},async()=>{ocrs++;return proof();}));
  assert.equal(readers,0);assert.equal(ocrs,0);
 }
});

test('OCR errors remain failures and timeout cancellation cannot return verified PDF',async t=>{
 await assert.rejects(fetchOriginalPdf(rowFor(),async()=>pdfResponse(),read,async()=>{throw Error('Synthetic local OCR failure');}),/Synthetic local OCR failure/);
 for(const stage of ['before','during']){
  const controller=new AbortController(),timeout=new DOMException('Synthetic timeout','TimeoutError');
  const mock=t.mock.method(AbortSignal,'timeout',()=>controller.signal);let calls=0;
  try{
   if(stage==='before')controller.abort(timeout);
   await assert.rejects(fetchOriginalPdf(rowFor(),async()=>pdfResponse(),read,async(_bytes,{signal})=>{calls++;assert.equal(signal,controller.signal);controller.abort(timeout);return proof();}),e=>e.status===504);
   assert.equal(calls,stage==='before'?0:1);
  }finally{mock.mock.restore();}
 }
});
