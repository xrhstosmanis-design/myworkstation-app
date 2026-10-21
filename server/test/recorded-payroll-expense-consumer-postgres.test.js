import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readRecordedPayrollExpenseReport} from '../src/services/recorded-payroll-expense-report.js';
import {salesReportCalendar} from '../src/services/sales-report-calendar.js';
import {validateRecordedPayrollExpenseReport,buildRecordedPayrollExpenseCsv,renderRecordedPayrollExpensePage} from '../../client/src/components/commerce/recordedPayrollExpenseView.js';

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const now=new Date('2026-11-03T12:00:00.000Z');
const owner={id:'owner',role:'OWNER',companyId:'c'};
const clone=value=>JSON.parse(JSON.stringify(value));

// Independent parser checks the actual exported bytes, including quoted
// semicolons/newlines/doubled quotes. It does not reuse the export formatter.
function parseCsv(csv){
 assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.endsWith('\r\n'));
 const text=csv.slice(1),rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted;}
  else if(c===';'&&!quoted){row.push(cell);cell='';}
  else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 assert.equal(quoted,false);assert.deepEqual(row,[]);assert.equal(cell,'');return rows;
}
function exported(snapshot){
 const csv=buildRecordedPayrollExpenseCsv(snapshot),rows=parseCsv(csv),index=rows.findIndex(row=>row[0]==='transactionId');assert.ok(index>=0);
 assert.deepEqual(rows[index],['transactionId','occurredAtUTC','occurredAt Europe/Athens','paymentMethod','amountEUR','status','reason','employeeId','employeeName','paymentId']);
 const meta=rows.slice(0,index),items=rows.slice(index+1,index+1+snapshot.sourceCoverage.returnedRowCount),tail=rows.slice(index+1+snapshot.sourceCoverage.returnedRowCount);
 assert.equal(items.length,snapshot.items.length);assert.ok(items.every(row=>row.length===10));
 for(let i=0;i<items.length;i++)assert.equal(items[i][1],snapshot.items[i].occurredAt);
 const metadata=key=>meta.find(row=>row[0]===key)?.[1];
 for(const[key,value]of [['companyId',snapshot.companyId],['storeId',snapshot.storeId],['calendarFrom',snapshot.period.calendarFrom],['calendarTo',snapshot.period.calendarTo],['timeZone','Europe/Athens'],['from',snapshot.period.from],['toExclusive',snapshot.period.toExclusive],['asOf',snapshot.asOf],['settlementVerified','false'],['payrollAttribution','LINKED_ONLY'],['totalRowCount',String(snapshot.sourceCoverage.totalRowCount)],['returnedRowCount',String(snapshot.sourceCoverage.returnedRowCount)],['complete',String(snapshot.sourceCoverage.complete)]])assert.equal(metadata(key),value,key);
 assert.equal(meta.filter(row=>row[0]==='limitation').length,snapshot.limitations.length);
 return {csv,items,tail};
}

const definitions={
 Company:'"id" text primary key,"active" boolean',
 Store:'"id" text primary key,"companyId" text,"active" boolean',
 StorePaidModule:'"id" text primary key,"companyId" text,"storeId" text,"moduleKey" text,"active" boolean,"startsAt" timestamptz,"endsAt" timestamptz',
 StoreTransaction:'"id" text primary key,"companyId" text,"storeId" text,"type" text,"amount" numeric,"paymentMethod" text,"subtractFromShift" boolean,"occurredAt" timestamptz,"reversedAt" timestamptz',
 WorkforceEmployeePayment:'"id" text primary key,"companyId" text,"storeId" text,"employeeId" text,"sourceType" text,"sourceId" text,"amount" numeric,"paymentMethod" text,"approvalStatus" text,"paymentDate" timestamp(3)',
 WorkforceEmployee:'"id" text primary key,"companyId" text,"fullName" text,"active" boolean'
};

