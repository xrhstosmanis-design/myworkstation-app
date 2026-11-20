import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import express from 'express';
import {z} from 'zod';
import {greeceRangeDate} from '../../shared/greece-time.mjs';
import {LOCAL_INVOICE_OCR_LIMITS} from '../../shared/local-invoice-ocr-limits.mjs';
import {enforceBackofficeStaff,requireStaffGrant,staffError} from '../src/services/backoffice-staff-access.js';
import {ownerRestrictedModuleKeys} from '../src/services/module-catalog.js';

const forbidden=()=>assert.fail('delegated view attempted DDL, a writer, provider/OCR, email or PDF creation');
const staff=()=>({id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0});
async function moduleRuntime(db){const source=await readFile(new URL('../src/middleware/module-access.js',import.meta.url),'utf8');return new Function('prisma','ownerRestrictedModuleKeys',source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nreturn {requireCompanyModule,requireStoreModule};')(db,ownerRestrictedModuleKeys);}
async function listen(db,path,router,guard){
 const app=express();app.use(express.json());app.use(async(req,res,next)=>{req.user=req.get('x-owner')?{id:'owner',companyId:'company',role:'OWNER'}:staff();try{await enforceBackofficeStaff(db,req,res);next()}catch(error){next(error)}});app.use(path,...(guard?[guard]:[]),router);app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message,code:error.code}));
 const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle))});
 return {async request(suffix,{header='store',method='GET',owner=false}={}){const response=await fetch(`http://127.0.0.1:${server.address().port}${path}${suffix}`,{method,headers:{'x-backoffice-store-id':header,...(owner?{'x-owner':'true'}:{})}});return {status:response.status,body:await response.json()}},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}};
}

test('native transfer read views enforce exact source/destination scope and independent grants without financial actions',async()=>{
 let capabilities=['stock-transfers.read'],moduleActive=true,withdraw=false,moduleWithdraw=false,reads=0;
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'STORE_MODE',active:moduleActive}]})},
  $transaction:forbidden,$executeRaw:forbidden,$executeRawUnsafe:forbidden,
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];if(sql.includes('FROM "StorePaidModule"'))return [];
   reads++;assert.ok(values.includes('company'));assert.ok(values.includes('store'));assert.equal(values.includes('foreign'),false);if(withdraw)capabilities=[];if(moduleWithdraw)moduleActive=false;
   if(sql.includes('amounts.payable')){assert.match(sql,/origin\."companyId"\s*=\s*t\."companyId"/);assert.match(sql,/destination\."companyId"\s*=\s*t\."companyId"/);assert.match(sql,/t\."sourceStoreId"\s*=\s*\? OR t\."destinationStoreId"\s*=\s*\?/);return [{id:'transfer',sourceName:'Synthetic source',destinationName:'Synthetic destination',payable:'12.34',canPayCash:true}];}
   if(sql.includes('PosInternalTransferSettlement')){assert.match(sql,/t\."sourceStoreId"\s*=\s*\?/);assert.match(sql,/destination\."companyId"\s*=\s*t\."companyId"/);return [{id:'receipt',destinationName:'Synthetic destination',amount:'3.20'}];}
   assert.match(sql,/"companyId"\s*=\s*\? AND "sourceStoreId"\s*=\s*\?/);return [{id:'external',destinationName:'Synthetic external',createdAt:'2026-11-18T10:00:00Z'}];
  }
 };
 const source=await readFile(new URL('../src/routes/store-pos-internal-transfer.js',import.meta.url),'utf8');
 const router=new Function('randomUUID','Router','z','prisma','recordCashTransfer','sendEmail','internalTransferPdf','storeTransactions','requireStaffGrant','staffError',source.replace(/^import .*;\s*$/gm,'').replace('export default router;','return router;'))(crypto.randomUUID,express.Router,z,db,forbidden,forbidden,forbidden,{handle:forbidden},requireStaffGrant,staffError);
 const modules=await moduleRuntime(db),app=await listen(db,'/api/store-pos',router,modules.requireCompanyModule('STORE_MODE'));
 try{
  for(const kind of ['credit','pending-cash-receipts','external-history']){
   capabilities=['stock-transfers.read'];moduleActive=true;const path='/stores/store/internal-transfers/'+kind,result=await app.request(path);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.companyId,'company');assert.equal(result.body.storeId,'store');assert.equal(result.body.items.length,1);
   if(kind==='credit')assert.equal(result.body.items[0].payable,'12.34');else if(kind==='pending-cash-receipts')assert.equal(result.body.items[0].amount,'3.20');
   const before=reads;for(const input of [{path:path.replace('/store/','/foreign/'),header:'foreign'},{path:path.replace('/store/','/foreign/')},{path,header:''},{path,method:'POST'},{path:'/stores/store/internal-transfers/destinations'},{path:'/stores/store/internal-transfers/quote',method:'POST'},{path:'/stores/store/internal-transfers/transfer/cash-receipt',method:'POST'},{path:'/stores/store/internal-transfers/transfer/email',method:'POST'},{path:'/stores/store/internal-transfers/transfer/pdf'}]){const {path:target,...options}=input;assert.equal((await app.request(target,options)).status,403,JSON.stringify(input))}assert.equal(reads,before);
   capabilities=['stock.read','products.read'];assert.equal((await app.request(path)).status,403);capabilities=['stock-transfers.read'];moduleActive=false;assert.equal((await app.request(path)).status,403);moduleActive=true;
   moduleWithdraw=true;const disabled=await app.request(path);assert.equal(disabled.status,403);assert.equal(Object.hasOwn(disabled.body,'items'),false);moduleWithdraw=false;moduleActive=true;
   withdraw=true;const revoked=await app.request(path);assert.equal(revoked.status,403);assert.equal(Object.hasOwn(revoked.body,'items'),false);withdraw=false;
  }
  const owner=await app.request('/stores/store/internal-transfers/credit',{owner:true});assert.equal(owner.status,200);assert.equal(Array.isArray(owner.body),true);assert.equal(owner.body[0].payable,'12.34');
 }finally{await app.close()}
});

