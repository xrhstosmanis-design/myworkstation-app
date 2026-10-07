# Νο4 / tracker09 - isolated replay diagnostics and POS deferral

07/10/2026 19:40-19:53 Europe/Athens - Same tracker09 owner retained. Owner defers POS/myDATA receipt because no Diadoxou POS is available; NOT TESTED, no submission/payment requested. Read-only DB19:46:5313 production inbound/5313 distinct MARK, latest16:24:08.153023Z (19:24 Athens), cursor400015572575607, enabled PRODUCTION. Filtered app logs13:45-16:46Z: no P2024/scheduled receiving errors found; not successful-run proof. Three new isolated Node20 diagnostics against the exact main receiving source PASS: successful in-process overlap/coalescing and replay with cursor0->100; foreign-store/SANDBOX cursor isolation; repeated-page rejection and next-run recovery100->101. Prisma/AADE/locks mocked; no real PostgreSQL lock/rollback, network, timer or LAB concurrency PASS. Overall09 OPEN for real cursor/replay/multiprocess acceptance, provider prerequisites, POS/credit/nonPremium/POSfirst, roles/devices/boundaries and pool reliability. No repeat accepted invoices or13816 acquisition; Gate3 PASS and other owners protected. Checkpoint2026-10-07-mydata-isolated-replay-and-pos-deferral.md.

Tested route source matches pinned main8836c1cff1197324aeed66eed3c382b42a2340c9 byte-for-byte. Node20:3pass/0fail/0skip. No source/config/schema changes, production synchronization or DB mutations. The mocked transaction does not emulate rollback/advisory-lock contention; partial-page recovery assertions cover application control flow only. Manual contains real accepted usage only and is not extended with these simulated results. Docs/PDF publication CI is distinct from technical diagnostics; PR/CI/merge recorded on associated PR. Single next independent acceptance: isolated PostgreSQL receiving replay/multiprocess locks with synthetic network responses; requires published pre-change scope and isolated database. Physical POS scope remains deferred until suitable terminal available.

## Reproduction

Create diagnostics-no4/ below repository parent, with mydata-current/ containing pinned revision; save the following as sync-success-replay.test.mjs and run node20 --test. Credentials and invoices are synthetic. No live service is called.

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as xmlHelpers from '../mydata-current/server/src/mydata-xml.js';

const source=await readFile(new URL('../mydata-current/server/src/routes/commerce-mydata-inbox.js',import.meta.url),'utf8');
const invoice=mark=>`<invoice><mark>${mark}</mark><issuer><vatNumber>099999999</vatNumber></issuer><counterpart><vatNumber>088888888</vatNumber></counterpart><invoiceHeader><aa>${mark}</aa></invoiceHeader><invoiceSummary><totalGrossValue>12.40</totalGrossValue></invoiceSummary></invoice>`;
async function fixture(){
 const rows=[],writes=[],requests=[],cursorValues=[];
 let calls=0,response=()=>`<RequestedDoc>${invoice('100')}</RequestedDoc>`,wait=null;
 const prisma={
  store:{findFirst:async({where})=>({id:where.id,company:{taxId:'088888888'}})},
  $executeRawUnsafe:async()=>0,
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');
   if(sql.includes('StoreIntegrationCredential'))return [{enabled:true,environment:'PRODUCTION',credentialsEnc:'synthetic'}];
   if(sql.includes('MAX(')){
    cursorValues.push(values);
    const matching=rows.filter(r=>r.company===values[0]&&r.store===values[1]&&r.source===values[2]);
    return [{lastMark:String(Math.max(0,...matching.map(r=>Number(r.mark))))}];
   }
   if(sql.includes('originalPending'))return [];
   throw Error('Unexpected external SQL: '+sql);
  },
  $transaction:async callback=>callback({
   $queryRaw:async(strings,...values)=>{
    const sql=strings.join('?');
    if(sql.includes('pg_try_advisory_xact_lock'))return [{held:true}];
    if(sql.includes('MyDataInboundDocument'))return rows.filter(r=>r.company===values[0]&&r.mark===values[1]).map(r=>({inboxId:r.inbox}));
    if(sql.includes('Supplier'))return [];
    throw Error('Unexpected transaction SQL: '+sql);
   },
   $executeRaw:async(strings,...values)=>{
    const sql=strings.join('?');writes.push(sql);
    if(sql.includes('INSERT INTO "MyDataInboundDocument"'))rows.push({company:values[1],store:values[2],inbox:values[3],mark:values[4],source:JSON.parse(values[16]).source});
    return 1;
   }
  })
 };
 globalThis.__no4Diagnostic={prisma,...xmlHelpers,Router:()=>({get(){},post(){}}),requireCompanyModule:()=>()=>{},ensureStoreIntegrationSchema:async()=>{},decryptStoreIntegrationCredentials:()=>({accountId:'synthetic',secret:'synthetic'})};
 const injected='import crypto from "node:crypto"; const {prisma,Router,requireCompanyModule,ensureStoreIntegrationSchema,decryptStoreIntegrationCredentials,invoiceNodes,invoiceSummary,myDataError,nextPage,unwrapMyDataXml}=globalThis.__no4Diagnostic;';
 const mod=await import('data:text/javascript;base64,'+Buffer.from(injected+source.replace(/^import .*;\r?\n/gm,'')+'\n//'+Math.random()).toString('base64'));
 delete globalThis.__no4Diagnostic;
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>{calls++;requests.push(new URL(url));if(wait)await wait;return {ok:true,text:async()=>response()}};
 return {mod,rows,writes,requests,cursorValues,get calls(){return calls},set response(v){response=v},set wait(v){wait=v},close(){globalThis.fetch=previous}};
}
const req=store=>({user:{companyId:'fictional-company',id:'fictional-owner'},body:{storeId:store},license:{activeModules:['DOCUMENTS']}});

