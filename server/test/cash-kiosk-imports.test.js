import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {createCashReconciliationRouter} from '../src/routes/cash-reconciliation.js';
import {createKioskCashImports,readKioskCashEvidence,kioskImportRequest,kioskRevokeRequest} from '../src/services/cash-kiosk-imports.js';
import {projectReconciliation} from '../src/services/cash-reconciliation-report.js';
import {projectAutomaticReviewedReport} from '../src/services/cash-reviewed-automatic-contract.js';
import {hash} from '../src/services/cash-reconciliation-contract.js';
const scope={companyId:'co',storeId:'store',generation:'0'},period={from:'2026-10-25',to:'2026-10-28'};
const request={requestId:'123e4567-e89b-42d3-a456-426614174000',generation:'0',period,fileName:'source.xls',contentData:'AAAAAAAAAAAA',binding:{kind:'EVENTS'},selectedStoreConfirmed:true};
test('request contract requires explicit store attestation and Kiosk journal binding, never caller-supplied parsed facts',async()=>{
 assert(kioskImportRequest.safeParse(request).success);
 for(const changed of [{selectedStoreConfirmed:false},{binding:{kind:'JOURNAL'}},{document:{sales:[]}},{period:{from:'2026-10-01',to:'2026-12-31'}}])assert(!kioskImportRequest.safeParse({...request,...changed}).success);
 assert(!kioskRevokeRequest.safeParse({requestId:request.requestId,generation:'0',sourceId:'x',reason:'x'}).success);
 let reads=0;const service=createKioskCashImports({$transaction:()=>{reads++;throw Error('must not write');}});
 await assert.rejects(service.importFile(scope,{id:'actor'},{...request,contentData:'!!!!!!!!!!!!'},async()=>{}),/CASH_KIOSK_INVALID_FILE/);assert.equal(reads,0);
});
test('failed source reads are explicit unavailable and never return a false empty successful audit',async()=>{
 const result=await readKioskCashEvidence({$queryRaw:async()=>{throw Error('private connection diagnostic');}},scope,period);
 assert.equal(result.status,'UNAVAILABLE');assert.equal(result.coverage.sourceUnavailable,true);assert.equal(result.financialAdjustmentCents,0);assert.doesNotMatch(JSON.stringify(result),/private connection/);
 assert.equal(await readKioskCashEvidence({$queryRaw:async()=>[]},scope,period),null);
});
test('canonical and strict automatic report preserve external prose and its fingerprint without changing financial review identities',()=>{
 const item={session:{id:'native',companyId:'co',storeId:'store',status:'CLOSED',openedBy:'employee',openedByName:'Operator',terminalPos:'MAIN',shiftLabel:'Πρωινή',openedAt:'2026-10-27T06:00:00.000Z',closedAt:'2026-10-27T14:00:00.000Z'},sourceHash:hash('unchanged'),initialCents:-500,basisCents:-500,explainedCents:0,cardCents:300,nextClosed:true,reviewStatus:'VALID',transactions:[]};
 const source={store:{id:'store',name:'Κατάστημα'},rule:{mode:'FULL',carryOverEnabled:true},sessions:new Map([['native',item]]),selectedIds:['native'],period};
 const original=projectReconciliation(source,[]);
 source.kioskEventSales={status:'AVAILABLE',financialAdjustmentCents:0,evidenceHash:hash('external'),sourceChecksums:[hash('file')],coverage:{eventCount:0,saleCount:1,eventQuantityAvailable:false,externalOnly:true,missingJournalShiftIds:[],unverifiedEventOverlapCount:0,sourceUnavailable:false},findings:[{code:'ZERO_VALUE_SALE',eventId:null,saleId:'KIOSK_SALE:436:123',transactionNumber:'123',lineId:'KIOSK_LINE:123:1',occurredAt:'2026-10-27T19:09:17.000Z',eventAt:null,sessionId:'KIOSK_SHIFT:436',operatorId:'KIOSK_OPERATOR:6',operatorName:'ΤΑΜΕΙΟ 6',productId:'KIOSK_NAME:ΕΙΔΟΣ',productName:'ΕΙΔΟΣ',quantity:1,originalPriceCents:200,finalPriceCents:0,totalReductionCents:200}]};
 const result=projectReconciliation(source,[]),safe=projectAutomaticReviewedReport(result);
 assert.equal(result.rows[0].sourceHash,original.rows[0].sourceHash);assert.equal(result.rows[0].planHash,original.rows[0].planHash);assert.equal(result.rows[0].remainingCents,-500);assert.equal(result.rows[0].cardCents,300);assert.deepEqual(result.totals,original.totals);assert.notEqual(result.reportHash,original.reportHash);
 assert.equal(safe.text,result.text);assert.match(result.text,/21:09:17/);assert.match(result.text,/διάθεση του είδους/);assert.doesNotMatch(JSON.stringify(safe),/contentData|attachmentData|rawText/);
 assert.throws(()=>projectAutomaticReviewedReport({...result,text:result.text.replace('Μηδενική χρέωση','Εγκεκριμένη χρέωση')}));
 assert.throws(()=>projectAutomaticReviewedReport({...result,kioskEventSales:{...result.kioskEventSales,contentData:'private original'}}));
});
test('new registered endpoints reuse current role, tenant, active-store and license gates before source work',async()=>{
 let role='EMPLOYEE',company='co',active=true,modules=[],calls=0;
 const db={user:{findUnique:async()=>({id:'actor',companyId:'co',role,mustChangePassword:false})},store:{findUnique:async()=>({id:'store',companyId:company,active,company:{active:true}})},company:{findUnique:async()=>({active:true,licenseStatus:'ACTIVE',modules})},$queryRaw:async strings=>{if(strings.join('').includes('StorePaidModule'))return [];calls++;throw Error('unexpected');}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:'actor',companyId:'co',role:'SUPER_ADMIN'};next();});app.use(createCashReconciliationRouter({db,repository:{generation:async()=>{calls++;return '0';}}}));const server=createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const call=()=>fetch(`http://127.0.0.1:${server.address().port}/stores/store/kiosk-sources`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
 try{
  assert.equal((await call()).status,403);role='OWNER';company='foreign';assert.equal((await call()).status,404);company='co';active=false;assert.equal((await call()).status,404);active=true;
  for(const missing of ['CASH_CONTROL','STORE_CHAT','AI_READER']){modules=['CASH_CONTROL','STORE_CHAT','AI_READER'].filter(k=>k!==missing).map(moduleKey=>({moduleKey,active:true}));assert.equal((await call()).status,403);}
  assert.equal(calls,0);
 }finally{await new Promise(r=>server.close(r));}
});
