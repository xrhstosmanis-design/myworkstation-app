import test from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {salesReportCalendar} from "../src/services/sales-report-calendar.js";

const first="2020-01-01",last="2020-01-01";
const limitations=["RECORDED_LEDGER_NOT_SETTLEMENT_PROOF","LINKED_PAYROLL_ONLY","STANDALONE_WORKFORCE_PAYMENTS_EXCLUDED","ACCRUAL_EXCLUDED","UNLINKED_EXPENSES_MAY_INCLUDE_PAYROLL","NOT_SERIALIZABLE_AUTHORIZATION_REVOCATION"];
function expenseReport(url,{count=201,partial=false,employeeName='=HYPERLINK("test") <img src=x onerror=bad>'}={}){
  const from=url.searchParams.get("from"),to=url.searchParams.get("to"),calendar=salesReportCalendar(from,to),storeId=url.searchParams.get("storeId");
  const items=Array.from({length:count},(_,i)=>({transactionId:`expense-${String(i).padStart(5,"0")}`,occurredAt:new Date(calendar.from.getTime()+i*1000).toISOString(),paymentMethod:"CASH_SHIFT",amountCents:i===1?-20:100,payrollAttribution:i===1?{status:"UNATTRIBUTED",reason:"NON_POSITIVE_PAYROLL_AMOUNT",employeeId:null,employeeName:null,paymentId:null}:{status:"ATTRIBUTED",reason:null,employeeId:"beneficiary",employeeName,paymentId:`payment-${i}`}}));
  const payroll=items.filter(i=>i.payrollAttribution.status==="ATTRIBUTED");
  return {companyId:"company",storeId,asOf:"2026-10-21T00:00:00.000Z",period:{calendarFrom:from,calendarTo:to,timeZone:"Europe/Athens",from:calendar.from.toISOString(),toExclusive:calendar.to.toISOString()},basis:"NONREVERSED_RECORDED_OTHER_EXPENSE_LEDGER",settlementVerified:false,accrualIncluded:false,standaloneWorkforcePaymentsIncluded:false,sourceCoverage:{complete:!partial,totalRowCount:partial?10001:count,returnedRowCount:count,limit:10000,totalsScope:partial?"RETURNED_ROWS":"COMPLETE_LEDGER",payrollAttribution:"LINKED_ONLY"},items,totals:partial?null:{recordedExpenseCents:items.reduce((sum,i)=>sum+i.amountCents,0),linkedPayrollCents:payroll.length*100,unattributedExpenseCents:count>1?-20:0,attributedTransactionCount:payroll.length,unattributedTransactionCount:count>1?1:0,byEmployee:payroll.length?[{employeeId:"beneficiary",employeeName,amountCents:payroll.length*100,transactionCount:payroll.length}]:[]},limitations:[...limitations]};
}
function salesReport(){
  const item={productId:"product",name:"Protected sales item",sku:"sku",storeId:"store",salesQuantity:1,grossSales:5,netSales:5,vatValue:0,costValue:2,profit:3};
  return {items:[item],count:1,sourceCoverage:{complete:true,returnedGroupCount:1,totalGroupCount:1,limit:10000,totalsScope:"COMPLETE_SOURCE"},normalSaleCount:1,reversalCount:0,totalQuantity:1,totalGross:5,totalNet:5,totalVat:0,totalCost:2,totalProfit:3};
}

