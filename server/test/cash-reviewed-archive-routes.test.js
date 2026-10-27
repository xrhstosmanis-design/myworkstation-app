import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import XLSX from 'xlsx';
import {createCashReconciliationRouter} from '../src/routes/cash-reconciliation.js';
import {reconciliationText} from '../src/services/cash-reconciliation-report.js';
import {cashArchiveSourceHash} from '../src/services/cash-reviewed-archive.js';
import {hash} from '../src/services/cash-reconciliation-contract.js';

test('actual archive GET checks selected store, current evidence-module admission and bound receipt; returns a real workbook without writers or diagnostics',async()=>{
 const period={from:'2026-10-21',to:'2026-10-21'},r={storeId:'store',storeName:'Δοκιμή',generation:'0',period,head:hash('head'),reportHash:hash('source'),rows:[],employees:[],totals:{shortageCents:0,surplusCents:0,pending:0},checkpoint:null,coverage:'BOUNDED_CLOSED_SHIFTS',financialFinality:'REVIEWED_CASH_ROWS_ONLY',originalFinancialLedgerChanged:false};r.text=reconciliationText(r);
 const f={modules:new Set(['CASH_CONTROL','STORE_CHAT','AI_READER']),reads:0,auth:0,denied:false,move:false};
 const authorize=async(_db,user,id)=>{f.auth++;if(!user||f.denied||id!=='store'||['CASH_CONTROL','STORE_CHAT','AI_READER'].some(m=>!f.modules.has(m)))throw Object.assign(Error('PRIVATE_ACCOUNT_TOKEN'),{status:403,code:'CASH_PAPER_ACCESS_DENIED'});return {scope:{companyId:'co',storeId:'store'}};};
 const repository={generation:async()=> '0',read:async()=>{f.reads++;const out=structuredClone(r);if(f.move&&f.reads%2===0)out.head=hash('newer');return out;},apply:()=>assert.fail('No review writer')};
 const db={$executeRaw:()=>assert.fail('No financial writer')};const app=express();app.use((req,res,next)=>{if(req.headers.authorization!=='Bearer synthetic')return res.status(401).json({error:'authentication required'});req.user={id:'actor'};next();});app.use(createCashReconciliationRouter({db,authorize,repository}));
 const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/stores/`,q={...period,generation:'0',head:r.head,reportHash:r.reportHash,previewHash:cashArchiveSourceHash(r)};
 const get=(change={},id='store',authenticated=true)=>fetch(base+id+'/archive?'+new URLSearchParams({...q,...change}),{headers:authenticated?{Authorization:'Bearer synthetic'}:{}});
 try{
  const response=await get();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');const out=await response.json();assert.equal(out.storeId,'store');assert.equal(out.generation,'0');assert.equal(out.head,r.head);assert.equal(out.reportHash,r.reportHash);assert.equal(out.filename,'cash-reviewed-2026-10-21-2026-10-21.xlsx');assert(XLSX.read(Buffer.from(out.base64,'base64'),{type:'buffer'}).Sheets['Εκκρεμότητες']);assert.equal(f.reads,2);
  assert.equal((await get({},'store',false)).status,401);assert.equal((await get({},'foreign')).status,403);
  const before=f.reads;for(const module of [...f.modules]){f.modules.delete(module);const denied=await get();assert.equal(denied.status,403);assert(!(await denied.text()).includes('PRIVATE'));f.modules.add(module);}assert.equal(f.reads,before);
  for(const change of [{from:'2026-02-30'},{to:'2026-12-31'},{storeId:'foreign'},{reportHash:'bad'}])assert.equal((await get(change)).status,400);
  assert.equal((await get({generation:'1'})).status,409);assert.equal((await get({head:hash('old')})).status,409);assert.equal((await get({reportHash:hash('old')})).status,409);
  f.reads=0;f.move=true;const changed=await get();assert.equal(changed.status,409);assert.equal((await changed.json()).base64,undefined);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
