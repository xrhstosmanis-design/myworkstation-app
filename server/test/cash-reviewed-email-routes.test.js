import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {createServer} from 'node:http';
import {hash} from '../src/services/cash-reconciliation-contract.js';
import {reconciliationText} from '../src/services/cash-reconciliation-report.js';
import {createReviewedCashEmailReader} from '../src/services/cash-reviewed-email.js';
const data=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');

test('actual registered Platform email routes preview common text, refuse stale/pending/foreign admission and send only the previewed snapshot through injected transport',async()=>{
 const key='cash-email-'+randomUUID(),path=new URL('../src/routes/platform-admin.js',import.meta.url),service=new URL('../src/services/cash-reviewed-email.js',import.meta.url).href;
 const f={user:{id:'actor',email:'auditor@example.invalid',isSuperAdmin:true,role:'SUPER_ADMIN'},sent:[],audits:[],deny:false,legacyValid:true};globalThis[key]=f;
 const row={sessionId:'a',day:'2026-10-21',shiftLabel:'Πρωινή',operatorName:'Χρυσάνθη',initialCents:-8700,remainingCents:-700,offsetCents:8000,cardCents:20000,reviewed:true,status:'REVIEWED',reviewedBy:'Χρήστος Μάνης'};
 f.report={storeId:'store',storeName:'Δοκιμή',generation:'0',period:{from:'2026-10-21',to:'2026-10-21'},head:hash('head'),reportHash:hash('source'),rows:[row],context:[],coverage:'BOUNDED_CLOSED_SHIFTS',financialFinality:'REVIEWED_CASH_ROWS_ONLY',originalFinancialLedgerChanged:false,totals:{shortageCents:700,surplusCents:0,pending:0},employees:[],checkpoint:null};
 const refresh=()=>{f.report.text=reconciliationText(f.report)};refresh();
 f.db={store:{findUnique:async()=>({id:'store',companyId:'co',name:'Δοκιμή',responsibleEmail:'responsible@example.invalid',company:{users:[{email:'owner@example.invalid'}]}})},$queryRaw:async()=>[{sessionId:'a',variance:-87,cardVariance:200,reviewValid:f.legacyValid}],authAudit:{create:async({data})=>{f.audits.push(data);return data}}};
 f.read=createReviewedCashEmailReader({db:f.db,authorize:async(_db,user,storeId)=>{if(f.deny||storeId!=='store'||!user?.isSuperAdmin)throw Object.assign(Error('private diagnostics'),{status:403});return {scope:{companyId:'co',storeId:'store'}}},repository:{generation:async()=> '0',read:async()=>structuredClone(f.report)}});
 const modules={
  '../prisma.js':data(`export const prisma=globalThis[${JSON.stringify(key)}].db;`),
  '../middleware/auth.js':data(`export const auth=(req,res,next)=>{const f=globalThis[${JSON.stringify(key)}];if(!f.user)return res.status(401).json({error:'synthetic authentication'});req.user=f.user;next()};`),
  '../services/cash-reviewed-email.js':data(`export {reviewedCashEmailReadiness,assertReviewedCashEmailPreview} from ${JSON.stringify(service)};export const createReviewedCashEmailReader=()=>globalThis[${JSON.stringify(key)}].read;`),
  '../services/mail.js':data(`import {renderReviewedCashEmail} from ${JSON.stringify(service)};export const getMailStatus=()=>({});export async function sendCashControlDailyReportEmail(args){const f=globalThis[${JSON.stringify(key)}];const message=renderReviewedCashEmail(args);f.sent.push({args,message});return {recipients:args.to,messageId:'synthetic-no-smtp'}}`)
 };
 let source=await readFile(path,'utf8');source=source.replace(/(from\s+)(["'])([^"']+)\2/g,(_m,prefix,_quote,specifier)=>prefix+JSON.stringify(modules[specifier]||(specifier.startsWith('.')?new URL(specifier,path).href:import.meta.resolve(specifier))));
 let server;
 try{
  const {default:router}=await import(data(source));const app=express();app.use(express.json());app.use(router);app.use((error,_req,res,_next)=>res.status(error.status||400).json({error:error.message,code:error.code}));server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/cash-control/stores/`;
  const get=(store='store')=>fetch(base+store+'/email-preview?date=2026-10-21');const post=(name,body)=>fetch(base+'store/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const p=await get();assert.equal(p.status,200);const preview=await p.json();assert.equal(preview.text,f.report.text);assert.equal(preview.readyToSend,true);assert.equal(f.sent.length,0);assert.match(preview.text,/Έλλειμμα 7,00/);assert.match(preview.text,/POS–EFTPOS: διαφορά \+200,00/);
  const body={date:preview.date,reportHash:preview.reportHash,generation:preview.generation,comment:'Ελέγχθηκαν τα χαρτιά.'};
  assert.equal((await post('send-email',{date:preview.date})).status,409,'old client cannot send without the displayed snapshot');
  f.report.head=hash('a new review');refresh();assert.equal((await post('send-email',body)).status,409);assert.equal(f.sent.length,0);
  const fresh=await(await get()).json();body.reportHash=fresh.reportHash;
  f.legacyValid=false;assert.equal((await post('send-email',body)).status,409);f.legacyValid=true;
  row.reviewed=false;row.status='AWAITING_REVIEW';f.report.totals.pending=1;refresh();const pending=await(await get()).json();assert.equal(pending.readyToSend,false);body.reportHash=pending.reportHash;assert.equal((await post('send-email',body)).status,409);assert.equal(f.sent.length,0);
  const own=await post('send-preview',body);assert.equal(own.status,200);assert.equal(f.sent.length,1);assert.deepEqual(f.sent[0].args.to,['auditor@example.invalid']);assert.equal(f.sent[0].args.previewOnly,true);assert.match(f.sent[0].message.text,/ΥΠΟ ΕΛΕΓΧΟ/);assert.match(f.sent[0].message.text,/^ΠΡΟΕΠΙΣΚΟΠΗΣΗ/);
  row.reviewed=true;row.status='REVIEWED';f.report.totals.pending=0;refresh();body.reportHash=(await(await get()).json()).reportHash;
  assert.equal((await post('send-email',{...body,text:'FAKE RESULT',evidence:{}})).status,200);assert.equal(f.sent.length,2);assert.equal(f.sent[1].message.text,f.report.text+'\n\nΠρόσθετο σχόλιο αποστολής: '+body.comment);assert(!f.sent[1].message.text.includes('FAKE'));assert.deepEqual(f.sent[1].args.to,['owner@example.invalid','responsible@example.invalid']);assert.equal(f.audits.length,2);
  f.deny=true;assert.equal((await get()).status,403);assert.equal((await post('send-email',body)).status,403);f.deny=false;assert.equal((await get('foreign')).status,403);assert.equal(f.sent.length,2);
  f.user={id:'actor',role:'OWNER'};assert.equal((await get()).status,403);f.user=null;assert.equal((await get()).status,401);assert.equal(f.sent.length,2);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));delete globalThis[key];}
});
