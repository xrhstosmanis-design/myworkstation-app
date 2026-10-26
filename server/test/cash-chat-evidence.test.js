import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCashChatEvidence} from '../src/services/cash-chat-evidence.js';
import {cashHandoffEvidence,readCashReviewEvidence} from '../src/services/cash-review-evidence.js';
import {readCashExpenseEvidence,cashExpenseFindings} from '../src/services/cash-expense-evidence.js';
import {partitionCashAuditEvents} from '../src/services/cash-audit-association.js';
import {confirmedExplanationBalance} from '../src/services/cash-review-balance.js';
import {cashChatEvidenceLines} from '../../client/src/lib/cash-chat-evidence.js';
import {effectiveModuleEnabled} from '../src/middleware/module-access.js';
const scope={companyId:'company',storeId:'store'};
const attachment=(id,extra={})=>({...scope,id,attachmentName:'sheet.jpg',attachmentMimeType:'image/jpeg',attachmentChecksum:'a'.repeat(64),createdAt:new Date('2026-10-26T10:00Z'),category:'GENERAL',...extra});
const shift=(sessionId,openedAt,closedAt,extra={})=>({...scope,sessionId,terminalPos:'MAIN',openedAt,closedAt,status:'CLOSED',variance:0,openingOperational:100,actualOperational:100,...extra});
const current=shift('current','2026-10-25T22:00Z','2026-10-26T06:00Z');

