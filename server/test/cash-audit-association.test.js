import {readCashReviewState,confirmedExplanationBalance} from "../src/services/cash-review-balance.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cashAuditAssociationContext,classifyCashAuditEvent,partitionCashAuditEvents} from '../src/services/cash-audit-association.js';
const session={id:'shift',sessionId:'shift',companyId:'c',storeId:'s',terminalPos:'MAIN',openedAt:new Date('2026-10-12T04:00Z'),closedAt:new Date('2026-10-12T12:00Z'),variance:-5};
const transactions=[{id:'tx-sale',type:'SALE_CASH',description:'POS πώληση sale-1 · ΜΕΤΡΗΤΑ'},{id:'tx-return',type:'SALE_CASH',description:'POS ΕΣΩΤΕΡΙΚΗ ΕΠΙΣΤΡΟΦΗ return-1 · αρχική old-sale · CASH'},{id:'tx-expense',type:'OTHER_EXPENSE',description:'POS πώληση fake-sale · note'}];
test('explicit session metadata retains post-close audit; time, actor and amount alone never assign a shift',()=>{
 const ctx=cashAuditAssociationContext(session,transactions);
 assert.equal(classifyCashAuditEvent(ctx,{details:{sessionId:'shift',terminalPos:'MAIN'},createdAt:'2026-10-13T01:00Z'}).scope,'SESSION');
 assert.equal(classifyCashAuditEvent(ctx,{actorId:'same',amount:5,createdAt:session.openedAt}).scope,'UNASSIGNED');
 assert.equal(classifyCashAuditEvent(ctx,{relatedSaleId:'sale-1'}).scope,'UNASSIGNED');
 assert.equal(classifyCashAuditEvent(ctx,{saleId:'sale-1'}).scope,'SESSION');
 assert.equal(classifyCashAuditEvent(ctx,{saleId:'sale-10'}).scope,'UNASSIGNED');
 assert.equal(classifyCashAuditEvent(ctx,{saleId:'return-1'}).scope,'SESSION');
 assert.equal(classifyCashAuditEvent(ctx,{saleId:'old-sale'}).scope,'UNASSIGNED');
 assert.equal(classifyCashAuditEvent(ctx,{saleId:'fake-sale'}).scope,'UNASSIGNED');
 assert.equal(classifyCashAuditEvent(ctx,{details:{transactionId:'tx-expense'}}).scope,'SESSION');
});
test('conflicting session/terminal/company/store never fall back to a matching sale or person',()=>{
 const ctx=cashAuditAssociationContext(session,transactions);
 for(const event of [{details:{sessionId:'other'}},{details:{terminalPos:'DELIVERY'}},{companyId:'foreign'},{details:{storeId:'control'}},{sessionId:'shift',details:{sessionId:'other'}}])assert.equal(classifyCashAuditEvent(ctx,{saleId:'sale-1',...event}).scope,'OTHER_SESSION');
 assert.equal(classifyCashAuditEvent(ctx,{saleId:'sale-1',details:{saleId:'different'}}).scope,'UNASSIGNED');
 const dirty=cashAuditAssociationContext(session,[...transactions,{id:'foreign-tx',companyId:'foreign',type:'SALE_CASH',description:'POS πώληση foreign-sale · CASH'}]);
 assert.equal(classifyCashAuditEvent(dirty,{saleId:'foreign-sale'}).scope,'UNASSIGNED');
 assert.equal(classifyCashAuditEvent(dirty,{details:{transactionId:'foreign-tx'}}).scope,'UNASSIGNED');
});
test('partition preserves original evidence and amounts while separating linked, unknown and other-shift events',()=>{
 const events=[{saleId:'sale-1',amount:-5},{saleId:'return-1',relatedSaleId:'old-sale',amount:-5},{saleId:'sale-1',details:{sessionId:'next'},amount:5},{eventType:'LOGOUT',amount:5}];const before=JSON.stringify({session,transactions,events});
 const out=partitionCashAuditEvents(session,transactions,events);assert.equal(out.linked.length,2);assert.equal(out.excluded.length,1);assert.equal(out.unassigned.length,1);assert.equal(JSON.stringify({session,transactions,events}),before);assert.equal(out.linked[1].amount,-5);
});

