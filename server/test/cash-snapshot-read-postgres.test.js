import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readReconciliationSession} from '../src/services/cash-reconciliation-source.js';
import {readCashReviewState,readCashReviewSnapshot,cashReviewSnapshotFromLoadedTransactions} from '../src/services/cash-review-balance.js';
import {readCashEventSales} from '../src/services/cash-event-sales-source.js';
import {readCashExpenseEvidence,cashExpenseFindings,purchaseDocumentMime} from '../src/services/cash-expense-evidence.js';
import {exactCents,hash,reconcileError} from '../src/services/cash-reconciliation-contract.js';
import {projectReconciliation} from '../src/services/cash-reconciliation-report.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const scope={companyId:'co',storeId:'store',generation:'0'},rule={mode:'FULL',carryOverEnabled:false,posEftposEnabled:true,deliveryTerminalPattern:'DELIVERY'};
// Frozen pre-reuse source: the legacy COUNT + SQL snapshot/read projection is
// compared inside one native snapshot, including source and canonical hashes.
async function legacyReconciliationSession(db,scope,id,rule){
  const rows=await db.$queryRaw`SELECT s."id",s."companyId",s."storeId",s."terminalPos",s."status",s."openedBy",s."openedByName",s."shiftLabel",s."openedAt",s."closedAt",s."variance",s."cardVariance",s."openingOperational",s."actualOperational",s."updatedAt",to_jsonb(s) AS "automaticSnapshot",to_jsonb(n) AS "nextSession",to_jsonb(p) AS "previousSession" FROM "CashShiftSession" s LEFT JOIN LATERAL (
    SELECT next."id",next."companyId",next."storeId",next."terminalPos",next."status",next."openedAt",next."closedAt",next."openedByName"
    FROM "CashShiftSession" next WHERE next."companyId"=s."companyId" AND next."storeId"=s."storeId" AND next."terminalPos"=s."terminalPos"
      AND (next."openedAt">s."openedAt" OR (next."openedAt"=s."openedAt" AND next."id">s."id")) ORDER BY next."openedAt",next."id" LIMIT 1
  ) n ON TRUE LEFT JOIN LATERAL (
    SELECT previous."id",previous."companyId",previous."storeId",previous."terminalPos",previous."status",previous."openedAt",previous."closedAt",previous."openedByName"
    FROM "CashShiftSession" previous WHERE previous."companyId"=s."companyId" AND previous."storeId"=s."storeId" AND previous."terminalPos"=s."terminalPos"
      AND (previous."openedAt"<s."openedAt" OR (previous."openedAt"=s."openedAt" AND previous."id"<s."id")) ORDER BY previous."openedAt" DESC,previous."id" DESC LIMIT 1
  ) p ON TRUE WHERE s."id"=${id} AND s."companyId"=${scope.companyId} AND s."storeId"=${scope.storeId} LIMIT 1`;
  const {automaticSnapshot,...session}=rows[0]||{};
  if(!session||session.companyId!==scope.companyId||session.storeId!==scope.storeId||session.id!==id||!session.terminalPos)throw reconcileError('CASH_RECONCILIATION_NOT_FOUND',404);
  const transactions=await db.$queryRaw`SELECT to_jsonb(t)-'attachmentData' AS record,md5(COALESCE(to_jsonb(t)->>'attachmentData','')) AS "attachmentDigest",(t."attachmentData" IS NOT NULL) AS "hasAttachment" FROM "StoreTransaction" t WHERE t."companyId"=${scope.companyId} AND t."storeId"=${scope.storeId} AND t."sessionId"=${id} ORDER BY t."id" LIMIT 501`;
  if(transactions.length>500||transactions.some(t=>t.record?.companyId!==scope.companyId||t.record?.storeId!==scope.storeId||t.record?.sessionId!==id))throw reconcileError('CASH_RECONCILIATION_LIMIT');
  const count=await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "CashControlReview" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "sessionId"=${id}`;
  if(!Number.isInteger(count[0]?.count)||count[0].count>500)throw reconcileError('CASH_RECONCILIATION_LIMIT');
  const review=await readCashReviewState(db,{...session,sessionId:id},{enabled:rule.mode!=='POS_EFTPOS_ONLY'});
  const initialCents=exactCents(session.variance),cardCents=exactCents(session.cardVariance),basisCents=review.balance.status==='VALID'?exactCents(review.balance.unexplainedVariance):null;
  const originalTransactions=transactions.map(({record,attachmentDigest})=>({record,attachmentDigest}));
  const sourceHash=hash({version:1,session,transactions:originalTransactions,review,rule});
  const expenseInputs=transactions.map(({record,hasAttachment})=>({...record,hasAttachment,purchaseDocumentId:record.attachmentMimeType===purchaseDocumentMime?record.attachmentFilename:null}));
  const expenseChecks=await readCashExpenseEvidence(db,scope,expenseInputs);
  const expenseFindings=cashExpenseFindings(expenseChecks).map(f=>({code:f.code,amountCents:exactCents(f.amount),occurredAt:f.at?new Date(f.at).toISOString():null,transactionId:f.transactionId,evidenceHash:hash(f)}));
  const eventSales=await readCashEventSales(db,scope,session);
  const next=session.nextSession;
  const nextClosed=Boolean(next&&next.companyId===scope.companyId&&next.storeId===scope.storeId&&next.terminalPos===session.terminalPos&&next.status==='CLOSED'&&next.closedAt&&new Date(next.closedAt)>=new Date(next.openedAt)&&new Date(session.closedAt)<=new Date(next.openedAt));
  return {session,sourceHash,...(automaticSnapshot?{automaticSnapshot,automaticTransactions:transactions.map(t=>t.record)}:{}),expenseFindings,eventSales,initialCents,cardCents,basisCents,reviewStatus:review.balance.status,explainedCents:exactCents(review.balance.explainedAmount),nextClosed,
    transactions:transactions.map(t=>({id:t.record.id,type:t.record.type,amountCents:exactCents(t.record.amount),reversed:Boolean(t.record.reversedAt),cashEffect:t.record.subtractFromShift===true,occurredAt:t.record.occurredAt}))};
}
test('source keeps the hard review bound outside swallowed state errors and falls back to legacy count only when detailed read fails',async()=>{
 const row={sourceIsolation:'repeatable read',id:'shift',companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',variance:0,cardVariance:0,openedAt:new Date('2026-11-01T06:00:00Z'),closedAt:new Date('2026-11-01T14:00:00Z'),nextSession:null,previousSession:null};
 for(const scenario of ['500','501','read-error','read-error-limit','read-error-invalid-count']){
  const calls=[],db={$queryRaw:async(strings)=>{const sql=strings.join('');calls.push(sql);
   if(sql.includes('FROM "CashShiftSession" s'))return [row];if(sql.includes('AS "attachmentDigest"'))return [];
   if(sql.includes('COUNT(*)::int AS count'))return [{count:scenario==='read-error-limit'?501:scenario==='read-error-invalid-count'?'0':0}];
   if(sql.includes('FROM "CashControlReview"')){if(scenario.startsWith('read-error'))throw Error('private detailed source error');return Array.from({length:Number(scenario)},(_,i)=>({id:String(i),decision:'REVIEWED_NO_CHANGE',amount:0,snapshotJson:{},createdAt:new Date('2026-11-01T15:00:00Z')}));}
   if(sql.includes('to_regclass'))return[{auditTable:null,completionTable:null}];throw Error('unexpected extra source read');
  }};
  if(['501','read-error-limit','read-error-invalid-count'].includes(scenario))await assert.rejects(readReconciliationSession(db,scope,'shift',rule),e=>e.code==='CASH_RECONCILIATION_LIMIT');
  else{const result=await readReconciliationSession(db,scope,'shift',rule);assert.equal(result.reviewStatus,scenario==='read-error'?'UNAVAILABLE':'RECHECK_REQUIRED');}
  assert.equal(calls.filter(s=>s.includes('COUNT(*)::int AS count')).length,scenario.startsWith('read-error')?1:0);
  assert.equal(calls.filter(s=>s.includes('FROM "CashControlReview"')&&!s.includes('COUNT(*)')).length,1);assert(calls.find(s=>s.includes('FROM "CashControlReview"')&&!s.includes('COUNT(*)')).includes('LIMIT 501'));
 }
});
test('native exact loaded-ledger review snapshot preserves legacy source/report hashes and immutable controls with two fewer queries per session',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='cash_snapshot_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openedBy" text,"openedByName" text,"shiftLabel" text,"openedAt" timestamptz,"closedAt" timestamptz,"variance" numeric,"cardVariance" numeric,"openingOperational" numeric,"actualOperational" numeric,"updatedAt" timestamptz)',
   'CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric,"attachmentData" text,"attachmentMimeType" text,"attachmentFilename" text,"subtractFromShift" boolean,"occurredAt" timestamptz,"createdAt" timestamptz,"reversedAt" timestamptz)',
   'CREATE TABLE "CashControlReview"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"decision" text,"amount" numeric,"note" text,"actorId" text,"actorName" text,"snapshotJson" jsonb,"createdAt" timestamptz)'
  ])await db.$executeRawUnsafe(sql);
  for(const id of ['decimal','precision','bounds','nulls','empty','guard'])await db.$executeRaw`INSERT INTO "CashShiftSession" VALUES (${id},'co','store',${id},'CLOSED',${'operator-'+id},'Synthetic','Day','2026-11-01T06:00:00Z','2026-11-01T14:00:00Z',-5,0,100,95,'2026-11-01T14:00:00Z')`;
  let counter=0;
  const movement=async(sessionId,amount,type='SALE_CASH',createdAt='2026-11-01T09:00:00.123456Z',reversedAt=null,companyId='co',storeId='store')=>db.$executeRaw`INSERT INTO "StoreTransaction" VALUES (${'t-'+(++counter)},${companyId},${storeId},${sessionId},${type},${amount}::numeric,NULL,NULL,NULL,true,${createdAt}::timestamptz,${createdAt}::timestamptz,${reversedAt}::timestamptz)`;
  await movement('decimal','0.1');await movement('decimal','0.2','SALE_CARD');await movement('decimal','-0.75','SUPPLIER_PAYMENT');await movement('decimal','2.1234','OTHER_EXPENSE');await movement('decimal','999','OTHER_EXPENSE','2026-11-01T10:00:00.000999Z','2026-11-01T11:00:00.999999Z');
  await movement('precision','1.00000000000000000001');await movement('precision','-1');await movement('bounds','999999999999.99');await movement('bounds','-999999999999.98','OTHER_EXPENSE');
  await movement('nulls',null,'SALE_CASH',null);await movement('nulls','-9','OTHER_EXPENSE',null,'2026-11-01T12:00:00.000999+02:00');await movement('nulls','0','SALE_CASH','2026-11-01T11:00:00.000001+01:00');
  await movement('decimal','800','OTHER_EXPENSE','2026-11-01T13:00:00Z',null,'foreign','store');await movement('decimal','900','SALE_IRIS','2026-11-01T13:00:00Z',null,'co','control');
  const ids=['decimal','precision','bounds','nulls','empty'];
  for(const id of ids){const snapshot=await readCashReviewSnapshot(db,'co','store',id);await db.$executeRaw`INSERT INTO "CashControlReview" VALUES (${'r-'+id},'co','store',${id},'EXPLANATION',0.1,'Synthetic proof','auditor','Synthetic',${JSON.stringify(snapshot)}::jsonb,'2026-11-01T15:00:00.000001Z')`;}
  const rows=()=>Promise.all(['CashShiftSession','StoreTransaction','CashControlReview'].map(table=>db.$queryRawUnsafe(`SELECT to_jsonb(x) AS record FROM "${table}" x ORDER BY "id"`)));
  const before=await rows();
  const trace=tx=>{const calls=[];return {calls,db:new Proxy(tx,{get(target,key){if(key==='$queryRaw')return async(strings,...values)=>{calls.push(strings.join(''));return target.$queryRaw(strings,...values);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}})};};
  const compare=(id,isolationLevel='RepeatableRead')=>db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');const actual=trace(tx),old=trace(tx);
   const result=await readReconciliationSession(actual.db,scope,id,rule),legacy=await legacyReconciliationSession(old.db,scope,id,rule);
   assert.deepEqual(result,legacy,'full source and sourceHash match the pre-reuse native reader');
   const source=s=>({store:{id:'store',companyId:'co',name:'Synthetic'},rule,period:{from:'2026-11-01',to:'2026-11-01'},selectedIds:[id],sessions:new Map([[id,s]]),coverage:'BOUNDED_CLOSED_SHIFTS',limit:200});
   assert.deepEqual(projectReconciliation(source(result),[]),projectReconciliation(source(legacy),[]),'canonical report values/text/hash retain exact parity');
   const reused=isolationLevel!=='ReadCommitted';assert.equal(actual.calls.filter(s=>s.includes('COUNT(*)::int AS count')&&s.includes('CashControlReview')).length,reused?0:1);assert.equal(actual.calls.filter(s=>s.includes('COUNT(*)::int AS "transactionCount"')).length,reused?0:1);assert.equal(actual.calls.filter(s=>s.includes('FROM "CashControlReview"')).length,reused?1:2);
   assert.equal(old.calls.filter(s=>s.includes('COUNT(*)::int AS count')&&s.includes('CashControlReview')).length,1);assert.equal(old.calls.filter(s=>s.includes('COUNT(*)::int AS "transactionCount"')).length,1);assert.equal(actual.calls.length,old.calls.length-(reused?2:0));
   assert(!JSON.stringify(result).includes('snapshotAmount'),'the exact amount sidecar stays out of every source/DTO/hash projection');assert(!JSON.stringify(result).includes('sourceIsolation'),'the internal isolation sidecar is excluded too');return result;
  },{isolationLevel,timeout:15000});
  for(const id of ids)await compare(id);await compare('decimal','ReadCommitted');await compare('precision','Serializable');assert.deepEqual(await rows(),before);
  const exactRows=await db.$queryRaw`SELECT to_jsonb(t) AS record,t."amount"::text AS "snapshotAmount" FROM "StoreTransaction" t WHERE t."companyId"='co' AND t."storeId"='store' AND t."sessionId"='precision' ORDER BY t."id"`;
  assert.equal(exactRows[0].record.amount,1);assert.equal(cashReviewSnapshotFromLoadedTransactions({companyId:'co',storeId:'store',id:'precision'},exactRows).activeTotal,1e-20);
  const first=await compare('decimal');await movement('decimal','0.01');const fresh=await compare('decimal');assert.notEqual(fresh.sourceHash,first.sourceHash);assert.equal(fresh.reviewStatus,'RECHECK_REQUIRED','later requests cannot reuse an earlier snapshot');
  await db.$executeRaw`INSERT INTO "CashControlReview" SELECT 'guard-'||g,'co','store','guard','REVIEWED_NO_CHANGE',0,'Synthetic bound','auditor','Synthetic','{}'::jsonb,'2026-11-01T15:00:00Z'::timestamptz FROM generate_series(1,500) g`;
  await compare('guard');await db.$executeRaw`INSERT INTO "CashControlReview" VALUES ('guard-501','co','store','guard','REVIEWED_NO_CHANGE',0,'Synthetic bound','auditor','Synthetic','{}'::jsonb,'2026-11-01T15:00:00Z')`;
  const limitedBefore=await rows();for(const reader of [readReconciliationSession,legacyReconciliationSession])await assert.rejects(db.$transaction(tx=>reader(tx,scope,'guard',rule),{isolationLevel:'RepeatableRead',timeout:15000}),e=>e.code==='CASH_RECONCILIATION_LIMIT');assert.deepEqual(await rows(),limitedBefore);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});
test('static source traces preserve six legacy reads in ReadCommitted and four stable-snapshot reads in RepeatableRead/Serializable',async()=>{
 for(const sourceIsolation of ['repeatable read','serializable','read committed',undefined,'unexpected']){
  const calls=[],row={id:'shift',companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',variance:0,cardVariance:0,openedAt:new Date('2026-11-01T06:00:00Z'),closedAt:new Date('2026-11-01T14:00:00Z'),nextSession:null,previousSession:null,...(sourceIsolation?{sourceIsolation}:{})};
  const db={$queryRaw:async(strings)=>{const sql=strings.join('');calls.push(sql);if(sql.includes('FROM "CashShiftSession" s'))return[row];if(sql.includes('AS "attachmentDigest"'))return[];if(sql.includes('COUNT(*)::int AS count'))return[{count:0}];if(sql.includes('COUNT(*)::int AS "transactionCount"'))return[{transactionCount:0,activeTotal:0,expenseTotal:0,reversedCount:0,lastMovementAt:null}];if(sql.includes('FROM "CashControlReview"'))return[];if(sql.includes('to_regclass'))return[{auditTable:null,completionTable:null}];throw Error('Unexpected source read');}};
  const result=await readReconciliationSession(db,scope,'shift',rule),reused=['repeatable read','serializable'].includes(sourceIsolation);assert.equal(result.reviewStatus,'VALID');assert.equal(calls.filter(s=>s.includes('COUNT(*)::int AS count')).length,reused?0:1);assert.equal(calls.filter(s=>s.includes('COUNT(*)::int AS "transactionCount"')).length,reused?0:1);assert.equal(calls.filter(s=>s.includes('FROM "CashControlReview"')).length,reused?1:2);assert.equal(calls.some(s=>s.includes('FROM "CashControlReview"')&&s.includes('LIMIT 501')),reused);assert.equal(calls.length,reused?4:6);assert(!Object.hasOwn(result.session,'sourceIsolation'));
 }
});