test('successful overlapping calls receive once, then replay receives zero and advances scoped cursor',async()=>{
 const f=await fixture();let release;f.wait=new Promise(resolve=>release=resolve);
 try{
  const a=f.mod.syncMyDataStore(req('fictional-store-a'));
  const b=f.mod.syncMyDataStore(req('fictional-store-a'));
  assert.equal(a,b);release();const [one,two]=await Promise.all([a,b]);
  assert.equal(one,two);assert.equal(one.created,1);assert.equal(f.calls,1);assert.equal(f.rows.length,1);assert.equal(f.writes.length,2);
  const replay=await f.mod.syncMyDataStore(req('fictional-store-a'));
  assert.equal(replay.created,0);assert.equal(replay.duplicates,1);assert.equal(f.rows.length,1);assert.equal(f.writes.length,2);
  assert.deepEqual(f.requests.map(u=>u.searchParams.get('mark')),['0','100']);
  assert.deepEqual(f.cursorValues[1],['fictional-company','fictional-store-a','AADE_MYDATA_PRODUCTION']);
  assert.equal(replay.stockUpdated,false);assert.equal(replay.fiscalTransmission,false);
 }finally{f.close()}
});

test('foreign-store and sandbox history do not advance the production store cursor',async()=>{
 const f=await fixture();
 try{
  f.rows.push({company:'fictional-company',store:'fictional-store-b',mark:'900',source:'AADE_MYDATA_PRODUCTION'}, {company:'fictional-company',store:'fictional-store-a',mark:'800',source:'AADE_MYDATA_SANDBOX'});
  await f.mod.syncMyDataStore(req('fictional-store-a'));
  assert.equal(f.requests[0].searchParams.get('mark'),'0');
  assert.equal(f.requests[0].hostname,'mydatapi.aade.gr');
  assert.equal(f.rows.length,3);assert.equal(f.writes.length,2);
 }finally{f.close()}
});

test('repeated pagination fails without duplicate rows and a subsequent run recovers',async()=>{
 const f=await fixture();
 try{
  f.response=()=>`<RequestedDoc>${invoice('100')}<nextPartitionKey>p</nextPartitionKey><nextRowKey>r</nextRowKey></RequestedDoc>`;
  await assert.rejects(f.mod.syncMyDataStore(req('fictional-store-a')),/ίδια σελίδα/);
  assert.equal(f.calls,2);assert.equal(f.rows.length,1);assert.equal(f.writes.length,2);
  assert.equal(f.requests[1].searchParams.get('nextPartitionKey'),'p');assert.equal(f.requests[1].searchParams.get('nextRowKey'),'r');
  f.response=()=>`<RequestedDoc>${invoice('100')}${invoice('101')}</RequestedDoc>`;
  const recovered=await f.mod.syncMyDataStore(req('fictional-store-a'));
  assert.equal(recovered.created,1);assert.equal(recovered.duplicates,1);assert.equal(f.rows.length,2);assert.equal(f.writes.length,4);
  assert.equal(f.requests[2].searchParams.get('mark'),'100');
  assert.ok(f.writes.every(sql=>/INSERT INTO "(?:DocumentInbox|MyDataInboundDocument)"/.test(sql)));
 }finally{f.close()}
});

```
