import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {validateAuditTimes} from '../src/lib/audit-readable-records.js';
import {greeceDateInput} from '../../shared/greece-time.mjs';
import {athensCalendarStart} from '../src/lib/athens-calendar-start.js';

test('Athens audit calendar bounds include post-midnight receipts and DST days',()=>{
  assert.equal(athensCalendarStart('2026-10-12').toISOString(),'2026-10-11T21:00:00.000Z');
  assert.equal(athensCalendarStart('2026-10-12',1).toISOString(),'2026-10-12T21:00:00.000Z');
  const at=new Date('2026-10-11T21:42:42Z');
  assert.ok(at>=athensCalendarStart('2026-10-12')&&at<athensCalendarStart('2026-10-12',1));
  assert.equal((athensCalendarStart('2026-03-29',1)-athensCalendarStart('2026-03-29'))/3600000,23);
  assert.equal((athensCalendarStart('2026-10-25',1)-athensCalendarStart('2026-10-25'))/3600000,25);
  assert.equal(athensCalendarStart('2026-12-31',1).toISOString(),'2026-12-31T22:00:00.000Z');
  assert.equal(athensCalendarStart('2026-02-30'),null);assert.equal(athensCalendarStart(''),null);
});

test('actual Audit filters preserve tenant/store boundaries while using Athens dates',async()=>{
  const s=await readFile(new URL('../src/routes/kiosk-reports-audit.js',import.meta.url),'utf8');
  const start=s.indexOf('const auditFilters='),end=s.indexOf('\n\nfunction requireManagement',start);
  assert.ok(start>=0&&end>start);
  const fallback={from:new Date(0),to:new Date(1),storeId:'owned-store'};
  const filters=new Function('athensCalendarStart','filters','isSuperAdmin','validateAuditTimes','greeceDateInput',s.slice(start,end)+';return auditFilters;')(athensCalendarStart,()=>fallback,req=>req.user.role==='SUPER_ADMIN',validateAuditTimes,greeceDateInput);
  const user={companyId:'owned-company',role:'OWNER'},query={companyId:'foreign-company',from:'2026-10-12',to:'2026-10-12'};
  const own=filters({user,query});assert.equal(own.companyId,'owned-company');assert.equal(own.storeId,'owned-store');
  assert.equal(own.from.toISOString(),'2026-10-11T21:00:00.000Z');assert.equal(own.to.toISOString(),'2026-10-12T21:00:00.000Z');
  assert.equal(filters({user:{...user,role:'SUPER_ADMIN'},query}).companyId,'foreign-company');
  assert.equal(filters({user,query:{}}).from.toISOString(),athensCalendarStart(greeceDateInput()).toISOString());
});

test('actual Audit receipt rows show CASH/CARD without changing legacy external expense labels',async()=>{
  const s=await readFile(new URL('../../client/src/components/commerce/installKioskReportsAuditV2.js',import.meta.url),'utf8');
  const extract=(from,to)=>{const a=s.indexOf(from),b=s.indexOf(to,a);assert.ok(a>=0&&b>a);return s.slice(a,b)};
  const eventLabel=new Function('isPosCancel',extract('const eventLabel=','\nconst financialText=')+';return eventLabel;')(()=>false);
  const paymentLabel=new Function(extract('const paymentLabel=','\nconst onlineAction=')+';return paymentLabel;')();
  const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const row=c=>'<div class="kr-row">'+c.map(v=>'<span>'+v+'</span>').join('')+'</div>';
  const render=new Function('head','row','fmt','esc','eventLabel','auditAmount','auditExpenseReason','financialText','money','paymentLabel',extract('function auditRows(','\nfunction groupedAudit(')+';return auditRows;')(()=>'',row,String,esc,eventLabel,r=>r.amount,()=>'',()=>'',String,paymentLabel);
  const dom=new JSDOM(render([{id:'cash-id',eventType:'CUSTOMER_RECEIPT_CASH',amount:0.30,paymentSource:'EXTERNAL',sourceType:'StoreTransaction'},{id:'card-id',eventType:'CUSTOMER_RECEIPT_CARD',amount:0.50,paymentSource:'EXTERNAL',sourceType:'StoreTransaction'},{id:'legacy-id',eventType:'OTHER_EXPENSE',amount:2,paymentSource:'EXTERNAL',sourceType:'StoreTransaction'}],false));
  const rows=[...dom.window.document.querySelectorAll('.kr-row')].map(el=>el.textContent);
  assert.match(rows[0],/Είσπραξη οφειλής μετρητών.*cash-id.*0.3.*Μετρητά/);assert.doesNotMatch(rows[0],/Εξωτερικά/);
  assert.match(rows[1],/Είσπραξη οφειλής κάρτας.*card-id.*0.5.*Κάρτα/);assert.doesNotMatch(rows[1],/Εξωτερικά/);
  assert.match(rows[2],/Εξωτερικά/);assert.equal(paymentLabel({paymentSource:'CASH_SHIFT'}),'Μετρητά βάρδιας');assert.equal(paymentLabel({paymentSource:'AUDIT_EVENT'}),'Συμβάν');
  dom.window.close();
});
