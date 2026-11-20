import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {dirname,join,sep} from 'node:path';
import {createHash} from 'node:crypto';

const require=createRequire(import.meta.url);
const modelHash='45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91';
let task,recognizer;
const fail=code=>{throw Object.assign(new Error(code),{code});};

// All assets resolve from pinned installed packages. Never use Tesseract's
// default CDN language path or PDF.js browser font/CMap fetching.
try{
 const bytes=workerData?.bytes;
 if(!(bytes instanceof Uint8Array)||bytes.length<100||bytes.length>3400000||Buffer.from(bytes.subarray(0,5)).toString()!=='%PDF-')fail('MYDATA_IDENTITY_OCR_INVALID_PDF');
 if(require('pdfjs-dist/package.json').version!=='4.10.38'||require('tesseract.js/package.json').version!=='6.0.1'||require('tesseract.js-core/package.json').version!=='6.1.2'||require('@tesseract.js-data/eng/package.json').version!=='1.0.0')fail('MYDATA_IDENTITY_OCR_MODEL_MISMATCH');
 const pdfRoot=dirname(require.resolve('pdfjs-dist/package.json'));
 const langPath=join(dirname(require.resolve('@tesseract.js-data/eng/package.json')),'4.0.0_best_int');
 const model=await readFile(join(langPath,'eng.traineddata.gz'));
 if(createHash('sha256').update(model).digest('hex')!==modelHash)fail('MYDATA_IDENTITY_OCR_MODEL_MISMATCH');
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const {createCanvas}=require('@napi-rs/canvas');
 // Decoded source images have a separate ten-megapixel ceiling; the actual
 // OCR canvas remains capped at six megapixels below. Never expand an image
 // without a bound merely because its compressed PDF is small.
 task=getDocument({data:new Uint8Array(bytes),verbosity:0,maxImageSize:10000000,isOffscreenCanvasSupported:false,isEvalSupported:false,stopAtErrors:true,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,disableAutoFetch:true,standardFontDataUrl:join(pdfRoot,'standard_fonts')+sep,cMapUrl:join(pdfRoot,'cmaps')+sep,cMapPacked:true});
 const pdf=await task.promise;
 if(pdf.numPages!==1)fail('MYDATA_IDENTITY_OCR_SINGLE_PAGE_REQUIRED');
 const page=await pdf.getPage(1),viewport=page.getViewport({scale:300/72});
 const width=Math.ceil(viewport.width),height=Math.ceil(viewport.height*.45);
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||Math.max(width,Math.ceil(viewport.height))>5000||width*height>6000000)fail('MYDATA_IDENTITY_OCR_PIXEL_LIMIT');
 const canvas=createCanvas(width,height);
 await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'}).promise;
 const image=canvas.toBuffer('image/png');
 const {createWorker}=require('tesseract.js');
 recognizer=await createWorker('eng',1,{langPath,gzip:true,cacheMethod:'none',logger:()=>{},errorHandler:()=>{}});
 await recognizer.setParameters({tessedit_pageseg_mode:'6'});
 const {data}=await recognizer.recognize(image);
 const text=String(data?.text||''),confidence=Number(data?.confidence);
 if(text.length>20000||!Number.isFinite(confidence))fail('MYDATA_IDENTITY_OCR_INVALID_RESULT');
 canvas.width=canvas.height=0;page.cleanup();
 await recognizer.terminate();recognizer=null;
 await task.destroy();task=null;
 parentPort.postMessage({ok:true,value:{text,confidence,pageCount:1,checksum:createHash('sha256').update(bytes).digest('hex'),region:'FIRST_PAGE_TOP_45_PERCENT',width,height,backend:'LOCAL_TESSERACT_6_ENG_HEADER_V1'}});
}catch(error){
 await recognizer?.terminate().catch(()=>{});
 await task?.destroy().catch(()=>{});
 parentPort.postMessage({ok:false,code:error?.code==='MYDATA_IDENTITY_OCR_MODEL_MISMATCH'?error.code:'MYDATA_IDENTITY_OCR_FAILED'});
}