test('actual platform investigator excludes next-shift return and retains linked post-close evidence plus unassigned warning',async()=>{
 const source=readFileSync(new URL('../src/routes/platform-admin.js',import.meta.url),'utf8'),body=source.slice(source.indexOf('function platformCashAuditAmount('),source.indexOf('function companyView('));
 const events=[{saleId:'sale-1',relatedSaleId:'original',actionType:'RETURN_ITEMS',details:{sessionId:'next',terminalPos:'MAIN',reversalTotal:-5},createdAt:new Date('2026-10-12T13:00Z')},{saleId:'return-1',relatedSaleId:'old-sale',actionType:'RETURN_ITEMS',details:{sessionId:'shift',terminalPos:'MAIN',reversalTotal:-5},createdAt:new Date('2026-10-12T13:01Z')},{saleId:'unknown',actionType:'RETURN_ITEMS',details:{reversalTotal:-5},createdAt:new Date('2026-10-12T13:02Z')}];
 const db={$queryRaw:async strings=>{const sql=strings.join('');return sql.includes('FROM "StoreTransaction"')?transactions:sql.includes('FROM "PosSaleActionAudit"')?events:sql.includes('FROM "StoreOperatorAudit"')?[{eventType:'SALE_COMPLETED',details:{},createdAt:session.closedAt}]:[];}};
 const investigate=new Function('prisma','partitionCashAuditEvents','readCashReviewState',body+';return platformCashInvestigation;')(db,partitionCashAuditEvents,readCashReviewState);
 const result=await investigate(session,{operator:true,actions:true,safety:true,purchaseDocuments:true});assert.equal(result.completed,false);assert.equal(result.auditAssociation.linked,1);assert.equal(result.auditAssociation.excluded,1);assert.equal(result.unassignedAuditEvents.length,1);assert(result.pendingChecks.includes('EVENT_SESSION_LINK'));
 assert.equal(result.findings.filter(f=>f.code==='ACTION_AFTER_SHIFT_CLOSE').length,1);assert.equal(result.findings.filter(f=>f.code==='AMOUNT_MATCHES_CASH_DIFFERENCE').length,1);assert.equal(result.findings.filter(f=>f.code==='AUDIT_RETURN_ITEMS').length,1);assert.equal(result.findings.filter(f=>f.code==='AUDIT_ASSOCIATION_UNRESOLVED').length,1);
});

test('actual cloud investigation returns only linked audit findings and preserves all ledger and review amounts',async()=>{
 const source=readFileSync(new URL('../src/routes/cash-control.js',import.meta.url),'utf8');const start=source.indexOf('router.get("/sessions/:sessionId/investigation"'),end=source.indexOf('router.post("/sessions/:sessionId/reviews"',start);const route=source.slice(start,end);let handler;
 const events=[{saleId:'sale-1',actionType:'RETURN_ITEMS',details:{sessionId:'next',reversalTotal:-5},createdAt:session.closedAt},{saleId:'return-1',relatedSaleId:'old-sale',actionType:'RETURN_ITEMS',details:{sessionId:'shift',reversalTotal:-5},createdAt:session.closedAt},{saleId:'unknown',actionType:'RETURN_ITEMS',details:{reversalTotal:-5},createdAt:session.closedAt}];
 const db={$queryRaw:async strings=>{const sql=strings.join('');return sql.includes('SELECT s.*')?[session]:sql.includes('FROM "StoreTransaction"')?transactions.map(t=>({...t,amount:-5})):sql.includes('FROM "PosSaleActionAudit"')?events:[];}};
 const deps={router:{get:(_path,fn)=>{handler=fn}},route:fn=>fn,prisma:db,normalize:x=>x,assertStoreAccess:()=>{},ownedStore:async()=>({}),cashControlRule:async()=>({mode:'FULL'}),existingAuditTables:async()=>({operator:true,actions:true,safety:true}),partitionCashAuditEvents,confirmedExplanationBalance,suspiciousOperatorEvent:()=>true,auditAmount:d=>Number(d?.reversalTotal)||null,money:v=>Number(v||0),reviewSnapshot:async()=>({}),sameSnapshot:()=>true};
 new Function(...Object.keys(deps),route)(...Object.values(deps));let result;await handler({params:{sessionId:'shift'},user:{companyId:'c'}},{json:x=>{result=x}});
 assert.equal(result.auditAssociation.linked,1);assert.equal(result.auditAssociation.excluded,1);assert.equal(result.unassignedAuditEvents.length,1);assert.equal(result.auditEvents.length,1);assert.equal(result.initialVariance,-5);assert.equal(result.unexplainedVariance,-5);assert.equal(result.transactions.length,3);assert.equal(result.coverageStatus,'PROVISIONAL');assert.equal(result.findings.filter(f=>f.code==='AUDIT_RETURN_ITEMS').length,1);
});
