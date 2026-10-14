import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductBarcodeReader,decodeProductBarcodeCanvases,readBarcodePhoto} from '../../client/src/lib/product-barcode-photo.js';
// Independent EAN13 symbol fixture: standard digit/parity patterns, not a mocked decoder.
const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const parity=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
export function eanFrame(code){
 const bits='0'.repeat(16)+'101'+[...code.slice(1,7)].map((d,i)=>(parity[Number(code[0])][i]==='L'?L:G)[Number(d)]).join('')+'01010'+[...code.slice(7)].map(d=>L[Number(d)].replace(/[01]/g,x=>x==='0'?'1':'0')).join('')+'101'+'0'.repeat(16);
 const width=bits.length*4,height=120,data=new Uint8ClampedArray(width*height*4).fill(255);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(bits[Math.floor(x/4)]==='1'){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;}
 return {width,height,data,getContext(){return {getImageData:()=>({data})}}};
}
test('real 1D pixel decoder reads EAN13 and preserves leading zeros; bad checksum/blank not inferred',async()=>{
 for(const code of ['5201222667919','5201399030219','0123456789012'])assert.equal(createProductBarcodeReader().decodeFromCanvas(eanFrame(code)).getText(),code);
 assert.throws(()=>createProductBarcodeReader().decodeFromCanvas(eanFrame('5201222667910')));
 assert.deepEqual(await decodeProductBarcodeCanvases([eanFrame('5201222667919'),eanFrame('5201399030219'),eanFrame('5201222667919')]),['5201222667919','5201399030219']);
});
test('native failure falls back to real ZXing; invalid QR/text discarded and cancellation/file guards work',async()=>{
 assert.deepEqual(await decodeProductBarcodeCanvases([eanFrame('0123456789012')],{detector:{detect:async()=>{throw Error('unsupported')}}}),['0123456789012']);
 const blank=eanFrame('5201222667919');blank.data.fill(255);
 assert.deepEqual(await decodeProductBarcodeCanvases([blank],{detector:{detect:async()=>[{rawValue:'https://example.invalid'},{rawValue:'123'},{rawValue:'0012345678905'}]}}),['0012345678905']);
 const controller=new AbortController();controller.abort();await assert.rejects(decodeProductBarcodeCanvases([blank],{signal:controller.signal}),{name:'AbortError'});
 await assert.rejects(readBarcodePhoto({type:'application/pdf',size:10}),/JPG/);await assert.rejects(readBarcodePhoto({type:'image/png',size:21000000}),/20 MB/);
});
