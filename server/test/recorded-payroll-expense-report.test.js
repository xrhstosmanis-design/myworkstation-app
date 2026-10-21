import test from "node:test";
import assert from "node:assert/strict";
import {readRecordedPayrollExpenseReport} from "../src/services/recorded-payroll-expense-report.js";

const now=new Date("2026-10-21T12:00:00.000Z");
const request={user:{id:"payer",role:"OWNER",companyId:"company"},storeId:"store",from:"2026-10-20",to:"2026-10-20",timeZone:"Europe/Athens"};
const scope={companyId:"company",companyActive:true,storeId:"store",storeActive:true};
const moduleRow=moduleKey=>({companyId:"company",storeId:"store",moduleKey,active:true,startsAt:null,endsAt:null});
const modules=()=>[moduleRow("PERSONNEL_BASIC"),moduleRow("PERSONNEL_PAYROLL")];
const row=(overrides={})=>({transactionId:"expense",occurredAt:new Date("2026-10-20T10:00:00Z"),amount:"12.34",paymentMethod:"CASH_SHIFT",reviewReason:null,paymentId:"payment",employeeId:"beneficiary",employeeName:"Recorded employee",totalRowCount:"1",...overrides});
const empty=()=>row({transactionId:null,occurredAt:null,amount:null,paymentMethod:null,reviewReason:null,paymentId:null,employeeId:null,employeeName:null,totalRowCount:"0"});
const unattributed=(overrides={})=>row({reviewReason:"NO_WORKFORCE_LINK",paymentId:null,employeeId:null,employeeName:null,...overrides});

function fixture({rows=[row()],owned=[scope],packages=modules(),error=null}={}){
  const calls=[];
  let transactions=0;
  const tx={
    async $executeRawUnsafe(sql){calls.push({type:"statement",sql});},
    async $queryRaw(strings,...values){
      const sql=strings.join("?");calls.push({type:"query",sql,values});
      if(sql.includes('FROM "Company"'))return owned;
      if(sql.includes('FROM "StorePaidModule"'))return packages;
      if(sql.includes("WITH ledger")){if(error)throw error;return rows;}
      throw Error("Unexpected fixture query");
    }
  };
  return {calls,get transactions(){return transactions;},db:{async $transaction(callback,options){transactions++;calls.push({type:"transaction",options});return callback(tx);}}};
}
const read=(f,input=request)=>readRecordedPayrollExpenseReport(input,{db:f.db,now});
const rejectsStatus=(promise,status,code)=>assert.rejects(promise,error=>error.status===status&&(!code||error.code===code));

test("recorded expense reader uses one read-only repeatable snapshot and stable beneficiary rather than payer",async()=>{
  const f=fixture(),result=await read(f);
  assert.equal(f.transactions,1);
  assert.deepEqual(f.calls.slice(0,3),[
    {type:"transaction",options:{isolationLevel:"RepeatableRead",maxWait:2000,timeout:10000}},
    {type:"statement",sql:"SET TRANSACTION READ ONLY"},
    {type:"statement",sql:"SET LOCAL statement_timeout = '5000ms'"}
  ]);
  assert.deepEqual(result.items[0].payrollAttribution,{status:"ATTRIBUTED",reason:null,employeeId:"beneficiary",employeeName:"Recorded employee",paymentId:"payment"});
  assert.equal(result.items[0].amountCents,1234);
  assert.equal(result.totals.recordedExpenseCents,1234);
  assert.equal(result.totals.linkedPayrollCents,1234);
  assert.equal(result.totals.unattributedExpenseCents,0);
  assert.equal(result.totals.byEmployee[0].amountCents,1234);
  assert.equal(result.settlementVerified,false);
  assert.equal(result.accrualIncluded,false);
  assert.equal(result.standaloneWorkforcePaymentsIncluded,false);
  assert.equal(result.sourceCoverage.payrollAttribution,"LINKED_ONLY");
  assert.equal(JSON.stringify(result).includes("payer"),false);
  assert.equal(result.period.from,"2026-10-19T21:00:00.000Z");
  assert.equal(result.period.toExclusive,"2026-10-20T21:00:00.000Z");
  assert.deepEqual(f.calls.filter(c=>c.type==="query").map(c=>c.values).slice(0,2),[["company","store"],["store"]]);
});

