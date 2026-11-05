import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {createCashReconciliationRouter} from '../src/routes/cash-reconciliation.js';
const request={requestId:'123e4567-e89b-42d3-a456-426614174000',head:'ROOT',generation:'0',period:{from:'2026-10-21',to:'2026-10-23'},data:{kind:'CONFIRM',sessionId:'a',sourceHash:'a'.repeat(64),planHash:'b'.repeat(64),note:'Ελέγχθηκαν τα πραγματικά στοιχεία.',reviewed:true}};
test('registered review HTTP rejects stale token roles, foreign store, inactive license/modules and malformed scope before source/audit writes',async()=>{
 let role='EMPLOYEE',company='co',active=true,modules=[],sourceCalls=0;
 const db={user:{findUnique:async()=>({id:'actor',fullName:'Test',companyId:'co',role,mustChangePassword:false})},store:{findUnique:async()=>({id:'store',companyId:company,active,company:{active:true}})},company:{findUnique:async()=>({active:true,licenseStatus:'ACTIVE',modules})},$queryRaw:async(strings)=>{if(strings.join('').includes('StorePaidModule'))return[];sourceCalls++;throw Error('unexpected source access');},$queryRawUnsafe:async()=>{sourceCalls++;throw Error('unexpected lifecycle read');},$transaction:async()=>{sourceCalls++;throw Error('unexpected audit write');}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{if(req.headers.authorization!=='Bearer synthetic')return res.status(401).json({error:'authentication required'});req.user={id:'actor',companyId:'co',role:'SUPER_ADMIN'};next()});app.use(createCashReconciliationRouter({db}));
 const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const call=async(path,body,auth=true)=>{const res=await fetch(origin+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer synthetic'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:res.status,body:await res.json()};};
 try{
  assert.equal((await call('/stores/store?from=2026-10-21&to=2026-10-23',null,false)).status,401);
  assert.equal((await call('/stores/store?from=2026-10-21&to=2026-10-23')).status,403);assert.equal((await call('/stores/store/reviews',request)).status,403,'actual DB role overrides claimed token role');
  for(const body of [{...request,role:'SUPER_ADMIN'},{...request,data:{...request.data,reviewed:false}},{...request,data:{...request.data,cardOffset:10}}])assert.equal((await call('/stores/store/reviews',body)).status,400);
  assert.equal((await call('/stores/store?from=2026-10-01&to=2026-11-01')).status,400);
  role='OWNER';company='foreign';assert.equal((await call('/stores/store/reviews',request)).status,404);company='co';active=false;assert.equal((await call('/stores/store/reviews',request)).status,404);active=true;
  for(const missing of ['CASH_CONTROL','STORE_CHAT','AI_READER']){modules=['CASH_CONTROL','STORE_CHAT','AI_READER'].filter(k=>k!==missing).map(moduleKey=>({moduleKey,active:true}));assert.equal((await call('/stores/store/reviews',request)).status,403);}
  assert.equal(sourceCalls,0,'denied or invalid requests never read financial/paper sources or write audit');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('unknown review source failures emit bounded diagnostic codes without private error/request/source fields',async()=>{
 const diagnostics=[];let error=Object.assign(Error('PRIVATE_SOURCE_TOKEN account amount detail'),{code:'P2028',meta:{code:'57014',query:'PRIVATE_SQL'},stack:'PRIVATE_STACK'});
 const app=express();app.use(createCashReconciliationRouter({db:{},onError:record=>diagnostics.push(record),authorize:async()=>{throw error;}}));const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const call=()=>fetch(`http://127.0.0.1:${server.address().port}/stores/PRIVATE_STORE?from=2026-10-21&to=2026-10-23`);
 try{
  const response=await call();assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/PRIVATE_|account amount|P2028/);
  assert.equal(diagnostics.length,1);assert.deepEqual(Object.keys(diagnostics[0]).sort(),['causeCode','code','elapsedMs','event','operation','status']);
  assert.equal(diagnostics[0].event,'cash_reconciliation_failed');assert.equal(diagnostics[0].operation,'READ');assert.equal(diagnostics[0].causeCode,'P2028');assert.equal(diagnostics[0].status,503);assert(Number.isInteger(diagnostics[0].elapsedMs)&&diagnostics[0].elapsedMs>=0&&diagnostics[0].elapsedMs<=3600000);
  error=Object.assign(Error('PRIVATE_EXCEPTION'),{code:'PRIVATE_CODE',meta:{code:'42703',detail:'PRIVATE_DETAIL'}});await call();assert.equal(diagnostics[1].causeCode,'42703');
  error=Object.assign(Error('PRIVATE_EXCEPTION'),{code:'PRIVATE_CODE',meta:{code:'PRIVATE_META'}});await call();assert.equal(diagnostics[2].causeCode,'UNKNOWN');assert.doesNotMatch(JSON.stringify(diagnostics),/PRIVATE_|account amount/);
  error={code:'CASH_RECONCILIATION_LIMIT',status:409};const known=await call();assert.equal(known.status,409);assert.equal((await known.json()).code,'CASH_RECONCILIATION_LIMIT');assert.equal(diagnostics.length,3,'known guarded failures do not emit unknown-source diagnostics');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('diagnostic sink failure cannot replace or expose a source failure',async()=>{
 const app=express();app.use(createCashReconciliationRouter({db:{},onError:()=>{throw Error('PRIVATE_LOGGER');},authorize:async()=>{throw Error('PRIVATE_SOURCE');}}));const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}/stores/store?from=2026-10-21&to=2026-10-23`);assert.equal(response.status,503);const body=await response.json();assert.equal(body.code,'CASH_RECONCILIATION_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(body),/PRIVATE_/);}finally{await new Promise(resolve=>server.close(resolve));}
});
test('full-audit GET is an explicit validated selected-store projection, default reads remain unchanged',async()=>{
 let authorizations=0;const scopes=[];
 const repository={generation:async()=> '0',read:async(scope,period)=>{scopes.push({...scope});return {storeId:scope.storeId,period,rows:[],text:'report'};}};
 const app=express();app.use(createCashReconciliationRouter({db:{},repository,authorize:async(db,user,storeId)=>{authorizations++;return {scope:{companyId:'co',storeId}};}}));
 const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}/stores/store?from=2026-10-21&to=2026-10-23`;
 try{
  for(const suffix of ['&fullAudit=0','&fullAudit=true','&fullAudit=1&fullAudit=1','&fullAudit[flag]=1'])assert.equal((await fetch(origin+suffix)).status,400);
  assert.equal(authorizations,0,'invalid projection never authorizes or reads a source');
  assert.equal((await fetch(origin)).status,200);assert.equal(Object.hasOwn(scopes[0],'fullAudit'),false);
  assert.equal((await fetch(origin+'&fullAudit=1')).status,200);assert.deepEqual(scopes[1],{companyId:'co',storeId:'store',generation:'0',fullAudit:true});
  assert.equal((await fetch(origin)).status,200);assert.equal(Object.hasOwn(scopes[2],'fullAudit'),false,'opt-in flag does not survive into a subsequent basic read');
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('full-mode review requests preserve the report mode and reject invalid mode before writes',async()=>{
 const scopes=[];let auth=0;
 const repository={generation:async()=> '0',apply:async(scope)=>{scopes.push({...scope});return {storeId:scope.storeId,period:request.period,rows:[],text:'report'};}};
 const app=express();app.use(express.json());app.use(createCashReconciliationRouter({db:{},repository,authorize:async()=>{auth++;return {scope:{companyId:'co',storeId:'store'},actor:{id:'u'}};}}));
 const server=createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const send=mode=>fetch(`http://127.0.0.1:${server.address().port}/stores/store/reviews${mode}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
 try{assert.equal((await send('?fullAudit=0')).status,400);assert.equal(auth,0);assert.equal((await send('?fullAudit=1')).status,200);assert.equal(scopes[0].fullAudit,true);assert.equal((await send('')).status,200);assert.equal(Object.hasOwn(scopes[1],'fullAudit'),false);}finally{await new Promise(r=>server.close(r));}
});

test('automatic-check route runs a full read-only selected-store audit with no provider or review writes',async()=>{
 let reads=0,writes=0,authorizations=0,fullAudit=false;
 const repository={generation:async()=> '0',read:async(scope,period)=>{
  reads++;fullAudit=scope.fullAudit===true;
  return {storeId:'store',period,reportHash:'report-hash',rows:[{sessionId:'a',status:'AWAITING_REVIEW',remainingCents:-34400,cardCents:-22750,fullAudit:{status:'PENDING'}}],paperEvidence:{coverage:{discoveryComplete:false},items:[{status:'UNRESOLVED'}]},countingErrorCandidates:[{status:'AMBIGUOUS_OVERLAP'}]};
 },apply:async()=>{writes++;throw Error('no review writes allowed')}};
 const authorize=async(_db,user,storeId)=>{authorizations++;if(user?.id!=='allowed'||storeId!=='store')throw Object.assign(Error('denied'),{code:'CASH_PAPER_ACCESS_DENIED',status:403});return {scope:{companyId:'co',storeId},actor:{id:'allowed'}};};
 const app=express();app.use((req,res,next)=>{req.user={id:req.headers.authorization==='Bearer authorized'?'allowed':'denied'};next()});app.use(createCashReconciliationRouter({db:{},repository,authorize,imports:{}}));
 const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 try{
  const base='/stores/store/automatic-check?from=2026-10-22&to=2026-10-23';
  let response=await fetch(origin+base);assert.equal(response.status,403);assert.equal(reads,0);
  response=await fetch(origin+'/stores/store/automatic-check?from=2026-10-01&to=2026-11-12',{headers:{authorization:'Bearer authorized'}});assert.equal(response.status,400);assert.equal(reads,0);
  response=await fetch(origin+base,{headers:{authorization:'Bearer authorized'}});assert.equal(response.status,200);
  const data=await response.json();assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(data.automaticCheck.status,'HOLD');assert.equal(data.automaticCheck.ambiguousPairs,1);
  assert.equal(data.automaticCheck.paperCoverage,'INCOMPLETE');assert.equal(data.automaticCheck.financialAdjustmentCents,0);
  assert.equal(data.automaticCheck.humanApproval,false);assert.equal(data.automaticCheck.reportHash,data.reportHash);
  assert.equal(fullAudit,true);assert.equal(reads,1);assert.equal(writes,0);assert.equal(authorizations,3);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
