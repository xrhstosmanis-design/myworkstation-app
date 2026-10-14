import {BrowserMultiFormatReader} from '@zxing/browser';
import {BarcodeFormat,DecodeHintType} from '@zxing/library';

const formats=['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','codabar'];
export function createProductBarcodeReader(){
 return new BrowserMultiFormatReader(new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.EAN_13,BarcodeFormat.EAN_8,BarcodeFormat.UPC_E,BarcodeFormat.CODE_128,BarcodeFormat.CODE_39,BarcodeFormat.ITF,BarcodeFormat.CODABAR]],[DecodeHintType.TRY_HARDER,true]]));
}
const valid=value=>/^\d{6,18}$/.test(String(value||''));
const check=signal=>{if(signal?.aborted)throw new DOMException('Ακυρώθηκε','AbortError')};
export async function decodeProductBarcodeCanvases(canvases,{signal,detector=null,reader=createProductBarcodeReader()}={}){
 const found=new Set();
 for(const frame of canvases){
  check(signal);
  if(detector)try{for(const item of await detector.detect(frame)){const value=item.format==='upc_a'&&/^\d{12}$/.test(item.rawValue)?'0'+item.rawValue:item.rawValue;if(valid(value))found.add(value)}}catch{/* ZXing handles unsupported native detection. */}
  check(signal);
  try{const value=reader.decodeFromCanvas(frame).getText();if(valid(value))found.add(value)}catch{/* Try the next view; never invent a number. */}
  check(signal);await new Promise(resolve=>setTimeout(resolve,0));
 }
 return [...found];
}
export async function readBarcodePhoto(file,{signal}={}){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Επίλεξε φωτογραφία JPG, PNG ή WebP.');
 if(file.size>20*1024*1024)throw Error('Η φωτογραφία πρέπει να είναι έως 20 MB.');
 check(signal);const url=URL.createObjectURL(file);
 try{
  const image=await new Promise((resolve,reject)=>{
   const img=new Image(),abort=()=>{img.src='';cleanup();reject(new DOMException('Ακυρώθηκε','AbortError'))},cleanup=()=>signal?.removeEventListener('abort',abort);
   img.onload=()=>{cleanup();resolve(img)};img.onerror=()=>{cleanup();reject(Error('Η φωτογραφία δεν ανοίγει. Δοκίμασε άλλο JPG ή PNG.'))};signal?.addEventListener('abort',abort,{once:true});img.src=url;
  });
  check(signal);if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw Error('Η φωτογραφία είναι πολύ μεγάλη. Διάλεξε κοντινή λήψη του barcode.');
  const scale=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight)),w=Math.max(1,Math.round(image.naturalWidth*scale)),h=Math.max(1,Math.round(image.naturalHeight*scale));
  const frames=[];
  // Four orientations plus overlapping half-images expose separate labels.
  for(const angle of [0,90,180,270]){
   const canvas=document.createElement('canvas');canvas.width=angle%180?h:w;canvas.height=angle%180?w:h;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Ο browser δεν υποστηρίζει ανάγνωση φωτογραφίας.');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(angle*Math.PI/180);ctx.drawImage(image,-w/2,-h/2,w,h);frames.push(canvas);
  }
  for(const [x,y,cw,ch] of [[0,0,w*.6,h],[w*.4,0,w*.6,h],[0,0,w,h*.6],[0,h*.4,w,h*.6]]){
   const c=document.createElement('canvas');c.width=Math.ceil(cw);c.height=Math.ceil(ch);c.getContext('2d',{willReadFrequently:true}).drawImage(frames[0],x,y,cw,ch,0,0,c.width,c.height);frames.push(c);
  }
  let detector=null;
  if(typeof globalThis.BarcodeDetector==='function')try{const supported=await globalThis.BarcodeDetector.getSupportedFormats();const selected=formats.filter(x=>supported.includes(x));if(selected.length)detector=new globalThis.BarcodeDetector({formats:selected})}catch{/* Native API is optional on desktop and mobile. */}
  return await decodeProductBarcodeCanvases(frames,{signal,detector});
 }finally{URL.revokeObjectURL(url)}
}
