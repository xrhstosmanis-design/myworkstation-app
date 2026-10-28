import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInvoiceAuditEmailPayload,INVOICE_AUDIT_BACKOFFICE_URL} from '../src/services/invoice-audit-email-payload.js';

const report=(patch={})=>({store:{id:'s',name:'<img src=x>\r\nBcc: private'},period:{month:'2026-10'},asOf:'2026-10-28T12:00:00Z',readOnly:true,fingerprint:'SECRET_FINGERPRINT',coverage:{complete:true,unavailable:[],limited:[]},summary:{logicalRecords:120,unposted:100,uploadedAwaitingReview:1,possibleDuplicates:2,identityReview:3,credits:1,inactive:0},items:[{id:'SECRET_SOURCE_ID',documentNumber:'A 1',supplierName:'<script>bad</script>',issueDay:'2026-10-01',totalCents:1234,categories:['POSSIBLE_DUPLICATE','UNPOSTED_DOCUMENT'],reasons:['Compare originals'],rawPayload:'SECRET_RAW'}],nextPage:'SECRET_PAGE',pendingOriginals:{available:true,counts:{total:75,missingOriginal:60,uploadedAwaitingReview:10,reviewRequired:5},items:[{documentNumber:'OLD 1',supplierName:'Old supplier',documentDate:'2025-01-01',status:'AWAITING_INVOICE',attachmentData:'SECRET_ORIGINAL'}],truncated:true},...patch});
test('preview permits actual findings and separates exact counts, bounded details and all-month pending without private payloads',()=>{
 const p=buildInvoiceAuditEmailPayload(report());assert.equal(p.summary.logicalRecords,120);assert.equal(p.details.items.length,1);assert.equal(p.details.truncated,true);assert.equal(p.pendingOriginals.counts.total,75);assert.equal(p.pendingOriginals.period,'ALL_MONTHS');assert.equal(p.pendingOriginals.truncated,true);
 assert.match(p.body,/Πιθανό διπλό/);assert.match(p.body,/Όλοι οι μήνες/);assert.match(p.body,/2025-01-01/);assert.match(p.body,/Δεν έχει καταχωριστεί/);assert.match(p.body,/αποστολή είναι απενεργοποιημένη/);assert.doesNotMatch(p.subject,/[\r\n]/);assert.match(p.subject,/<img src=x>/);assert.equal(p.backofficeUrl,INVOICE_AUDIT_BACKOFFICE_URL);assert.doesNotMatch(JSON.stringify(p),/SECRET_/);
});
test('incomplete coverage stays unknown and never invents all-clear or zero totals',()=>{
 const p=buildInvoiceAuditEmailPayload(report({coverage:{complete:false,unavailable:['documents'],limited:['inbound']},summary:null,items:[],nextPage:null,pendingOriginals:{available:false,counts:null,items:[]}}));
 assert.equal(p.summary,null);assert.deepEqual(p.details.items,[]);assert.equal(p.pendingOriginals.counts,null);assert.match(p.body,/ΑΓΝΩΣΤΗ/);assert.match(p.body,/όχι μηδενικό/);assert.doesNotMatch(p.body,/δεν εντοπίστηκαν|Σύνολο: 0/i);
});
test('invalid known counts fail closed and detail arrays stay bounded',()=>{
 assert.throws(()=>buildInvoiceAuditEmailPayload(report({summary:{logicalRecords:1}})));
 assert.throws(()=>buildInvoiceAuditEmailPayload(report({asOf:'invalid'})));
 const r=report();r.items=Array.from({length:80},()=>r.items[0]);r.pendingOriginals.items=Array.from({length:80},()=>r.pendingOriginals.items[0]);const p=buildInvoiceAuditEmailPayload(r);assert.equal(p.details.items.length,50);assert.equal(p.pendingOriginals.items.length,50);
});
