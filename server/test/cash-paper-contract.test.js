import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {paperCents,normalizePaper,validatePaperSource,paperKey,paperRequest} from '../src/services/cash-paper-contract.js';
const raw=(extra={})=>({dateText:'21/10/2026',documentDate:'2026-10-21',operatorText:'Test',shiftText:'Morning',notes:[],lines:[{kind:'CASHBOX',label:'Cashbox',amountText:'1.234,56',quantityText:null,timeText:null,uncertain:false}],...extra});
test('cash-paper contract keeps exact cents and rejects ambiguous, absent and expression values rather than using zero',()=>{
 for(const [value,cents] of [['1.234,56',123456],['1 234,56',123456],['12,3',1230],['12.34',1234],['−0,25',-25],['0',0],['100 €',10000]])assert.equal(paperCents(value),cents);
 for(const value of [null,undefined,'','1.234','12+4','1,234.56','0?','NaN',10,'10000000000'])assert.equal(paperCents(value),null);
 const out=normalizePaper(raw());assert.equal(out.lines[0].amountCents,123456);assert.equal(out.associationVerified,false);assert.equal(out.employeeLiabilityAdjusted,false);
 const unknown=normalizePaper(raw({lines:[{...raw().lines[0],amountText:null}]}));assert.equal(unknown.lines[0].amountCents,null);assert.equal(unknown.lines[0].requiresReview,true);
});
test('paper date requires an explicit valid printed year and rejects conflicting ISO; upload context and invented dates cannot verify it',()=>{
 assert.equal(normalizePaper(raw()).documentDate,'2026-10-21');
 for(const [dateText,documentDate] of [['21/10','2026-10-21'],['31/02/2026','2026-02-31'],['21/10/2026','2026-10-22'],[null,'2026-10-21']])assert.equal(normalizePaper(raw({dateText,documentDate})).documentDate,null);
 assert.equal(normalizePaper(raw({dateText:'29/02/2024',documentDate:'2024-02-29'})).documentDate,'2024-02-29');
 assert.throws(()=>normalizePaper({...raw(),associationVerified:true}));assert.throws(()=>normalizePaper(raw({lines:Array.from({length:61},()=>raw().lines[0])})));
});
test('original source scope, MIME, actual checksum, declared size and generation prevent cross-store or changed-source reuse',()=>{
 const bytes=Buffer.from('%PDF-test'),checksum=createHash('sha256').update(bytes).digest('hex'),scope={companyId:'c',storeId:'s',generation:'0'};
 const row={id:'m',companyId:'c',storeId:'s',attachmentName:'paper.pdf',attachmentMimeType:'application/pdf',attachmentSize:bytes.length,attachmentChecksum:checksum,attachmentData:bytes.toString('base64')};
 assert.equal(validatePaperSource(row,scope,checksum).bytes.toString(),'%PDF-test');
 for(const changed of [{storeId:'other'},{companyId:'other'},{attachmentChecksum:'a'.repeat(64)},{attachmentSize:1},{attachmentMimeType:'audio/webm'},{attachmentData:'invalid!'}])assert.throws(()=>validatePaperSource({...row,...changed},scope,checksum));
 assert.notEqual(paperKey(scope,checksum),paperKey({...scope,storeId:'other'},checksum));assert.notEqual(paperKey(scope,checksum),paperKey({...scope,generation:'1'},checksum));
 assert.throws(()=>paperKey({...scope,generation:'9223372036854775808'},checksum));assert.equal(paperRequest.safeParse({messageId:'m',checksum,generation:'0',role:'SUPER_ADMIN'}).success,false);
});

// The stored one-call LAB shape is replayed locally; this is not a new provider read.
test('missing model ISO derives only from one complete exact printed date without mutating raw extraction',()=>{
 const stored=raw({dateText:'27/10/2026',documentDate:null,operatorText:'LAB POS 2',shiftText:null,lines:[
  {kind:'CLOSING_CASH',label:'ΛΗΞΗ ΜΕΤΡΗΤΩΝ',amountText:'9,40€',quantityText:null,timeText:'19:24:28',uncertain:false},
  ...['MYWORKSTATION LAB','LAB POS 2','MAIN','ΚΛΕΙΣΙΜΟ ΤΑΜΕΙΟΥ','ΗΜΕΡΟΜΗΝΙΑ'].map(label=>({kind:'OTHER',label,amountText:null,quantityText:null,timeText:null,uncertain:false}))]});
 const before=structuredClone(stored),result=normalizePaper(stored);
 assert.equal(result.documentDate,'2026-10-27');assert.deepEqual(stored,before);
 assert.equal(result.dateText,'27/10/2026');assert.equal(result.lines.length,6);assert.equal(result.lines[0].amountCents,940);
 assert.equal(result.lines[0].timeText,'19:24:28');assert.equal(result.associationVerified,false);
 assert.equal(result.employeeLiabilityAdjusted,false);assert.equal(result.readingOnly,true);
 for(const dateText of ['2026-10-27','27/10/2026','27.10.2026','27-10-2026',' 27/10/2026 ','7/1/2026'])
  assert.equal(normalizePaper(raw({dateText,documentDate:null})).documentDate,dateText==='7/1/2026'?'2026-01-07':'2026-10-27');
 assert.equal(normalizePaper(raw({dateText:'29/02/2024',documentDate:null})).documentDate,'2024-02-29');
 for(const dateText of [null,'','27/10','27/10/26','31/02/2026','29/02/2026','00/10/2026','27/13/2026','27/10-2026','27/10/2026?','?27/10/2026','Ημερομηνία: 27/10/2026','27/10/2026 19:24:28','27/10/2026 ή 28/10/2026'])
  assert.equal(normalizePaper(raw({dateText,documentDate:null})).documentDate,null,JSON.stringify(dateText));
 assert.equal(normalizePaper(raw({dateText:'27/10/2026',documentDate:'2026-10-28'})).documentDate,null);
});
test('single embedded model-confirmed date stays compatible but multiple printed candidates fail closed',()=>{
 assert.equal(normalizePaper(raw({dateText:'Ημερομηνία: 21/10/2026'})).documentDate,'2026-10-21');
 for(const dateText of ['21/10/2026 22/10/2026','21/10/2026 21/10/2026','2026-10-21 / 22/10/2026','21/10/2026 31/02/2026'])
  for(const documentDate of [null,'2026-10-21'])assert.equal(normalizePaper(raw({dateText,documentDate})).documentDate,null,dateText);
});
