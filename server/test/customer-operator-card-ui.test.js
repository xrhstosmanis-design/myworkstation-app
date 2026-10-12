import test from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {openCustomerOperatorCard} from "../../client/src/components/commerce/customerOperatorCard.js";

test("actual linking dialog uses selected store, hides credentials, links once, reopens and unlinks",async()=>{
  const dom=new JSDOM('<body><div class="commerce-hub" data-report-store-id="store" data-report-store-name="Virtual store"><section id="customers"></section></div></body>'),oldDocument=global.document;
  global.document=dom.window.document;let link=null,release,writes=[];
  const customer={id:"staff-customer",name:'Staff <script>attack()</script>',discountAudience:"STAFF"},root=document.querySelector("#customers");
  const options={storeId:"store",items:[{credentialId:"operator",displayName:"Virtual operator",cardCodeLast4:"7890",linkedCustomerId:null},{credentialId:"used",displayName:"Already linked",cardCodeLast4:"1234",linkedCustomerId:"someone-else"}]};
  const api=async(url,request={})=>{
    assert.match(url,/\/api\/customer-control\//);
    if(request.method){writes.push(JSON.parse(request.body));await new Promise(resolve=>release=resolve);link=writes.at(-1).credentialId?{credentialId:"operator",displayName:"Virtual operator",cardCodeLast4:"7890",active:true,employeeActive:true}:null;return {ok:true}}
    return url.endsWith("operator-card-options")?options:{storeId:"store",link};
  };
  const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
  try{
    await openCustomerOperatorCard(root,customer,api);
    assert.equal(document.querySelectorAll("script").length,0);assert.match(document.body.textContent,/Virtual store/);
    const select=document.querySelector('[name="credentialId"]');assert.equal(select.querySelector('[value="used"]').disabled,true);
    assert.doesNotMatch(document.body.textContent,/cardCodeHash|pinHash|MW2ABCDEF/);
    select.value="operator";const form=document.querySelector("[data-work-card-form]");
    const submit=()=>form.dispatchEvent(new dom.window.Event("submit",{cancelable:true}));submit();submit();await flush();assert.equal(writes.length,1);assert.deepEqual(writes[0],{storeId:"store",credentialId:"operator"});
    release();await flush();assert.match(document.querySelector("[data-work-card-status]").textContent,/συνδέθηκε/);
    document.querySelector("[data-work-card-close]").click();customer.discountAudience="DOCTOR";await openCustomerOperatorCard(root,customer,api);
    assert.match(document.body.textContent,/Τρέχουσα σύνδεση: Virtual operator/);
    assert.equal(document.querySelector('[data-work-card-form] .primary').disabled,true);
    document.querySelector("[data-work-card-unlink]").click();await flush();assert.equal(writes.length,2);assert.equal(writes[1].credentialId,null);
    release();await flush();assert.match(document.querySelector("[data-work-card-status]").textContent,/αποσυνδέθηκε/);assert.match(document.body.textContent,/Χωρίς σύνδεση/);
  }finally{dom.window.close();global.document=oldDocument}
});

test("actual work-card dialog refuses missing/changed store and discards delayed old-store options",async()=>{
  const dom=new JSDOM('<body><div class="commerce-hub" data-report-store-id="store"><section id="customers"></section></div></body>'),oldDocument=global.document;global.document=dom.window.document;
  const root=document.querySelector("#customers"),hub=root.closest(".commerce-hub"),customer={id:"customer",discountAudience:"STAFF",name:"Virtual"};let writes=0;const releases=[];
  try{
    hub.dataset.reportStoreId="";await assert.rejects(openCustomerOperatorCard(root,customer,()=>{throw Error("no call")}),/κατάστημα/);
    hub.dataset.reportStoreId="store";
    const api=async(url,request={})=>{if(request.method){writes++;return {ok:true}}return url.endsWith("operator-card-options")?{storeId:"store",items:[{credentialId:"operator",displayName:"Name",cardCodeLast4:"7890"}]}:{storeId:"store",link:null}};
    await openCustomerOperatorCard(root,customer,api);document.querySelector('[name="credentialId"]').value="operator";hub.dataset.reportStoreId="different";document.querySelector("[data-work-card-form]").dispatchEvent(new dom.window.Event("submit",{cancelable:true}));assert.equal(writes,0);assert.equal(document.querySelector(".cc-modal-overlay"),null);
    hub.dataset.reportStoreId="store";
    const delayed=openCustomerOperatorCard(root,customer,async()=>new Promise(resolve=>releases.push(resolve)));
    // Both requests are pending; close on a store change when either response completes.
    hub.dataset.reportStoreId="different";document.querySelector("[data-work-card-close]").click();
    releases.forEach(resolve=>resolve({storeId:"store",link:null,items:[]}));await delayed;
    assert.equal(document.querySelector(".cc-modal-overlay"),null);
  }finally{dom.window.close();global.document=oldDocument}
});