test('chat reader selects only bounded owned metadata; repeated file retains both message identities, upload never becomes shift date',async()=>{
 const calls=[],rows=[attachment('late'),attachment('copy'),attachment('no-checksum',{attachmentChecksum:null})];
 const original=JSON.stringify(rows),db={$queryRaw:async(strings,...values)=>{calls.push({sql:strings.join('?'),values});return rows;}};
 const result=await readCashChatEvidence(db,scope);
 assert.equal(result.sources.length,2);assert.deepEqual(result.sources[0].references.map(r=>r.messageId),['late','copy']);
 assert.equal(result.sources[0].sessionId,null);assert.equal(result.sources[0].documentDate,null);assert.equal(result.sources[0].readingStatus,'NOT_READ');
 assert.equal(result.documentAssociation,'UNVERIFIED');assert.equal(result.complete,false);assert.equal(JSON.stringify(rows),original);
 assert.deepEqual(calls[0].values,['company','store']);assert.match(calls[0].sql,/LIMIT 51/);
 const select=calls[0].sql.split('FROM')[0];assert.doesNotMatch(select,/attachmentData|body|senderId/);
 assert.doesNotMatch(calls[0].sql,/INSERT|UPDATE|DELETE|CREATE|ALTER/);
 assert.match(cashChatEvidenceLines({chatEvidence:result}).join('\n'),/εκκρεμούν|Εκκρεμούν/);
});
test('missing/foreign/unsupported/duplicate/over-limit chat source is never a complete agreement',async()=>{
 const missing=await readCashChatEvidence({$queryRaw:()=>{throw Error('missing table')}},scope);assert.equal(missing.status,'UNAVAILABLE');
 for(const row of [attachment('foreign',{storeId:'other'}),attachment('foreign',{companyId:'other'}),attachment('audio',{attachmentMimeType:'audio/webm'})])assert.equal((await readCashChatEvidence({$queryRaw:async()=>[row]},scope)).status,'UNAVAILABLE');
 const duplicate=await readCashChatEvidence({$queryRaw:async()=>[attachment('same'),attachment('same')]},scope);assert.equal(duplicate.status,'UNAVAILABLE');
 const capped=await readCashChatEvidence({$queryRaw:async()=>Array.from({length:51},(_,i)=>attachment(String(i),{attachmentChecksum:null}))},scope);assert.equal(capped.status,'LIMITED');assert.equal(capped.sources.length,50);assert.equal(capped.complete,false);
 const empty=await readCashChatEvidence({$queryRaw:async()=>[]},scope);assert.equal(empty.status,'NO_ATTACHMENTS_IN_DISCOVERY');assert.equal(empty.complete,false);
 let calls=0;assert.equal((await readCashChatEvidence({$queryRaw:()=>{calls++;}},{})).status,'UNAVAILABLE');assert.equal(calls,0);
});
test('actual handoff compares only immediate operational amounts across midnight; no card offset or liability',()=>{
 const prior=shift('prior','2026-10-25T14:00Z',current.openedAt,{actualOperational:101.25,cardVariance:500});
 const next=shift('next',current.closedAt,'2026-10-26T14:00Z',{openingOperational:98,cardVariance:2});
 const foreign={...next,sessionId:'foreign',storeId:'other'},before=JSON.stringify([current,prior,next]);
 const out=cashHandoffEvidence(current,[prior,next,foreign]);assert.equal(out.rows.length,2);assert.deepEqual(out.rows.map(r=>r.difference),[-1.25,-2]);assert(out.rows.every(r=>r.status==='MISMATCH'));assert.equal(out.employeeLiabilityAdjusted,false);assert.equal(JSON.stringify([current,prior,next]),before);
 assert.doesNotMatch(JSON.stringify(out),/cardVariance|foreign/);
 assert.match(cashChatEvidenceLines({handoffs:out}).join('\n'),/υπό έλεγχο/);
});
test('open/overlap/missing/duplicate handoffs and last shift remain explicit rather than zero',()=>{
 assert.equal(cashHandoffEvidence(current,[]).rows[0].status,'AWAITING_NEXT_SHIFT');
 const next=shift('next',current.closedAt,null,{status:'OPEN'});const open=cashHandoffEvidence(current,[next]);assert.equal(open.rows[0].nextShiftClosed,false);
 const overlap=shift('next','2026-10-26T05:00Z','2026-10-26T14:00Z');assert.equal(cashHandoffEvidence(current,[overlap]).rows[0].status,'OVERLAP');
 for(const value of [null,undefined,'',' ',false,NaN,Infinity]){const out=cashHandoffEvidence(current,[{...next,openingOperational:value}]);assert.equal(out.rows[0].status,'MISSING_AMOUNTS');assert.equal(out.rows[0].difference,null);}
 assert.equal(cashHandoffEvidence(current,[{...current}]).status,'UNAVAILABLE');
 assert.equal(cashHandoffEvidence({...current,auditRule:{mode:'POS_EFTPOS_ONLY'}},[]).status,'NOT_APPLICABLE');
});
test('shared evidence keeps actual source amounts and chat failure isolated from sale/chain reads',async()=>{
 const calls=[],db={$queryRaw:async(strings,...values)=>{const sql=strings.join('');calls.push(sql);if(sql.includes('StoreChatMessage'))throw Error('offline');return [];}};
 const out=await readCashReviewEvidence(db,current);assert.equal(out.chatEvidence.status,'UNAVAILABLE');assert.equal(out.salesStatus,'LINKED_POS_SCOPE');assert.equal(out.handoffs.rows[0].status,'AWAITING_NEXT_SHIFT');
 calls.length=0;const denied=await readCashReviewEvidence(db,current,{includeChat:false});assert.equal(denied.chatEvidence.status,'NOT_AUTHORIZED');assert(!calls.some(s=>s.includes('StoreChatMessage')));
});
test('actual registered cloud reader authorizes Owner before chat reads, keeps original cash/card and refuses cross-store first',async()=>{
 const source=readFileSync(new URL('../src/routes/cash-control.js',import.meta.url),'utf8');
 const route=source.slice(source.indexOf('router.get("/sessions/:sessionId/investigation"'),source.indexOf('router.post("/sessions/:sessionId/reviews"'));
 let handler,denied=false,chatReads=0,override=null;
 const db={$queryRaw:async strings=>{const sql=strings.join('');if(sql.includes('SELECT s.*'))return [{...current,id:'current',variance:-3,cardVariance:8}];if(sql.includes('StorePaidModule'))return override?[override]:[];if(sql.includes('StoreChatMessage')){chatReads++;return [attachment('sheet')];}return [];}};
 const deps={router:{get:(_path,fn)=>handler=fn},route:fn=>fn,prisma:db,normalize:x=>x,assertStoreAccess:()=>{if(denied)throw Error('store denied')},ownedStore:async()=>({}),cashControlRule:async()=>({mode:'FULL'}),existingAuditTables:async()=>({}),partitionCashAuditEvents,readCashExpenseEvidence,cashExpenseFindings,readCashReviewEvidence,effectiveModuleEnabled,suspiciousOperatorEvent:()=>false,auditAmount:()=>null,money:v=>Number(v||0),reviewSnapshot:async()=>({}),sameSnapshot:()=>true,confirmedExplanationBalance};
 new Function(...Object.keys(deps),route)(...Object.values(deps));
 const invoke=async(user,license={licenseAllowed:true,activeModules:['STORE_CHAT']})=>{let result;await handler({params:{sessionId:'current'},user:{companyId:'company',...user},license},{json:x=>result=x});return result;};
 const out=await invoke({role:'OWNER'});assert.equal(chatReads,1);assert.equal(out.reviewEvidence.chatEvidence.sources[0].references[0].messageId,'sheet');assert.equal(out.initialVariance,-3);assert.equal(out.cardVariance,8);assert.equal(out.unexplainedVariance,-3);
 assert.equal((await invoke({role:'OWNER',tokenType:'STORE_OPERATOR'})).reviewEvidence,null);assert.equal(chatReads,1);
 for(const value of [{licenseAllowed:false,activeModules:['STORE_CHAT']},{licenseAllowed:true,activeModules:[]}]){assert.equal((await invoke({role:'OWNER'},value)).reviewEvidence.chatEvidence.status,'NOT_AUTHORIZED');assert.equal(chatReads,1);}
 override={active:false};assert.equal((await invoke({role:'OWNER'})).reviewEvidence.chatEvidence.status,'NOT_AUTHORIZED');assert.equal(chatReads,1);
 override={active:true,endsAt:new Date('2020-01-01')};assert.equal((await invoke({role:'OWNER'})).reviewEvidence.chatEvidence.status,'NOT_AUTHORIZED');assert.equal(chatReads,1);
 denied=true;await assert.rejects(invoke({role:'OWNER'}),/store denied/);assert.equal(chatReads,1);
});
