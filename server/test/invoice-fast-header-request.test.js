import test from 'node:test';
import assert from 'node:assert/strict';
import {fastInvoiceHeaderRequest} from '../../client/src/lib/invoice-fast-header-request.js';

test('store PDF payload opts in without altering original file bytes or source metadata',()=>{
  const sourcePage={file:{type:'application/pdf',name:'original.pdf'},dataUrl:'data:application/pdf;base64,c3ludGhldGlj',originalDataUrl:'must-not-replace-source',pageCount:99};
  const before=structuredClone(sourcePage);
  assert.deepEqual(fastInvoiceHeaderRequest({storeId:'selected-store',sourcePage}),{storeId:'selected-store',filename:'original.pdf',mimeType:'application/pdf',dataUrl:sourcePage.dataUrl,pdfHeaderPriority:true});
  assert.deepEqual(sourcePage,before);
});

for(const type of ['image/jpeg','image/png','image/webp','',undefined])test(`image/unknown MIME ${String(type)} retains the legacy payload`,()=>{
  const sourcePage={file:{type,name:''},dataUrl:'original-data'};
  assert.deepEqual(fastInvoiceHeaderRequest({storeId:'store-a',sourcePage}),{storeId:'store-a',filename:'timologio.jpg',mimeType:type||'image/jpeg',dataUrl:'original-data'});
});

test('request body is fresh per store/source and cannot inherit an old PDF priority flag',()=>{
  const first=fastInvoiceHeaderRequest({storeId:'a',sourcePage:{file:{type:'application/pdf',name:'a.pdf'},dataUrl:'PDF-A'}});
  const second=fastInvoiceHeaderRequest({storeId:'b',sourcePage:{file:{type:'image/jpeg',name:'b.jpg'},dataUrl:'IMAGE-B'}});
  first.dataUrl='changed';
  assert.deepEqual(second,{storeId:'b',filename:'b.jpg',mimeType:'image/jpeg',dataUrl:'IMAGE-B'});
});