// Exercises the real production producer, PostgreSQL SQL, JSON transport,
// strict browser consumer and CSV together. Fixture effects stay in one new
// synthetic schema; no production request, transaction or accepted LAB replay.
export async function runRecordedPayrollExpenseConsumerRegression(db,{subtest=async(_name,fn)=>fn()}={}){
 for(const[name,columns]of Object.entries(definitions))await db.$executeRawUnsafe(`CREATE TABLE "${name}"(${columns})`);
 await db.$executeRaw`INSERT INTO "Company" VALUES('c',true),('x',true)`;
 await db.$executeRaw`INSERT INTO "Store" VALUES('s','c',true),('control','c',true),('foreign','x',true)`;
 await db.$executeRaw`INSERT INTO "StorePaidModule" VALUES('basic','c','s','PERSONNEL_BASIC',true,NULL,NULL),('payroll','c','s','PERSONNEL_PAYROLL',true,NULL,NULL)`;
 const formulaName='=HYPERLINK("x";"y")\nverified name';
 await db.$executeRaw`INSERT INTO "WorkforceEmployee" VALUES('employee','c','Stable beneficiary',true),('formula-employee','c',${formulaName},true),('foreign-employee','x','PRIVATE FOREIGN NAME',true)`;
 const ledger=async(id,amount,{date='2026-10-10T10:00:00.000Z',companyId='c',storeId='s',type='OTHER_EXPENSE',method='CASH_SHIFT',reversedAt=null}={})=>db.$executeRaw`INSERT INTO "StoreTransaction" VALUES(${id},${companyId},${storeId},${type},${amount}::numeric,${method},true,${new Date(date)},${reversedAt?new Date(reversedAt):null})`;
 const payment=async(id,sourceId,amount,{companyId='c',storeId='s',employeeId='employee'}={})=>db.$executeRaw`INSERT INTO "WorkforceEmployeePayment" VALUES(${id},${companyId},${storeId},${employeeId},'STORE_TRANSACTION',${sourceId},${amount}::numeric,'CASH_SHIFT','APPROVED','1999-01-01'::timestamp)`;
 const digest=()=>Promise.all(Object.keys(definitions).map(async name=>(await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count,md5(COALESCE(string_agg(row_to_json(t)::text,',' ORDER BY row_to_json(t)::text),'')) AS digest FROM "${name}" t`))[0]));
 const applied=(day='2026-10-10')=>({storeId:'s',from:day,to:day,timeZone:'Europe/Athens'});
 const produce=async(day='2026-10-10')=>{
  const before=await digest();const report=await readRecordedPayrollExpenseReport({user:owner,...applied(day)},{db,now});assert.deepEqual(await digest(),before);
  const wire=clone(report),snapshot=validateRecordedPayrollExpenseReport(wire,applied(day),{now});assert.deepEqual(snapshot,report);assert.ok(Object.isFrozen(snapshot));assert.ok(Object.isFrozen(snapshot.items));assert.ok(snapshot.items.every(item=>Object.isFrozen(item)&&Object.isFrozen(item.payrollAttribution)));return{report,wire,snapshot};
 };
 await ledger('valid','10.25');await payment('valid-payment','valid','10.25');
 await ledger('refund','-2');await payment('refund-payment','refund','-2');
 await ledger('duplicate','3');await payment('duplicate-a','duplicate','3');await payment('duplicate-b','duplicate','3');
 await ledger('unlinked','4',{method:null});
 await ledger('foreign-link','7');await payment('PRIVATE FOREIGN PAYMENT','foreign-link','7',{companyId:'x',storeId:'foreign',employeeId:'foreign-employee'});
 await ledger('formula','11');await payment('formula-payment','formula','11',{employeeId:'formula-employee'});
 await db.$executeRawUnsafe(`INSERT INTO "StoreTransaction" SELECT 'filler-'||g,'c','s','OTHER_EXPENSE',.01,'CASH_SHIFT',true,'2026-10-10T11:00:00Z'::timestamptz,NULL FROM generate_series(1,101)g`);
 await ledger('control-transaction','100',{storeId:'control'});await ledger('foreign-transaction','100',{companyId:'x',storeId:'foreign'});await ledger('reversed','100',{reversedAt:'2026-10-11T10:00:00Z'});await ledger('different-type','100',{type:'SUPPLIER_PAYMENT'});

 await subtest('native producer JSON reaches immutable consumer and every applied row CSV, with signed/uncertain provenance',async()=>{
  const{wire,snapshot}=await produce();assert.equal(snapshot.items.length,107);assert.equal(snapshot.totals.recordedExpenseCents,3426);assert.equal(snapshot.totals.linkedPayrollCents,2125);assert.equal(snapshot.totals.unattributedExpenseCents,1301);assert.equal(snapshot.totals.attributedTransactionCount,2);
  assert.equal(snapshot.sourceCoverage.payrollAttribution,'LINKED_ONLY');assert.equal(snapshot.settlementVerified,false);
  const csv=exported(snapshot),row=id=>csv.items.find(row=>row[0]===id);assert.equal(csv.items.length,107);assert.equal(new Set(csv.items.map(row=>row[0])).size,107);
  assert.deepEqual(row('valid').slice(3),['CASH_SHIFT','10.25','ATTRIBUTED','','employee','Stable beneficiary','valid-payment']);
  assert.deepEqual(row('refund').slice(4),['-2.00','UNATTRIBUTED','NON_POSITIVE_PAYROLL_AMOUNT','','','']);
  assert.deepEqual(row('duplicate').slice(5),['UNATTRIBUTED','MULTIPLE_WORKFORCE_LINKS','','','']);
  assert.deepEqual(row('foreign-link').slice(5),['UNATTRIBUTED','LINK_SCOPE_MISMATCH','','','']);assert.equal(row('unlinked')[3],'');
  assert.equal(row('formula')[8],"'"+formulaName);assert.ok(csv.csv.includes('""x"";""y""'));assert.ok(csv.csv.includes('\nverified name'));
  for(const privateText of ['PRIVATE FOREIGN NAME','PRIVATE FOREIGN PAYMENT','foreign-employee','control-transaction','foreign-transaction'])assert.equal(csv.csv.includes(privateText),false,privateText);
  assert.deepEqual(csv.tail[0],['totals','recordedExpenseEUR','linkedPayrollEUR','unattributedExpenseEUR']);assert.deepEqual(csv.tail[1],['COMPLETE_LEDGER','34.26','21.25','13.01']);
  // The employee summary is a separate table; pagination here is specifically
  // the transaction table, while CSV must still contain all 107 applied rows.
  const transactionRows=page=>{const body=renderRecordedPayrollExpensePage(snapshot,page).match(/<table><thead><tr><th>Κίνηση<\/th>[\s\S]*?<\/thead><tbody>([\s\S]*?)<\/tbody><\/table>/);assert.ok(body);return(body[1].match(/<tr>/g)||[]).length};
  assert.equal(transactionRows(0),100);assert.equal(transactionRows(1),7);
  wire.items[0].amountCents=999999;assert.equal(buildRecordedPayrollExpenseCsv(snapshot),csv.csv);assert.throws(()=>buildRecordedPayrollExpenseCsv(wire));
 });

 await subtest('native payload corruption, stale applied context and redaction violations cannot become exportable snapshots',async()=>{
  const{report}=await produce();
  for(const mutate of [
   value=>{value.totals.recordedExpenseCents++;},
   value=>{value.items[1].transactionId=value.items[0].transactionId;},
   value=>{value.items.find(item=>item.transactionId==='foreign-link').payrollAttribution.employeeName='PRIVATE FOREIGN NAME';},
   value=>{value.sourceCoverage.complete=false;},
   value=>{value.period.from='2026-10-10T00:00:00.000Z';},
   value=>{value.settlementVerified=true;}
  ]){const wire=clone(report);mutate(wire);assert.throws(()=>validateRecordedPayrollExpenseReport(wire,applied(),{now}));assert.throws(()=>buildRecordedPayrollExpenseCsv(wire));}
  assert.throws(()=>validateRecordedPayrollExpenseReport(clone(report),{...applied(),storeId:'control'},{now}));assert.throws(()=>validateRecordedPayrollExpenseReport(clone(report),applied('2026-10-09'),{now}));
 });

 await subtest('actual Athens DST producer boundaries survive JSON and CSV, including midnight and last included millisecond',async()=>{
  for(const[day,hours]of [['2026-03-29',23],['2026-10-25',25]]){
   const range=salesReportCalendar(day,day);assert.equal((+range.to-+range.from)/3600000,hours);
   await ledger(day+'-before','99',{date:new Date(+range.from-1).toISOString()});await ledger(day+'-first','1.01',{date:range.from.toISOString()});await ledger(day+'-last','2.02',{date:new Date(+range.to-1).toISOString()});await ledger(day+'-after','99',{date:range.to.toISOString()});
   const{snapshot}=await produce(day);assert.equal(snapshot.items.length,2);assert.equal(snapshot.totals.recordedExpenseCents,303);const csv=exported(snapshot);assert.equal(csv.items.find(row=>row[0]===day+'-first')[2],day+' 00:00:00 Europe/Athens');assert.equal(csv.items.find(row=>row[0]===day+'-last')[2],day+' 23:59:59 Europe/Athens');assert.equal(snapshot.period.from,range.from.toISOString());assert.equal(snapshot.period.toExclusive,range.to.toISOString());
  }
  const{snapshot}=await produce('2026-10-12');const csv=exported(snapshot);assert.equal(csv.items.length,0);assert.equal(snapshot.sourceCoverage.complete,true);assert.deepEqual(csv.tail[1],['COMPLETE_LEDGER','0.00','0.00','0.00']);
 });

 await subtest('actual 10001-source overflow remains partial through producer JSON, consumer and all-10000-row CSV without full totals',async()=>{
  await db.$executeRawUnsafe(`INSERT INTO "StoreTransaction" SELECT 'cap-'||g,'c','s','OTHER_EXPENSE',.01,'CASH_SHIFT',true,'2026-05-15T10:00:00Z'::timestamptz,NULL FROM generate_series(1,10001)g`);
  const{report,snapshot}=await produce('2026-05-15');assert.equal(snapshot.sourceCoverage.complete,false);assert.equal(snapshot.sourceCoverage.totalRowCount,10001);assert.equal(snapshot.sourceCoverage.returnedRowCount,10000);assert.equal(snapshot.sourceCoverage.totalsScope,'RETURNED_ROWS');assert.equal(snapshot.totals,null);
  const csv=exported(snapshot);assert.equal(csv.items.length,10000);assert.equal(new Set(csv.items.map(row=>row[0])).size,10000);assert.deepEqual(csv.tail,[]);assert.equal(csv.csv.includes('"COMPLETE_LEDGER"'),false);assert.equal(csv.csv.includes('"totals"'),false);
  const forged=clone(report);forged.totals={recordedExpenseCents:10000};assert.throws(()=>validateRecordedPayrollExpenseReport(forged,applied('2026-05-15'),{now}));assert.throws(()=>buildRecordedPayrollExpenseCsv(forged));
 });
}

test('native recorded payroll producer -> JSON -> strict consumer -> applied CSV contract',{skip:!isolated(),timeout:120000},async t=>{
 const{PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='recorded_payroll_consumer_'+randomUUID().replaceAll('-','');const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);await runRecordedPayrollExpenseConsumerRegression(db,{subtest:(name,fn)=>t.test(name,fn)})}finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