async function mounted({role="SUPER_ADMIN"}={}){
  const dom=new JSDOM('<div class="commerce-hub" data-report-store-id="store" data-report-store-name="Synthetic LAB"><section><div class="commerce-module-strip"></div></section></div>',{url:"https://isolated.invalid/"});
  const names=["window","document","location","localStorage","fetch","alert","URL"],saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:dom.window[name]});
  // Native dialog behavior itself is verified in real Chromium separately;
  // this mounted jsdom fixture supplies only its open/close event boundary.
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","");};
  dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute("open");this.dispatchEvent(new dom.window.Event("close"));};
  localStorage.setItem("user",JSON.stringify({role}));localStorage.setItem("token","isolated-token");
  const calls=[],pending=[],downloads=[],revoked=[],blobs=new Map();let hold=false,mutate=data=>data,responseStatus=200,serial=0;
  globalThis.alert=()=>assert.fail("unexpected alert");
  const originalSetTimeout=globalThis.setTimeout,originalClearTimeout=globalThis.clearTimeout,timers=new Map();
  globalThis.setTimeout=(callback,ms,...args)=>{const handle=originalSetTimeout(()=>{timers.delete(handle);callback(...args);},ms);timers.set(handle,{callback,args});return handle;};
  globalThis.clearTimeout=handle=>{timers.delete(handle);originalClearTimeout(handle);};
  URL.createObjectURL=blob=>{const url=`blob:rpe-test-${++serial}`;blobs.set(url,blob);return url;};URL.revokeObjectURL=url=>revoked.push(url);
  dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push({filename:this.download,url:this.href});};
  globalThis.fetch=async(path,options)=>{
    const url=new URL(path,location.href);calls.push({url,options});
    if(url.pathname.endsWith("/recorded-payroll-expenses")){
      const body=mutate(expenseReport(url)),status=responseStatus;
      if(hold)await new Promise(resolve=>pending.push(resolve));
      return {ok:status===200,status,json:async()=>body};
    }
    if(url.pathname.endsWith("/sales-analysis"))return {ok:true,json:async()=>salesReport()};
    if(url.pathname.includes("/sales-analysis/"))return {ok:true,json:async()=>({product:{name:"Protected drill"},items:[]})};
    return {ok:true,json:async()=>({items:[{documentNumber:"PROTECTED_DOCUMENT"}]})};
  };
  const tick=async()=>{for(let i=0;i<3;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  const query=selector=>document.querySelector(selector);
  const click=async selector=>{const node=query(selector);assert.ok(node,selector);node.click();await tick();};
  const edit=async(selector,value,type="input")=>{const node=query(selector);assert.ok(node,selector);node.value=value;node.dispatchEvent(new dom.window.Event(type,{bubbles:true}));await tick();};
  const payrollCalls=()=>calls.filter(c=>c.url.pathname.endsWith("/recorded-payroll-expenses"));
  const open=async()=>{await click("[data-rpe-launch]");assert.ok(query("[data-rpe-dialog][open]"));await edit("[data-rpe-from]",first);await edit("[data-rpe-to]",last);};
  const cleanup=async()=>{
    try{for(const done of pending.splice(0))done();const module=await import("../../client/src/components/commerce/recordedPayrollExpenseDialog.js");module.closeRecordedPayrollExpenseDialog(query(".kiosk-reports-suite"));await tick();}
    finally{for(const[handle,{callback,args}]of timers){originalClearTimeout(handle);timers.delete(handle);callback(...args);}dom.window.close();globalThis.setTimeout=originalSetTimeout;globalThis.clearTimeout=originalClearTimeout;for(const[name,descriptor]of saved)descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];}
  };
  try{
    const {installKioskReportsSuite}=await import("../../client/src/components/commerce/installKioskReportsSuite.js");
    const {installKioskReportsSalesV4}=await import("../../client/src/components/commerce/installKioskReportsSalesV4.js");
    installKioskReportsSalesV4();installKioskReportsSuite();await click("[data-kiosk-reports-launch]");await click('[data-kr-tab="sales-stats"]');
  }catch(error){await cleanup();throw error;}
  return {dom,calls,pending,downloads,revoked,blobs,tick,query,click,edit,open,payrollCalls,cleanup,set hold(value){hold=value;},set mutate(value){mutate=value;},set responseStatus(value){responseStatus=value;}};
}