test("role, explicit scope and ended-calendar validation deny before any database transaction",async()=>{
  const cases=[
    [{...request,user:{role:"ADMIN",companyId:"company"}},403],
    [{...request,user:{role:"MANAGER",companyId:"company"}},403],
    [{...request,user:{role:"OWNER",companyId:"company",tokenType:"STORE_OPERATOR"}},403],
    [{...request,user:{role:"SUPER_ADMIN",companyId:""}},400],
    [{...request,storeId:""},400],[{...request,storeId:["store"]},400],
    [{...request,timeZone:"UTC"},400],[{...request,from:["2026-10-20"]},400],
    [{...request,from:"2026-02-30"},400],[{...request,from:"2026-10-21",to:"2026-10-21"},400],
    [{...request,from:"2026-10-20",to:"2026-10-19"},400],
    [{...request,from:"2025-10-18",to:"2026-10-20"},400]
  ];
  for(const [input,status]of cases){const f=fixture();await rejectsStatus(read(f,input),status);assert.equal(f.transactions,0);}
});

test("Athens spring and autumn DST use exact half-open ended days",async()=>{
  for(const [day,start,end,hours]of [
    ["2026-03-29","2026-03-28T22:00:00.000Z","2026-03-29T21:00:00.000Z",23],
    ["2026-10-25","2026-10-24T21:00:00.000Z","2026-10-25T22:00:00.000Z",25]
  ]){
    const f=fixture({rows:[empty()]}),result=await readRecordedPayrollExpenseReport({...request,from:day,to:day},{db:f.db,now:new Date("2026-11-01T00:00:00Z")});
    assert.equal(result.period.from,start);assert.equal(result.period.toExclusive,end);
    assert.equal((Date.parse(end)-Date.parse(start))/3600000,hours);
  }
});

test("same snapshot rejects absent, foreign and inactive selected scope without reading ledger",async()=>{
  for(const owned of [[],[{...scope,companyId:"foreign"}],[{...scope,storeId:"foreign"}],[{...scope,companyActive:false}],[{...scope,storeActive:false}]]){
    const f=fixture({owned});await rejectsStatus(read(f),404);
    assert.equal(f.calls.some(c=>c.sql?.includes("WITH ledger")),false);
  }
});

test("OWNER package check uses pure BASIC inheritance plus independent PAYROLL without bootstrap",async()=>{
  const f=fixture({packages:[moduleRow("PERSONNEL_PRO"),moduleRow("PERSONNEL_PAYROLL")]});
  await read(f);
  assert.equal(f.calls.filter(c=>c.type==="statement").length,2);
  for(const packages of [[],[moduleRow("PERSONNEL_BASIC")],[moduleRow("PERSONNEL_PAYROLL")],[{...moduleRow("PERSONNEL_BASIC"),endsAt:new Date("2026-10-19T00:00:00Z")},moduleRow("PERSONNEL_PAYROLL")],[{...moduleRow("PERSONNEL_BASIC"),startsAt:new Date("2026-10-22T00:00:00Z")},moduleRow("PERSONNEL_PAYROLL")]]){
    const denied=fixture({packages});await rejectsStatus(read(denied),403,"STORE_MODULE_DISABLED");
    assert.equal(denied.calls.some(c=>c.sql?.includes("WITH ledger")),false);
  }
});

