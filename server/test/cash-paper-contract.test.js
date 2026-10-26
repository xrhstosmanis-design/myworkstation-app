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
test('paper date requires an explicit valid printed year and matching ISO; upload context and invented dates cannot verify it',()=>{
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
