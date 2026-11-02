import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createCashPaperRouter,authorizeCashPaper} from '../src/routes/cash-papers.js';
const bytes=Buffer.from('%PDF-test'),checksum=createHash('sha256').update(bytes).digest('hex');
const raw={dateText:'21/10/2026',documentDate:'2026-10-21',operatorText:'Test',shiftText:null,lines:[],notes:[]};
function fixture(){
 const records=[],calls=[];let role='OWNER',active=true,company='c',override=null,missingModule=null;
 const original={id:'m',companyId:'c',storeId:'s',category:'CASH',createdAt:new Date(),attachmentName:'paper.pdf',attachmentMimeType:'application/pdf',attachmentSize:bytes.length,attachmentChecksum:checksum,attachmentData:bytes.toString('base64')};
 const db={user:{findUnique:async({where})=>where.id==='u'?{id:'u',role,companyId:'c',fullName:'Reader',mustChangePassword:false}:null},store:{findUnique:async({where})=>where.id==='s'?{id:'s',companyId:company,active,company:{active:true}}:null},company:{findUnique:async()=>({id:'c',active:true,licenseStatus:'ACTIVE',modules:['CASH_CONTROL','STORE_CHAT','AI_READER'].filter(k=>k!==missingModule).map(moduleKey=>({moduleKey,active:true}))})},$queryRawUnsafe:async()=>[{schema:'fixture',fence:null}],$transaction:async fn=>fn(db),$queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');calls.push(sql);
   if(sql.includes('StorePaidModule'))return override?[override]:[];
   if(sql.includes('FROM "StoreChatMessage"'))return values.includes('wrong')?[]:[original];
   if(sql.includes('FOR SHARE OF s'))return active?[{id:'s'}]:[];
   if(sql.includes('INSERT INTO "WorkforceAuditLog"')){const [id,companyId,storeId,actorUserId,entityType,entityId,after]=values;if(records.some(r=>r.id===id))return [];records.push({id,companyId,storeId,actorUserId,entityType,entityId,afterJson:JSON.parse(after),action:sql.includes('CASH_PAPER_REQUESTED')?'CASH_PAPER_REQUESTED':'CASH_PAPER_COMPLETED',createdAt:new Date()});return[{id}];}
   if(sql.includes('FROM "WorkforceAuditLog"'))return records.filter(r=>r.companyId===values[0]&&r.storeId===values[1]&&r.entityId===values[3]);
   throw Error('Unexpected fixture query: '+sql);
 }};
 return {db,records,calls,original,set role(v){role=v},set active(v){active=v},set company(v){company=v},set override(v){override=v},set missingModule(v){missingModule=v}};
}
test('actual paper authorization requires fresh real role, tenant, active store and each current module, without provider or audit writes',async()=>{
 const f=fixture();assert.equal((await authorizeCashPaper(f.db,{id:'u',companyId:'c'},'s')).scope.storeId,'s');
 for(const role of ['EMPLOYEE','ADMIN']){f.role=role;await assert.rejects(authorizeCashPaper(f.db,{id:'u',companyId:'c',role:'SUPER_ADMIN'},'s'),e=>e.status===403);}
 f.role='OWNER';await assert.rejects(authorizeCashPaper(f.db,{id:'u',companyId:'c',tokenType:'STORE_OPERATOR'},'s'),e=>e.status===403);
 for(const module of ['CASH_CONTROL','STORE_CHAT','AI_READER']){f.missingModule=module;await assert.rejects(authorizeCashPaper(f.db,{id:'u',companyId:'c'},'s'),e=>e.status===403);}f.missingModule=null;
 f.override={active:false};await assert.rejects(authorizeCashPaper(f.db,{id:'u',companyId:'c'},'s'),e=>e.status===403);f.override={active:true,endsAt:new Date('2020-01-01')};await assert.rejects(authorizeCashPaper(f.db,{id:'u',companyId:'c'},'s'),e=>e.status===403);f.override=null;
 f.company='foreign';await assert.rejects(authorizeCashPaper(f.db,{id:'u',companyId:'c'},'s'),e=>e.status===404);f.company='c';f.active=false;await assert.rejects(authorizeCashPaper(f.db,{id:'u',companyId:'c'},'s'),e=>e.status===404);
 assert.equal(f.records.length,0);assert(!f.calls.some(q=>q.includes('StoreChatMessage')));
});
test('mounted real HTTP GET is free/read-only; explicit POST reads once, reuses result, preserves original and refuses changed/foreign input',async()=>{
 const f=fixture(),before=JSON.stringify(f.original);let paid=0;
 const provider={configuration(){},prepare:async()=>[],read:async()=>{paid++;return raw}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{if(req.headers.authorization!=='Bearer synthetic')return res.status(401).json({error:'auth required'});req.user={id:'u',companyId:'c'};next()});app.use(createCashPaperRouter({db:f.db,provider}));
 const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,body,auth=true)=>{const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{...(auth?{Authorization:'Bearer synthetic'}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
 try{
  assert.equal((await request('/stores/s',null,false)).status,401);assert.equal(paid,0);
  const list=await request('/stores/s');assert.equal(list.status,200);assert.equal(list.body.storeId,'s');assert.equal(list.body.generation,'0');assert.equal(list.body.sources[0].reading.status,'NOT_READ');assert.equal(f.records.length,0);assert.equal(paid,0);assert.doesNotMatch(JSON.stringify(list.body),/attachmentData|JVBERi/);
  const body={messageId:'m',checksum,generation:'0'};let out=await request('/stores/s/read',body);assert.equal(out.status,200);assert.equal(out.body.status,'EXTRACTED_UNVERIFIED');assert.equal(out.body.extraction.associationVerified,false);assert.equal(paid,1);assert.equal(f.records.length,2);
  out=await request('/stores/s/read',body);assert.equal(out.body.reused,true);assert.equal(paid,1);assert.equal(f.records.length,2);
  assert.equal((await request('/stores/s/read',{...body,role:'SUPER_ADMIN'})).status,400);assert.equal((await request('/stores/s/read',{...body,checksum:'a'.repeat(64)})).status,409);assert.equal((await request('/stores/foreign/read',body)).status,404);assert.equal(paid,1);
  assert.equal(JSON.stringify(f.original),before);assert(f.records.every(r=>r.entityType==='CASH_PAPER_READING'));assert(!f.calls.some(q=>/StoreTransaction|CashControlReview|INSERT INTO "Sale"|AiReaderJob/.test(q)));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('registered read-next validates scope/generation before dispatch, reads one source per action and leaves GET and financial data unchanged',async()=>{
 const f=fixture(),secondBytes=Buffer.from('%PDF-second'),secondChecksum=createHash('sha256').update(secondBytes).digest('hex');
 const second={...f.original,id:'m2',attachmentName:'second.pdf',attachmentSize:secondBytes.length,attachmentChecksum:secondChecksum,attachmentData:secondBytes.toString('base64')};
 const before=JSON.stringify([f.original,second]),originalQuery=f.db.$queryRaw;
 f.db.$queryRaw=async(strings,...values)=>{
  const sql=strings.join('?');
  if(sql.includes('FROM "StoreChatMessage"')){
   f.calls.push(sql);
   return sql.includes('AND "id"=')?(values.includes('m2')?[second]:[f.original]):[f.original,second];
  }
  return originalQuery(strings,...values);
 };
 let paid=0;const provider={configuration(){},prepare:async()=>[],read:async()=>{paid++;return raw}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{if(req.headers.authorization!=='Bearer synthetic')return res.status(401).json({error:'auth required'});req.user={id:'u',companyId:'c'};next()});app.use(createCashPaperRouter({db:f.db,provider}));
 const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,body,auth=true)=>{const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{...(auth?{Authorization:'Bearer synthetic'}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,cache:response.headers.get('cache-control'),body:await response.json()};};
 const body={generation:'0',period:{from:'2026-10-21',to:'2026-10-21'}};
 try{
  assert.equal((await request('/stores/s/read-next',body,false)).status,401);
  for(const invalid of [{...body,period:{from:'2026-10-21',to:'2026-12-21'}},{...body,period:{from:'not-a-date',to:'2026-10-21'}},{...body,reviewed:true}])assert.equal((await request('/stores/s/read-next',invalid)).status,400);
  let out=await request('/stores/s/read-next',{...body,generation:'1'});assert.equal(out.status,409);assert.equal(out.body.code,'STORE_LIFECYCLE_STALE_GENERATION');
  assert.equal((await request('/stores/foreign/read-next',body)).status,404);
  f.role='EMPLOYEE';assert.equal((await request('/stores/s/read-next',body)).status,403);f.role='OWNER';
  f.missingModule='AI_READER';assert.equal((await request('/stores/s/read-next',body)).status,403);f.missingModule=null;
  assert.equal(paid,0);assert.equal(f.records.length,0);
  const initial=await request('/stores/s');assert.equal(initial.status,200);assert.equal(initial.body.sources.length,2);assert(initial.body.sources.every(s=>s.reading.status==='NOT_READ'));assert.equal(paid,0);
  out=await request('/stores/s/read-next',body);assert.equal(out.status,200);assert.equal(out.cache,'private, no-store');assert.equal(out.body.status,'MORE');assert.equal(out.body.remaining,1);assert.equal(out.body.processedChecksum,checksum);assert.equal(out.body.coverage.discoveryComplete,true);assert.equal(paid,1);assert.equal(f.records.length,2);
  const reread=await request('/stores/s');assert.equal(reread.body.sources[0].reading.status,'EXTRACTED_UNVERIFIED');assert.equal(reread.body.sources[1].reading.status,'NOT_READ');assert.equal(paid,1);assert.equal(f.records.length,2);
  out=await request('/stores/s/read-next',body);assert.equal(out.body.status,'COMPLETE');assert.equal(out.body.remaining,0);assert.equal(out.body.processedChecksum,secondChecksum);assert.equal(paid,2);assert.equal(f.records.length,4);
  out=await request('/stores/s/read-next',body);assert.equal(out.body.status,'COMPLETE');assert.equal(out.body.processedChecksum,null);assert.equal(paid,2);assert.equal(f.records.length,4);
  assert.doesNotMatch(JSON.stringify(out.body),/attachmentData|JVBERi/);assert.equal(JSON.stringify([f.original,second]),before);
  assert(f.records.every(r=>r.entityType==='CASH_PAPER_READING'));assert(!f.calls.some(q=>/StoreTransaction|CashControlReview|INSERT INTO "Sale"|AiReaderJob/.test(q)));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