test("mounted actual Suite+V4 entry fetches only an explicit private Athens search and preserves product report, CSV and drill",async()=>{
  const f=await mounted();try{
    assert.equal(f.payrollCalls().length,0);assert.match(f.query(".kr-sales-v4").textContent,/Protected sales item/);
    await f.open();assert.equal(f.payrollCalls().length,0);assert.match(f.query("[data-rpe-dialog]").textContent,/Synthetic LAB/);assert.match(f.query("[data-rpe-dialog]").textContent,/Δεν πιστοποιεί πραγματική εξόφληση/);
    assert.equal(f.query("[data-rpe-export]").disabled,true);
    await f.click("[data-rpe-search]");assert.equal(f.payrollCalls().length,1);
    const call=f.payrollCalls()[0];assert.equal(call.url.searchParams.toString(),"storeId=store&from=2020-01-01&to=2020-01-01&timeZone=Europe%2FAthens");
    assert.deepEqual(call.options.headers,{Authorization:"Bearer isolated-token"});assert.equal(call.options.cache,"no-store");assert.ok(call.options.signal);
    assert.equal([...f.query("[data-rpe-results]").querySelectorAll("table")].at(-1).querySelectorAll("tbody tr").length,100);assert.equal(f.query("[data-rpe-results] img"),null);
    assert.match(f.query("[data-rpe-results]").textContent,/expense-00000/);assert.match(f.query("[data-rpe-results]").textContent,/-0.20 €/);
    await f.click("[data-rpe-page='1']");assert.equal([...f.query("[data-rpe-results]").querySelectorAll("table")].at(-1).querySelectorAll("tbody tr").length,100);assert.match(f.query("[data-rpe-results]").textContent,/expense-00100/);
    await f.click("[data-rpe-page='2']");assert.equal([...f.query("[data-rpe-results]").querySelectorAll("table")].at(-1).querySelectorAll("tbody tr").length,1);
    await f.click("[data-rpe-export]");assert.equal(f.downloads.length,1);assert.equal(f.downloads[0].filename,"katagegrammena-exoda-2020-01-01-2020-01-01.csv");
    const csv=await f.blobs.get(f.downloads[0].url).text();assert.match(csv,/expense-00200/);assert.match(csv,/"'\=HYPERLINK/);assert.match(csv,/;"-0.20";/);assert.doesNotMatch(csv,/"'-0.20"/);assert.match(csv,/"settlementVerified";"false"/);assert.match(csv,/"payrollAttribution";"LINKED_ONLY"/);
    await f.click("[data-rpe-close]");assert.equal(f.query("[data-rpe-dialog]"),null);assert.deepEqual(f.revoked,[f.downloads[0].url]);
    assert.match(f.query(".kr-sales-v4").textContent,/Protected sales item/);await f.click("[data-kr-export]");assert.equal(f.downloads.at(-1).filename,"anafores-statistika-poliseon.csv");
    await f.click("[data-sales-product]");assert.match(f.query(".kr-sales-drill").textContent,/Protected drill/);assert.equal(f.calls.at(-1).url.pathname,"/api/reports/sales-analysis/product");
  }finally{await f.cleanup();}
});

test("draft date edits invalidate applied output/export and ignore an in-flight response",async()=>{
  const f=await mounted();try{
    await f.open();await f.click("[data-rpe-search]");assert.equal(f.query("[data-rpe-export]").disabled,false);
    await f.edit("[data-rpe-to]","2020-01-02");assert.equal(f.query("[data-rpe-export]").disabled,true);assert.equal(f.query("[data-rpe-results]").textContent,"");assert.match(f.query("[data-rpe-status]").textContent,/διάστημα άλλαξε/);
    f.hold=true;await f.click("[data-rpe-search]");const release=f.pending.shift(),call=f.payrollCalls().at(-1);assert.equal(call.options.signal.aborted,false);
    await f.edit("[data-rpe-from]","2020-01-02");assert.equal(call.options.signal.aborted,true);release();await f.tick();
    assert.ok(f.query("[data-rpe-dialog]"));assert.equal(f.query("[data-rpe-results]").textContent,"");assert.equal(f.query("[data-rpe-export]").disabled,true);
    f.hold=false;await f.click("[data-rpe-search]");assert.match(f.query("[data-rpe-results]").textContent,/2020-01-02/);
    f.query("[data-rpe-to]").value="2020-01-03";await f.click("[data-rpe-export]");assert.equal(f.downloads.length,0);assert.equal(f.query("[data-rpe-results]").textContent,"");assert.equal(f.query("[data-rpe-export]").disabled,true);
    f.hold=true;await f.click("[data-rpe-search]");const programmatic=f.pending.shift();f.query("[data-rpe-to]").value="2020-01-04";programmatic();await f.tick();assert.equal(f.query("[data-rpe-results]").textContent,"");assert.equal(f.query("[data-rpe-export]").disabled,true);
  }finally{await f.cleanup();}
});

test("failed, malformed and scope-mismatched responses cannot leave stale values or a CSV",async()=>{
  const f=await mounted();try{
    await f.open();await f.click("[data-rpe-search]");
    for(const mutate of [data=>({...data,storeId:"foreign"}),data=>({...data,settlementVerified:true}),data=>({...data,actorName:"SECRET"}),data=>{data.items[0].amountCents++;return data;}]){
      f.mutate=mutate;await f.click("[data-rpe-search]");assert.equal(f.query("[data-rpe-results]").textContent,"");assert.equal(f.query("[data-rpe-export]").disabled,true);assert.match(f.query("[data-rpe-status]").textContent,/ακεραιότητα/);assert.doesNotMatch(f.query("[data-rpe-dialog]").textContent,/SECRET/);
    }
    f.mutate=data=>data;
    for(const status of [401,403,503,500]){f.responseStatus=status;await f.click("[data-rpe-search]");assert.equal(f.query("[data-rpe-export]").disabled,true);assert.equal(f.query("[data-rpe-results]").textContent,"");assert.ok(f.query("[data-rpe-status]").classList.contains("kr-error"));}
    f.responseStatus=200;await f.edit("[data-rpe-from]","2020-01-03");const count=f.payrollCalls().length;await f.click("[data-rpe-search]");assert.equal(f.payrollCalls().length,count);assert.equal(f.query("[data-rpe-export]").disabled,true);
  }finally{await f.cleanup();}
});

test("valid partial 10000-row snapshot stays visibly limited and its CSV never invents whole totals",async()=>{
  const f=await mounted();try{
    f.mutate=(_data)=>expenseReport(new URL("https://isolated.invalid/?storeId=store&from=2020-01-01&to=2020-01-01"),{count:10000,partial:true});
    await f.open();await f.click("[data-rpe-search]");assert.match(f.query("[data-rpe-results]").textContent,/ΕΛΛΙΠΗΣ ΚΑΛΥΨΗ/);assert.match(f.query("[data-rpe-results]").textContent,/10000 \/ 10001/);assert.doesNotMatch(f.query("[data-rpe-results]").textContent,/Καταγεγραμμένα έξοδα:/);
    await f.click("[data-rpe-export]");const csv=await f.blobs.get(f.downloads.at(-1).url).text();assert.match(csv,/expense-09999/);assert.match(csv,/"complete";"false"/);assert.match(csv,/"totalsScope";"RETURNED_ROWS"/);assert.doesNotMatch(csv,/"totals";|"COMPLETE_LEDGER"/);
  }finally{await f.cleanup();}
});

test("token changes, store transitions and outside navigation abort and remove the private dialog",async()=>{
  const f=await mounted();try{
    for(const action of [
      async()=>{localStorage.setItem("token","replacement-token");await f.click("[data-rpe-close]");},
      async()=>{document.querySelector(".commerce-hub").dataset.reportStoreId="foreign";await f.tick();},
      async()=>{await f.click('[data-kr-tab="documents"]');}
    ]){
      localStorage.setItem("token","isolated-token");document.querySelector(".commerce-hub").dataset.reportStoreId="store";await f.click('[data-kr-tab="sales-stats"]');await f.open();
      f.hold=true;await f.click("[data-rpe-search]");const release=f.pending.shift(),call=f.payrollCalls().at(-1);
      await action();assert.equal(f.query("[data-rpe-dialog]"),null);assert.equal(call.options.signal.aborted,true);
      release();await f.tick();assert.equal(f.query("[data-rpe-dialog]"),null);f.hold=false;
    }
    assert.equal(f.downloads.length,0);assert.match(f.query(".kr-panel").textContent,/PROTECTED_DOCUMENT/);
  }finally{await f.cleanup();}
});

test("programmatic hidden ancestors, detached roots, storage revocation and native Escape clean up temporary state",async()=>{
  const f=await mounted();try{
    await f.open();document.querySelector(".commerce-hub").hidden=true;await f.tick();assert.equal(f.query("[data-rpe-dialog]"),null);document.querySelector(".commerce-hub").hidden=false;
    await f.open();localStorage.setItem("user",JSON.stringify({role:"MANAGER"}));window.dispatchEvent(new f.dom.window.StorageEvent("storage",{key:"user"}));await f.tick();assert.equal(f.query("[data-rpe-dialog]"),null);
    localStorage.setItem("user",JSON.stringify({role:"SUPER_ADMIN"}));await f.open();const dialog=f.query("[data-rpe-dialog]");dialog.dispatchEvent(new f.dom.window.Event("cancel",{cancelable:true}));await f.tick();assert.equal(f.query("[data-rpe-dialog]"),null);assert.equal(document.activeElement,f.query("[data-rpe-launch]"));
    await f.open();f.hold=true;await f.click("[data-rpe-search]");const release=f.pending.shift(),signal=f.payrollCalls().at(-1).options.signal;f.query(".kiosk-reports-suite").remove();await f.tick();assert.equal(signal.aborted,true);release();await f.tick();assert.equal(f.query("[data-rpe-dialog]"),null);
  }finally{await f.cleanup();}
});

test("presentation denies other roles and an unavailable native dialog never fetches",async()=>{
  const denied=await mounted({role:"MANAGER"});try{assert.equal(denied.query("[data-rpe-launch]"),null);assert.equal(denied.payrollCalls().length,0);}finally{await denied.cleanup();}
  const f=await mounted();try{f.dom.window.HTMLDialogElement.prototype.showModal=undefined;await f.click("[data-rpe-launch]");assert.equal(f.query("[data-rpe-dialog]"),null);assert.equal(f.payrollCalls().length,0);}finally{await f.cleanup();}
});
