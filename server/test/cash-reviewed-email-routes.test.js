import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {createServer} from 'node:http';
import {hash} from '../src/services/cash-reconciliation-contract.js';
import {reconciliationText,projectReconciliation} from '../src/services/cash-reconciliation-report.js';
import {createReviewedCashEmailReader} from '../src/services/cash-reviewed-email.js';
const data=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');

test('actual registered Platform email routes preview common text, refuse stale/pending/foreign admission and send only the previewed snapshot through injected transport',async()=>{
 const key='cash-email-'+randomUUID(),path=new URL('../src/routes/platform-admin.js',import.meta.url),service=new URL('../src/services/cash-reviewed-email.js',import.meta.url).href;
 const f={user:{id:'actor',email:'auditor@example.invalid',isSuperAdmin:true,role:'SUPER_ADMIN'},sent:[],audits:[],deny:false,legacyValid:true};globalThis[key]=f;
 const row={sessionId:'a',day:'2026-10-21',shiftLabel:'Πρωινή',operatorName:'Χρυσάνθη',initialCents:-8700,remainingCents:-700,offsetCents:8000,cardCents:20000,reviewed:true,status:'REVIEWED',reviewedBy:'Χρήστος Μάνης'};
 f.report={storeId:'store',storeName:'Δοκιμή',generation:'0',period:{from:'2026-10-21',to:'2026-10-21'},head:hash('head'),reportHash:hash('source'),rows:[row],context:[],coverage:'BOUNDED_CLOSED_SHIFTS',financialFinality:'REVIEWED_CASH_ROWS_ONLY',originalFinancialLedgerChanged:false,totals:{shortageCents:700,surplusCents:0,pending:0},employees:[],checkpoint:null};
 const refresh=()=>{f.report.text=reconciliationText(f.report)};refresh();
 f.db={store:{findUnique:async()=>({id:'store',companyId:'co',name:'Δοκιμή',responsibleEmail:'responsible@example.invalid',company:{users:[{email:'owner@example.invalid'}]}})},$queryRaw:async()=>f.legacyRows||[{sessionId:'a',variance:-87,cardVariance:200,reviewValid:f.legacyValid}],authAudit:{create:async({data})=>{f.audits.push(data);return data}}};
 f.read=createReviewedCashEmailReader({db:f.db,authorize:async(_db,user,storeId)=>{if(f.deny||storeId!=='store'||!user?.isSuperAdmin)throw Object.assign(Error('private diagnostics'),{status:403});return {scope:{companyId:'co',storeId:'store'}}},repository:{generation:async()=> '0',read:async scope=>{assert.equal(scope.fullAudit,true);return structuredClone(f.report)}}});
 const modules={
  '../prisma.js':data(`export const prisma=globalThis[${JSON.stringify(key)}].db;`),
  '../middleware/auth.js':data(`export const auth=(req,res,next)=>{const f=globalThis[${JSON.stringify(key)}];if(!f.user)return res.status(401).json({error:'synthetic authentication'});req.user=f.user;next()};`),
  '../services/cash-reviewed-email.js':data(`export {reviewedCashEmailReadiness,assertReviewedCashEmailPreview,renderReviewedCashEmail} from ${JSON.stringify(service)};export const createReviewedCashEmailReader=()=>globalThis[${JSON.stringify(key)}].read;`),
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
  // Exercise the registered route with truly absent SQL review fields, not a
  // helper-only shortcut or a synthetic manual approval. No SMTP is installed.
  const session={id:'a',companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedBy:'employee',openedByName:'Εργαζόμενος',openedAt:'2026-10-21T06:00:00Z',closedAt:'2026-10-21T14:00:00Z',shiftLabel:'Πρωινή'};
  const automaticSource={store:{id:'store',name:'Δοκιμή'},rule:{mode:'FULL',carryOverEnabled:false},sessions:new Map([['a',{session,sourceHash:hash('original'),initialCents:-500,basisCents:-500,explainedCents:0,cardCents:0,nextClosed:false,reviewStatus:'VALID',transactions:[],automaticSnapshot:{openingDrawer:100,openingCustody:0,openingCoins:0,openingOperational:100,closingDrawer:95,closingCustody:0,closingCoins:0,actualOperational:95,expectedOperational:100,variance:-5,cashSales:0,expenses:0,cardSales:0,eftposTotal:0,cardVariance:0},automaticTransactions:[]}]]),selectedIds:['a'],period:{from:'2026-10-21',to:'2026-10-21'},coverage:'BOUNDED_CLOSED_SHIFTS'};
  automaticSource.sessions.get('a').eventSales={status:'AVAILABLE',findings:[],financialAdjustmentCents:0,evidenceHash:hash('synthetic-price-events')};
  automaticSource.sessions.get('a').fullEvidence={events:{status:'AVAILABLE',findings:[{code:'RETURN_ITEMS',eventId:'synthetic-event',occurredAt:'2026-10-21T10:00:00.000Z'}],unassignedCount:0,evidenceHash:hash('synthetic-events')},duplicates:{salesStatus:'LINKED_POS_SCOPE',duplicateWindowSeconds:60,findings:[{code:'SALE_LINE_DUPLICATE_CANDIDATE',transactions:[{saleId:'synthetic-sale-one'},{saleId:'synthetic-sale-two'}],secondsApart:30}]}};
  automaticSource.paperEvidence={version:1,storeId:'store',status:'INCOMPLETE',items:[{sourceId:'synthetic-paper',filename:'synthetic-paper.png',line:null,status:'UNRESOLVED',reason:'NOT_READ'}],coverage:{discoveryComplete:true,complete:false},financialAdjustmentCents:0,humanApproval:false,hash:hash('synthetic-papers')};
  f.report={...projectReconciliation(automaticSource,[]),generation:'0',head:'ROOT'};
  f.legacyRows=[{sessionId:'a',variance:-5,cardVariance:0,reviewValid:false,reviewDecision:null,reviewedAt:null,reviewedBy:null}];
  const automatic=await(await get()).json();assert.equal(automatic.readyToSend,true);assert.equal(f.report.rows[0].reviewed,false);assert.equal(f.report.rows[0].fullAudit.status,'PENDING');assert.equal(f.report.calculatedResult.shortageCents,500);assert.equal(automatic.text,f.report.text);assert.match(automatic.html,/Δεν ελέγχθηκε πλήρως · synthetic-paper.png.*δεν έχει διαβαστεί/);assert.match(automatic.html,/Περιμένω απάντηση μέσω email/);
  for(const pattern of [/Η αναφορά δημιουργήθηκε αυτόματα από το MyWorkStation/,/Μερική επιστροφή ειδών/,/Πιθανή επανάληψη πώλησης εντός 1 λεπτού/,/synthetic-paper\.png.*δεν έχει διαβαστεί/])assert.match(automatic.text,pattern);
  const fullBefore=structuredClone(f.report);body.comment='';body.reportHash=automatic.reportHash;
  assert.equal((await post('send-email',body)).status,200);assert.equal(f.sent.length,3);assert.equal(f.sent[2].message.text,automatic.text);assert.equal(f.sent[2].message.html,automatic.html);assert.deepEqual(f.sent[2].args.to,['owner@example.invalid','responsible@example.invalid']);assert.doesNotMatch(f.sent[2].message.text,/ΜΑΝΗΣ ΧΡΗΣΤΟΣ|Πρόσθετο σχόλιο αποστολής/);
  assert.equal((await post('send-preview',body)).status,200);assert.equal(f.sent.length,4);assert.deepEqual(f.sent[3].args.to,['auditor@example.invalid']);assert.equal(f.sent[3].message.text,'ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΑΝΑΦΟΡΑΣ\n\n'+automatic.text);assert.deepEqual(f.report,fullBefore);
  automaticSource.paperEvidence.hash=hash('changed-cached-paper');f.report={...projectReconciliation(automaticSource,[]),generation:'0',head:'ROOT'};assert.equal(f.report.text,automatic.text);
  assert.equal((await post('send-email',body)).status,409);assert.equal((await post('send-preview',body)).status,409);assert.equal(f.sent.length,4);body.reportHash=(await(await get()).json()).reportHash;
  f.legacyRows[0].reviewedAt='2026-10-20T10:00:00Z';assert.equal((await(await get()).json()).readyToSend,false);assert.equal((await post('send-email',body)).status,409);assert.equal(f.sent.length,4);f.legacyRows[0].reviewedAt=null;
  f.deny=true;assert.equal((await get()).status,403);assert.equal((await post('send-email',body)).status,403);f.deny=false;assert.equal((await get('foreign')).status,403);assert.equal(f.sent.length,4);
  const accountKey='CASH_CONTROL_TEST_ACCOUNT_EMAIL',recipientKey='CASH_CONTROL_TEST_RECIPIENT_EMAIL';
  const priorAccount=process.env[accountKey],priorRecipient=process.env[recipientKey];
  try{
   process.env[accountKey]='auditor@example.invalid';
   process.env[recipientKey]='personal@example.invalid';
   const personalPreview=()=>fetch(base+'store/email-preview?date=2026-10-21&mode=self');
   const personal=await(await personalPreview()).json();
   assert.equal(personal.personalRecipient,'personal@example.invalid');
   assert.equal((await(await get()).json()).personalRecipient,undefined);
   assert.deepEqual(personal.recipients,['owner@example.invalid','responsible@example.invalid']);
   assert.equal((await post('send-preview',body)).status,409);
   assert.equal((await post('send-preview',{...body,expectedRecipient:'auditor@example.invalid'})).status,409);
   assert.equal(f.sent.length,4);
   const personalBody={...body,expectedRecipient:personal.personalRecipient};
   assert.equal((await post('send-preview',personalBody)).status,200);
   assert.deepEqual(f.sent[4].args.to,['personal@example.invalid']);
   assert.equal(f.audits.at(-1).email,'auditor@example.invalid');
   f.user.email='another@example.invalid';
   assert.equal((await(await personalPreview()).json()).personalRecipient,'another@example.invalid');
   assert.equal((await post('send-preview',personalBody)).status,409);
   f.user.email='auditor@example.invalid';
   process.env[recipientKey]='invalid-address';
   assert.equal((await personalPreview()).status,422);
   assert.equal((await post('send-preview',personalBody)).status,422);
   assert.equal(f.sent.length,5);
  }finally{
   if(priorAccount===undefined)delete process.env[accountKey];else process.env[accountKey]=priorAccount;
   if(priorRecipient===undefined)delete process.env[recipientKey];else process.env[recipientKey]=priorRecipient;
  }
  f.user={id:'actor',role:'OWNER'};assert.equal((await get()).status,403);f.user=null;assert.equal((await get()).status,401);assert.equal(f.sent.length,5);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));delete globalThis[key];}
});