test("SUPER_ADMIN keeps explicit active scope and skips personnel package query only",async()=>{
  const f=fixture({packages:[]});await read(f,{...request,user:{role:"SUPER_ADMIN",companyId:"company"}});
  assert.equal(f.calls.some(c=>c.sql?.includes('FROM "StorePaidModule"')),false);
  assert.equal(f.calls.some(c=>c.sql?.includes('FROM "Company"')),true);
});

test("duplicate, foreign or malformed package projection fails closed",async()=>{
  for(const packages of [
    [...modules(),moduleRow("PERSONNEL_BASIC")],
    [{...moduleRow("PERSONNEL_BASIC"),companyId:"foreign"},moduleRow("PERSONNEL_PAYROLL")],
    [{...moduleRow("PERSONNEL_BASIC"),storeId:"foreign"},moduleRow("PERSONNEL_PAYROLL")],
    [{...moduleRow("PERSONNEL_BASIC"),active:"true"},moduleRow("PERSONNEL_PAYROLL")],
    [{...moduleRow("PERSONNEL_BASIC"),startsAt:new Date("bad")},moduleRow("PERSONNEL_PAYROLL")],
    [{...moduleRow("PERSONNEL_BASIC"),startsAt:new Date("2026-10-22"),endsAt:new Date("2026-10-19")},moduleRow("PERSONNEL_PAYROLL")]
  ])await rejectsStatus(read(fixture({packages})),502,"RECORDED_EXPENSE_SOURCE_INVALID");
});

test("injected signed ledger projection counts once and preserves refunds in unattributed bucket",async()=>{
  const f=fixture({rows:[
    row({transactionId:"a",amount:"20.01",totalRowCount:"3"}),
    unattributed({transactionId:"b",amount:"-5.99",reviewReason:"NON_POSITIVE_PAYROLL_AMOUNT",totalRowCount:"3"}),
    unattributed({transactionId:"c",amount:"0.00",totalRowCount:"3"})
  ]});
  const result=await read(f);
  assert.equal(result.totals.recordedExpenseCents,1402);
  assert.equal(result.totals.linkedPayrollCents,2001);
  assert.equal(result.totals.unattributedExpenseCents,-599);
  assert.equal(result.totals.attributedTransactionCount,1);
  assert.equal(result.totals.unattributedTransactionCount,2);
  assert.equal(result.totals.byEmployee.length,1);
  assert.equal(result.items[1].amountCents,-599);
});

test("unattributed review projections cannot expose payment or employee payload",async()=>{
  for(const reason of ["NO_WORKFORCE_LINK","MULTIPLE_WORKFORCE_LINKS","LINK_SCOPE_MISMATCH","LINK_NOT_APPROVED","NON_POSITIVE_PAYROLL_AMOUNT","LINK_AMOUNT_MISMATCH","LINK_METHOD_MISMATCH","EMPLOYEE_SCOPE_MISMATCH"]){
    const result=await read(fixture({rows:[unattributed({reviewReason:reason})]}));
    assert.equal(result.items[0].payrollAttribution.status,"UNATTRIBUTED");
    assert.equal(result.items[0].payrollAttribution.reason,reason);
    assert.deepEqual(result.totals.byEmployee,[]);
    await rejectsStatus(read(fixture({rows:[unattributed({reviewReason:reason,employeeId:"foreign"})]})),502);
  }
});

test("NUMERIC text is exact cents and malformed or unsafe projections are refused",async()=>{
  for(const [amount,expected]of [["0.01",1],["1.1",110],["-0.01",-1],["999999999999.99",99999999999999]]){
    const result=await read(fixture({rows:[unattributed({amount})]}));assert.equal(result.items[0].amountCents,expected);
  }
  for(const amount of [12.34,"NaN","Infinity","1e2","0.001","01.00","90071992547409.92"])
    await rejectsStatus(read(fixture({rows:[unattributed({amount})]})),502);
  for(const change of [{amount:"0.00"},{amount:"-1.00"},{employeeId:null},{employeeName:""},{paymentId:null},{paymentMethod:null}])
    await rejectsStatus(read(fixture({rows:[row(change)]})),502);
});