test('native invoice AI job read never starts OCR or grants document actions and binds both joins to the selected store',async()=>{
 let capabilities=['invoice-ai.read'],moduleActive=true,withdraw=false,moduleWithdraw=false,reads=0;
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'AI_READER',active:moduleActive}]})},store:{findFirst:async({where})=>where.id==='store'&&where.companyId==='company'?{id:'store',name:'Synthetic store'}:null},
  $transaction:forbidden,$executeRaw:forbidden,$executeRawUnsafe:forbidden,
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];if(sql.includes('FROM "StorePaidModule"'))return [];
   reads++;assert.ok(sql.includes('FROM "AiReaderJob" j'));assert.ok(values.includes('company'));assert.ok(values.includes('store'));assert.equal(values.includes('foreign'),false);assert.match(sql,/a\."companyId"=j\."companyId"/);assert.match(sql,/a\."storeId"=j\."storeId"/);assert.match(sql,/d\."companyId"=j\."companyId"/);assert.match(sql,/d\."storeId"=j\."storeId"/);
   if(withdraw)capabilities=[];if(moduleWithdraw)moduleActive=false;
   return [{id:'job',stage:'LOCAL',status:'LOCAL_COMPLETE',localConfidence:96,result:{rawText:'PRIVATE-RAW-TEXT',provider:{apiKey:'PRIVATE-PROVIDER-KEY'},productLines:[{description:'Synthetic item',quantity:2,unitCost:6.17,providerToken:'PRIVATE-LINE-KEY'}],posReadingEvidence:{original:{stage:'LOCAL',lineCount:1,rawPayload:'PRIVATE-RAW-EVIDENCE',lines:[{description:'Synthetic item',quantity:2,unitCost:6.17}]}}},filename:'synthetic.pdf',mimeType:'application/pdf',standaloneDraft:true,documentNumber:'A 001',totalGross:'12.34'}];
  }
 };
 const modules=await moduleRuntime(db),source=await readFile(new URL('../src/routes/commerce-v1.js',import.meta.url),'utf8');
 const router=new Function('LOCAL_INVOICE_OCR_LIMITS','greeceRangeDate','requireStaffGrant','staffError','crypto','Router','z','prisma','requireCompanyModule','requireStoreModule','readSupplierComparison','mobileUploads','orderSuggestionsRouter','lowValueProductsRouter',source.replace(/^import .*;\s*$/gm,'').replace('export default router;','return router;'))(LOCAL_INVOICE_OCR_LIMITS,greeceRangeDate,requireStaffGrant,staffError,crypto,express.Router,z,db,modules.requireCompanyModule,modules.requireStoreModule,forbidden,new Map(),express.Router(),express.Router());
 const app=await listen(db,'/api/commerce',router);
 try{
  const path='/ai-reader/jobs?storeId=store',result=await app.request(path);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.companyId,'company');assert.equal(result.body.storeId,'store');assert.equal(result.body.items[0].result.productLines[0].description,'Synthetic item');assert.equal(result.body.items[0].result.posReadingEvidence.original.lineCount,1);assert.equal(JSON.stringify(result.body).includes('PRIVATE-'),false);assert.equal(result.body.items[0].canApproveStandaloneDraft,false);
  const before=reads;for(const input of [{path:'/ai-reader/jobs'},{path:'/ai-reader/jobs?storeId='},{path:'/ai-reader/jobs?storeId=foreign',header:'foreign'},{path:'/ai-reader/jobs?storeId=foreign'},{path,header:''},{path,method:'POST'},{path:'/ai-reader/jobs/job/ai-recheck',method:'POST'},{path:'/ai-reader/jobs/job/confirm',method:'POST'},{path:'/ai-reader/status'},{path:'/documents/attachment'}]){const {path:target,...options}=input;assert.equal((await app.request(target,options)).status,403,JSON.stringify(input))}assert.equal(reads,before);
  capabilities=['invoices.read'];assert.equal((await app.request(path)).status,403);capabilities=['invoice-ai.read'];moduleActive=false;assert.equal((await app.request(path)).status,403);moduleActive=true;
  moduleWithdraw=true;const disabled=await app.request(path);assert.equal(disabled.status,403);assert.equal(Object.hasOwn(disabled.body,'items'),false);moduleWithdraw=false;moduleActive=true;
  withdraw=true;const revoked=await app.request(path);assert.equal(revoked.status,403);assert.equal(Object.hasOwn(revoked.body,'items'),false);withdraw=false;
  const owner=await app.request(path,{owner:true});assert.equal(owner.status,200);assert.equal(Array.isArray(owner.body),true);assert.equal(owner.body[0].canApproveStandaloneDraft,true);
 }finally{await app.close()}
});

