import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {PNG} from 'pngjs';
import zxing from '@zxing/library';
import {onlineStoreQR,publicOnlineStoreUrl} from '../../client/src/utils/online-store-qr.js';
import {renderOnlineStoreQRPrint} from '../../client/src/utils/online-store-qr-print.js';

test('customer QR decodes to saved public store URL without credentials or page query',async()=>{
 const qr=await onlineStoreQR('https://myworkstation.gr/platform-admin?token=private','daily-bite');
 const png=PNG.sync.read(Buffer.from(qr.image.split(',')[1],'base64'));
 const gray=new Uint8ClampedArray(png.width*png.height);
 for(let i=0;i<gray.length;i++)gray[i]=(png.data[i*4]+png.data[i*4+1]+png.data[i*4+2])/3;
 const bitmap=new zxing.BinaryBitmap(new zxing.HybridBinarizer(new zxing.RGBLuminanceSource(gray,png.width,png.height)));
 assert.equal(new zxing.QRCodeReader().decode(bitmap).getText(),'https://myworkstation.gr/online/daily-bite');
 assert.equal(qr.url,'https://myworkstation.gr/online/daily-bite');
 for(const slug of ['', '../kat','daily?token=1','<script>','DAILY'])assert.equal(publicOnlineStoreUrl('https://myworkstation.gr',slug),'');
 assert.equal(publicOnlineStoreUrl('javascript:alert(1)','daily-bite'),'');
});

test('A4 cards and A5 sign repeat the identical QR and safely render brand text',()=>{
 for(const [format,count,page] of [['cards',4,'A4'],['sign',1,'A5']]){
  const {window}=new JSDOM('<!doctype html><html><head></head><body></body></html>');
  const images=renderOnlineStoreQRPrint(window.document,{format,storeName:'DAILY <script>alert(1)</script>',url:'https://myworkstation.gr/online/daily-bite',image:'data:image/png;base64,fictional'});
  assert.equal(images.length,count);
  assert.equal(window.document.querySelectorAll('script').length,0);
  assert.equal(window.document.querySelectorAll('.qr-print').length,count);
  assert.match(window.document.querySelector('style').textContent,new RegExp(`size:${page}`));
  for(const card of window.document.querySelectorAll('.qr-print')){
   assert.equal(card.querySelector('h1').textContent,'DAILY <script>alert(1)</script>');
   assert.equal(card.querySelector('img').getAttribute('src'),'data:image/png;base64,fictional');
   assert.equal(card.querySelector('small').textContent,'https://myworkstation.gr/online/daily-bite');
   assert.match(card.textContent,/όροφο, κλινική και δωμάτιο/);
  }
  window.close();
 }
});