test("complete totals must remain safe integer cents",async()=>{
  const rows=Array.from({length:100},(_,i)=>unattributed({transactionId:`x-${i}`,amount:"999999999999.99",totalRowCount:"100"}));
  await rejectsStatus(read(fixture({rows})),502);
});

test("empty source has a measured complete zero, not missing projection",async()=>{
  const result=await read(fixture({rows:[empty()]}));
  assert.deepEqual(result.items,[]);
  assert.deepEqual(result.sourceCoverage,{complete:true,totalRowCount:0,returnedRowCount:0,limit:10000,totalsScope:"COMPLETE_LEDGER",payrollAttribution:"LINKED_ONLY"});
  assert.deepEqual(result.totals,{recordedExpenseCents:0,linkedPayrollCents:0,unattributedExpenseCents:0,attributedTransactionCount:0,unattributedTransactionCount:0,byEmployee:[]});
  await rejectsStatus(read(fixture({rows:[]})),502);
});

test("overflow suppresses full totals and beneficiary totals while retaining explicitly limited rows",async()=>{
  const rows=Array.from({length:10000},(_,i)=>unattributed({transactionId:`expense-${i}`,amount:"1.00",totalRowCount:"10001"}));
  const result=await read(fixture({rows}));
  assert.equal(result.items.length,10000);assert.equal(result.sourceCoverage.complete,false);
  assert.equal(result.sourceCoverage.totalRowCount,10001);assert.equal(result.sourceCoverage.totalsScope,"RETURNED_ROWS");
  assert.equal(result.totals,null);
});

test("missing or inconsistent source counts, identity, time and attribution projections fail closed",async()=>{
  const cases=[
    [row({totalRowCount:"2"})],[row({totalRowCount:1})],[row({totalRowCount:"01"})],
    [row({totalRowCount:"0"})],[row({transactionId:""})],[row({occurredAt:new Date("bad")})],
    [row({occurredAt:new Date("2026-10-20T21:00:00Z")})],[row({occurredAt:new Date("2026-10-19T20:59:59Z")})],
    [row({totalRowCount:"2"}),row({totalRowCount:"2"})],
    [row({totalRowCount:"2"}),row({transactionId:"two",totalRowCount:"3"})],
    [row({totalRowCount:"2"}),row({transactionId:"two",employeeName:"contradiction",totalRowCount:"2"})],
    [unattributed({reviewReason:"UNKNOWN"})]
  ];
  for(const rows of cases)await rejectsStatus(read(fixture({rows})),502);
});

test("missing schema or unavailable transaction fails closed without any repair statement",async()=>{
  for(const error of [{code:"42P01"},{code:"P2010",meta:{code:"42703"}},{code:"P2028"},{code:"57014"}]){
    const f=fixture({error});await rejectsStatus(read(f),503,"RECORDED_EXPENSE_SOURCE_UNAVAILABLE");
    assert.equal(f.calls.some(c=>/CREATE|ALTER|INSERT|UPDATE|DELETE|TRUNCATE/.test(c.sql||"")),false);
  }
  await rejectsStatus(readRecordedPayrollExpenseReport(request,{now}),503);
});

test("parameter values remain bound and invalid clocks do not begin transactions",async()=>{
  const hostile="store' OR true --",f=fixture({owned:[{...scope,storeId:hostile}],packages:modules().map(m=>({...m,storeId:hostile}))});
  await read(f,{...request,storeId:hostile});
  assert.equal(f.calls.some(c=>c.sql?.includes(hostile)),false);
  assert.equal(f.calls.some(c=>c.values?.includes(hostile)),true);
  const clock=fixture();await rejectsStatus(readRecordedPayrollExpenseReport(request,{db:clock.db,now:new Date("bad")}),500);
  assert.equal(clock.transactions,0);
});
