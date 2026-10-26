import test from "node:test";
import assert from "node:assert/strict";
import {prepareDocumentImage,measureDocumentSharpness} from "../../client/src/lib/document-image-quality.js";

test("portrait and landscape documents keep all source edges; every decoded image is closed",async()=>{
  const saved=new Map(["document","createImageBitmap"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));let dimensions=[1000,700],closed=0,output,blank=false;
  const image={get width(){return dimensions[0]},get height(){return dimensions[1]},close:()=>closed++};
  Object.defineProperty(globalThis,"createImageBitmap",{configurable:true,value:async()=>image});
  Object.defineProperty(globalThis,"document",{configurable:true,value:{createElement:()=>{
    const canvas={width:0,height:0,toBlob(callback){output=canvas;callback(new Blob([new Uint8Array([255,216,255,217])],{type:"image/jpeg"}))}};
    canvas.getContext=()=>({drawImage(){},fillRect(){},translate(){},rotate(){},getImageData(_x,_y,w,h){const data=new Uint8ClampedArray(w*h*4);let seed=123;for(let i=0;i<data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;data[i]=data[i+1]=data[i+2]=blank?220:seed%256;data[i+3]=255}return{data}},putImageData(){}});return canvas;
  }}});
  try{
    const file=new File(["original"],"original.jpg",{type:"image/jpeg"});
    for(const pair of [[1000,700],[700,1100]]){
      dimensions=pair;const result=await prepareDocumentImage(file,{strict:false,enhance:false});
      assert.equal(result.originalFile,file);assert.equal(result.quality.cropped,false);assert.ok(output.width>=pair[0]);assert.ok(output.height>=pair[1]);
    }
    assert.equal(closed,2);dimensions=[500,400];await assert.rejects(prepareDocumentImage(file),{code:"LOW_RESOLUTION"});assert.equal(closed,3);
    dimensions=[1000,700];blank=true;await assert.rejects(prepareDocumentImage(file),{code:"BLURRY"});assert.equal(closed,4);
    assert.equal(measureDocumentSharpness({gray:new Uint8Array(100),width:10,height:10}),0);
  }finally{for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
});