test('actual early transfer bridge bypasses POS bootstrap only for the three exact authorized native reads',async()=>{
 let capabilities=['stock-transfers.read'],nativeReads=0,legacyReads=0;
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'STORE_MODE',active:true}]})},
  $queryRaw:async(strings,...values)=>{const sql=strings.join('?');if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];if(sql.includes('FROM "StorePaidModule"'))return [];assert.fail('unexpected composition data query')},$executeRaw:forbidden,$executeRawUnsafe:forbidden};
 const modules=await moduleRuntime(db),source=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
 const comment=source.indexOf('// Read-only transfer history uses the same native reader'),start=source.indexOf('app.use("/api/store-pos",(req,res,next)=>{',comment),end=source.indexOf('\n});',start)+5;
 assert.ok(comment>=0&&start>comment&&end>start);assert.ok(start<source.indexOf('app.use("/api/store-pos",auth,requireCompanyModule("STORE_MODE"),storePosCatalogRoutes)'));assert.ok(start<source.indexOf('app.use("/api/store-pos",auth,requireCompanyModule("STORE_MODE"),posSaleActionsRoutes)'));
 const app=express(),auth=async(req,res,next)=>{req.user=req.get('x-owner')?{id:'owner',companyId:'company',role:'OWNER'}:staff();try{await enforceBackofficeStaff(db,req,res);next()}catch(error){next(error)}};
 const native=(req,res)=>{nativeReads++;assert.equal(req.staffGrant.capability,'stock-transfers.read');res.json({native:true,path:req.path,storeId:req.user.storeId})};
 new Function('app','auth','requireCompanyModule','storePosInternalTransferRoutes',source.slice(start,end))(app,auth,modules.requireCompanyModule,native);
 app.use('/api/store-pos',auth,(_req,res)=>{legacyReads++;res.json({legacy:true})});app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle))});
 const request=async(suffix,{method='GET',owner=false,header='store'}={})=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/store-pos${suffix}`,{method,headers:{'x-backoffice-store-id':header,...(owner?{'x-owner':'true'}:{})}});return {status:response.status,body:await response.json()}};
 try{
  for(const kind of ['credit','pending-cash-receipts','external-history']){const result=await request('/stores/store/internal-transfers/'+kind);assert.equal(result.status,200);assert.equal(result.body.native,true);assert.equal(result.body.storeId,'store')}
  assert.equal(nativeReads,3);assert.equal(legacyReads,0);
  for(const [suffix,options] of [['/stores/store/internal-transfers/credit',{method:'POST'}],['/stores/store/internal-transfers/destinations',{}],['/stores/store/internal-transfers/quote',{method:'POST'}],['/stores/store/internal-transfers/id/email',{method:'POST'}],['/stores/foreign/internal-transfers/credit',{header:'foreign'}],['/stores/store/internal-transfers/credit',{header:''}]])assert.equal((await request(suffix,options)).status,403);
  assert.equal(nativeReads,3);assert.equal(legacyReads,0);capabilities=['baking.read'];assert.equal((await request('/stores/store/internal-transfers/credit')).status,403);assert.equal(nativeReads,3);
  const owner=await request('/stores/store/internal-transfers/credit',{owner:true});assert.equal(owner.status,200);assert.equal(owner.body.legacy,true);assert.equal(legacyReads,1);assert.equal(nativeReads,3);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
