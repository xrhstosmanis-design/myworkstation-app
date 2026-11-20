import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readOriginalIdentityHeader} from '../src/lib/mydata-original-identity-ocr.js';

const require=createRequire(import.meta.url);
const PDFDocument=require('pdfkit');
function pdf({pages=1,size='A4',image=null}={}){
 const document=new PDFDocument({size,margin:20}),chunks=[];
 const done=new Promise((resolve,reject)=>{document.on('data',chunk=>chunks.push(chunk));document.on('end',()=>resolve(Buffer.concat(chunks)));document.on('error',reject);});
 if(image)document.image(image,25,35,{width:540,height:180});
 else document.font('Helvetica').fontSize(21).text('Supplier VAT 099999999\nRecipient VAT 088888888\nMARK 40000000993\nInvoice 93',25,35);
 for(let i=1;i<pages;i++)document.addPage();
 document.end();return done;
}

test('actual local PDF4/canvas/WASM header reader: bounded proof, refusals, abort/busy and cleanup',async t=>{
 // No provider, wallet, model service, SQL or application route is called.
 assert.equal(require('pdfjs-dist/package.json').version,'4.10.38');
 const bytes=await pdf(),before=Buffer.from(bytes);
 await t.test('real rendering and pinned local model recognize synthetic header with exact byte provenance',async()=>{
  const result=await readOriginalIdentityHeader(bytes);
  const tokens=result.text.match(/[0-9]+/g)||[];
  for(const expected of ['099999999','088888888','40000000993','93'])assert.ok(tokens.includes(expected));
  assert.equal(result.pageCount,1);assert.equal(result.region,'FIRST_PAGE_TOP_45_PERCENT');
  assert.equal(result.checksum,createHash('sha256').update(bytes).digest('hex'));
  assert.ok(result.confidence>=50);assert.ok(result.width*result.height<=6000000);
  assert.deepEqual(bytes,before);
 });
 await t.test('actual PDF geometry and multipage documents refuse without OCR expansion',async()=>{
  for(const bytes of [await pdf({pages:2}),await pdf({size:[1500,2000]})])await assert.rejects(readOriginalIdentityHeader(bytes),error=>error.code==='MYDATA_IDENTITY_OCR_FAILED');
  await assert.rejects(readOriginalIdentityHeader(Buffer.from('%PDF-'+ 'broken'.repeat(30))),error=>error.code==='MYDATA_IDENTITY_OCR_FAILED');
 });
 await t.test('a small compressed PDF cannot expand an oversized issuer image into OCR proof',async()=>{
  const {createCanvas}=require('@napi-rs/canvas'),canvas=createCanvas(6000,2000),context=canvas.getContext('2d');
  context.fillStyle='white';context.fillRect(0,0,6000,2000);context.fillStyle='black';context.font='150px sans-serif';context.fillText('Supplier VAT 099999999',100,250);
  const image=canvas.toBuffer('image/png');canvas.width=canvas.height=0;
  const bytes=await pdf({image});assert.ok(bytes.length<3400000);
  const result=await readOriginalIdentityHeader(bytes);
  assert.ok(!(result.text.match(/[0-9]+/g)||[]).includes('099999999'));
 });
 await t.test('invalid byte boundaries and already aborted signal cannot admit work',async()=>{
  for(const bytes of [Buffer.alloc(99),Buffer.alloc(3400001),new Uint8Array(120),null])await assert.rejects(readOriginalIdentityHeader(bytes),error=>error.code==='MYDATA_IDENTITY_OCR_INVALID_PDF');
  const controller=new AbortController(),reason=new Error('synthetic abort');controller.abort(reason);
  await assert.rejects(readOriginalIdentityHeader(bytes,{signal:controller.signal}),error=>error===reason);
 });
 await t.test('one global permit refuses overlap, cancellation terminates worker and releases permit',async()=>{
  const controller=new AbortController(),reason=new Error('synthetic cancellation');
  const active=readOriginalIdentityHeader(bytes,{signal:controller.signal});
  await assert.rejects(readOriginalIdentityHeader(bytes),error=>error.code==='MYDATA_IDENTITY_OCR_BUSY');
  controller.abort(reason);await assert.rejects(active,error=>error===reason);
  const next=await readOriginalIdentityHeader(bytes);assert.equal(next.pageCount,1);
 });
 await t.test('twenty-second worker deadline terminates work and frees the next permit',async context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  try{
   const active=readOriginalIdentityHeader(bytes);
   context.mock.timers.tick(20000);
   await assert.rejects(active,error=>error.code==='MYDATA_IDENTITY_OCR_TIMEOUT'&&error.status===504);
  }finally{context.mock.timers.reset();}
  assert.equal((await readOriginalIdentityHeader(bytes)).pageCount,1);
 });
});
