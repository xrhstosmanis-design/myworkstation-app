import test from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import {createInvoiceQrReader,focusInvoiceQrCamera} from "../../client/src/lib/invoice-qr-reader.js";

class PixelCanvas{
  constructor(width=0,height=0){this.width=width;this.height=height;this.data=new Uint8ClampedArray(width*height*4).fill(255);this.reads=[];}
  getContext(){return {
    drawImage:(source,x,y,width,height)=>{
      assert.equal(width,this.width);assert.equal(height,this.height);
      this.data=new Uint8ClampedArray(width*height*4);
      for(let row=0;row<height;row++)this.data.set(source.data.subarray(((y+row)*source.width+x)*4,((y+row)*source.width+x+width)*4),row*width*4);
    },
    getImageData:()=>{this.reads.push(this.width*this.height);return {data:this.data}},
  };}
}
const value="https://einvoice.s1ecos.gr/p/EL123456789/"+"A".repeat(40)+"/"+"B".repeat(32);
function fixture({left=750,top=330,rotate=false}={}){
  const frame=new PixelCanvas(1920,1080),qr=QRCode.create(value,{errorCorrectionLevel:"M"}),scale=7,size=qr.modules.size;
  for(let row=0;row<size;row++)for(let col=0;col<size;col++)if(qr.modules.get(row,col)){
    const x=rotate?size-1-row:col,y=rotate?col:row;
    for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
      const i=((top+y*scale+dy)*frame.width+left+x*scale+dx)*4;frame.data[i]=frame.data[i+1]=frame.data[i+2]=0;
    }
  }
  return frame;
}
test("real QR decoder reads dense centred/rotated QR using fewer full-resolution pixels",()=>{
  for(const rotate of [false,true]){
    const crop=new PixelCanvas(),reader=createInvoiceQrReader({createCanvas:()=>crop}),frame=fixture({rotate});
    assert.equal(reader.decodeFromCanvas(frame).getText(),value);
    assert.equal(frame.reads.length,0,"full-frame decoding avoided for centred QR");
    assert.equal(crop.reads[0],810*810);
    assert.ok(crop.reads[0]<frame.width*frame.height/3);
  }
});
test("off-centre QR remains readable on periodic full-frame fallback",()=>{
  const reader=createInvoiceQrReader({createCanvas:()=>new PixelCanvas()}),frame=fixture({left:90,top:90});
  for(let i=0;i<3;i++)assert.throws(()=>reader.decodeFromCanvas(frame));
  assert.equal(reader.decodeFromCanvas(frame).getText(),value);
  assert.deepEqual(frame.reads,[1920*1080]);
});
test("autofocus is optional and unsupported/rejected cameras remain usable",async()=>{
  const applied=[];
  await focusInvoiceQrCamera({srcObject:{getVideoTracks:()=>[{getCapabilities:()=>({focusMode:["continuous"]}),applyConstraints:async x=>applied.push(x)}]}});
  assert.deepEqual(applied,[{advanced:[{focusMode:"continuous"}]}]);
  await focusInvoiceQrCamera({srcObject:{getVideoTracks:()=>[{getCapabilities:()=>({}),applyConstraints:()=>assert.fail("unsupported autofocus")}]}});
  await focusInvoiceQrCamera({srcObject:{getVideoTracks:()=>[{getCapabilities:()=>({focusMode:["continuous"]}),applyConstraints:async()=>{throw Error("unsupported")}}]}});
  await focusInvoiceQrCamera(null);
});
