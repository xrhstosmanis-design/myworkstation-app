import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const customers=[{id:"customer-a",name:"Assigned customer",priceListId:"list-b",creditLimit:0,paymentTermsDays:0}];
const lists=[{id:"list-a",code:"A",name:"List A",discountPercent:0},{id:"list-b",code:"B",name:"List B",discountPercent:5}];
const compiled=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/commerce/WholesaleB2BPanel.jsx",import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",external:["react","react-dom","react-dom/client","react/jsx-runtime"]});
const component={exports:{}};
new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(import.meta.url),component,component.exports);

async function mounted(api,run){
  const dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid/"});
  const keys=["window","document","navigator","HTMLElement","Node","Event","FormData","IS_REACT_ACT_ENVIRONMENT"];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
  const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React;
  let root=createRoot(document.getElementById("root"));
  const render=()=>act(async()=>root.render(React.createElement(component.exports.default,{api})));
  const click=text=>act(async()=>{const button=[...document.querySelectorAll("button")].find(el=>el.textContent===text);assert.ok(button,`button ${text}`);button.click()});
  const change=(element,value)=>act(async()=>{assert.ok(element);Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,"value").set.call(element,value);element.dispatchEvent(new dom.window.Event("change",{bubbles:true}))});
  const submit=form=>act(async()=>{assert.ok(form);form.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true}))});
  const settle=work=>act(async()=>work());
  const unmount=async()=>{if(root){await act(async()=>root.unmount());root=null}};
  try{await render();await run({dom,act,click,change,submit,settle,unmount,remount:async()=>{await unmount();root=createRoot(document.getElementById("root"));await render()}})}
  finally{await unmount();dom.window.close();for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
}

const pathname=path=>path.split("?")[0];

function readApi(path){
  path=pathname(path);
  if(path==="/api/wholesale/customers")return {items:customers};
  if(path==="/api/wholesale/price-lists")return {items:lists};
  if(/^\/api\/wholesale\/price-lists\/[^/]+\/products$/.test(path))return {items:[],total:0,page:1,pageSize:50};
  throw Error(`Unexpected request: ${path}`);
}

test("mounted wholesale async customer and list forms reset after acknowledgement and reload",async()=>{
  const calls=[],pending=deferred();let activePending=pending;
  const api=async(path,options)=>{calls.push({path,options});return options?.method==="POST"?activePending.promise:readApi(path)};
  await mounted(api,async({submit,settle,click})=>{
    const form=document.querySelector("form.wholesale-form");form.elements.namedItem("name").value="New customer";form.elements.namedItem("code").value="NEW";
    let resets=0;const reset=form.reset.bind(form);form.reset=()=>{resets++;reset()};
    await submit(form);assert.equal(resets,0);assert.equal(form.elements.namedItem("name").value,"New customer");
    await settle(()=>pending.resolve({id:"created-customer"}));
    assert.equal(resets,1);assert.equal(form.elements.namedItem("name").value,"");assert.equal(document.querySelector(".wholesale-error"),null);
    assert.equal(JSON.parse(calls.find(call=>call.options?.method==="POST").options.body).name,"New customer");
    assert.equal(calls.filter(call=>call.path==="/api/wholesale/customers"&&!call.options?.method).length,2);
    await click("Τιμοκατάλογοι");activePending=deferred();const listForm=document.querySelector("form.wholesale-list-form");listForm.elements.namedItem("name").value="New list";listForm.elements.namedItem("code").value="NEW-LIST";
    let listResets=0;const listReset=listForm.reset.bind(listForm);listForm.reset=()=>{listResets++;listReset()};
    await submit(listForm);assert.equal(listResets,0);await settle(()=>activePending.resolve({id:"created-list"}));
    assert.equal(listResets,1);assert.equal(listForm.elements.namedItem("name").value,"");assert.equal(document.querySelector(".wholesale-error"),null);
    assert.equal(calls.filter(call=>call.path==="/api/wholesale/price-lists"&&!call.options?.method).length,3);
  });
});

test("mounted wholesale customer assignment survives reload and empty selection explicitly unassigns",async()=>{
  let assigned="list-b";const writes=[];
  const api=async(path,options)=>{
    if(options?.method==="PUT"){writes.push({path,body:JSON.parse(options.body)});assigned=writes.at(-1).body.priceListId;return {ok:true}}
    return path==="/api/wholesale/customers"?{items:[{...customers[0],priceListId:assigned}]}:readApi(path);
  };
  await mounted(api,async({change,remount})=>{
    assert.equal(document.querySelector(".wholesale-customer-row select").value,"list-b");
    await remount();assert.equal(document.querySelector(".wholesale-customer-row select").value,"list-b");
    await change(document.querySelector(".wholesale-customer-row select"),"");
    assert.deepEqual(writes,[{path:"/api/wholesale/customers/customer-a/price-list",body:{priceListId:null}}]);
    assert.equal(document.querySelector(".wholesale-customer-row select").value,"");
    await remount();assert.equal(document.querySelector(".wholesale-customer-row select").value,"");
  });
});

test("mounted wholesale renders saved tiers and reads persisted tier after saving",async()=>{
  const calls=[];let saved=false;
  const api=async(path,options)=>{
    calls.push({path,options});
    if(options?.method==="PUT"){saved=true;return {ok:true}}
    if(path.startsWith("/api/price-catalog/products?"))return {items:[{id:"product-a",name:"Search product",sku:"SKU-A",salePrice:10}]};
    if(pathname(path)==="/api/wholesale/price-lists/list-a/products")return {total:1,page:1,pageSize:50,items:[{id:"tier-a",productId:"product-a",name:saved?"Persisted saved tier":"Existing saved tier",minimumQuantity:saved?6:2,unitPrice:saved?7:8,discountPercent:null}]};
    return readApi(path);
  };
  await mounted(api,async({click,submit})=>{
    await click("Τιμοκατάλογοι");assert.match(document.body.textContent,/Existing saved tier/);
    await click("Αναζήτηση");const form=document.querySelector(".wholesale-products form");assert.ok(form);
    form.elements.namedItem("minimumQuantity").value="6";form.elements.namedItem("unitPrice").value="7";
    await submit(form);assert.match(document.body.textContent,/Persisted saved tier/);assert.doesNotMatch(document.body.textContent,/Existing saved tier/);
    const write=calls.find(call=>call.options?.method==="PUT");assert.equal(write.path,"/api/wholesale/price-lists/list-a/products");assert.deepEqual(JSON.parse(write.options.body),{productId:"product-a",minimumQuantity:6,unitPrice:7,discountPercent:null});
    assert.ok(calls.filter(call=>pathname(call.path)==="/api/wholesale/price-lists/list-a/products"&&!call.options?.method).length>=2);
  });
});

test("mounted wholesale rejects a delayed old-list tier response and ignores late unmounted work",async()=>{
  const pending=deferred(),afterUnmount=deferred();let aReads=0;const calls=[];
  const api=async(path,options)=>{
    calls.push({path,options});
    if(pathname(path)==="/api/wholesale/price-lists/list-a/products"){aReads++;return aReads===1?pending.promise:afterUnmount.promise}
    if(pathname(path)==="/api/wholesale/price-lists/list-b/products")return {total:1,page:1,pageSize:50,items:[{id:"tier-b",productId:"product-b",name:"Current List B product",minimumQuantity:1,unitPrice:4}]};
    return readApi(path);
  };
  await mounted(api,async({click,change,settle,unmount})=>{
    await click("Τιμοκατάλογοι");assert.equal(aReads,1);
    await change(document.querySelector(".wholesale-price-editor select"),"list-b");assert.match(document.body.textContent,/Current List B product/);
    await settle(()=>pending.resolve({items:[{id:"tier-a",productId:"product-a",name:"Obsolete List A product",minimumQuantity:1,unitPrice:99}]}));
    assert.equal(document.querySelector(".wholesale-price-editor select").value,"list-b");assert.match(document.body.textContent,/Current List B product/);assert.doesNotMatch(document.body.textContent,/Obsolete List A product/);
    await change(document.querySelector(".wholesale-price-editor select"),"list-a");assert.equal(aReads,2);await unmount();const count=calls.length;
    await settle(()=>afterUnmount.resolve({items:[{name:"Unmounted result"}]}));
    assert.equal(document.getElementById("root").textContent,"");assert.equal(calls.length,count,"settled unmounted request must not trigger further loads");
  });
});

test("mounted wholesale saved tiers preserve zeroes, paginate on the server, and reset page for another list",async()=>{
  const reads=[];
  const api=async(path,options)=>{
    if(/^\/api\/wholesale\/price-lists\/[^/]+\/products/.test(path)){
      const url=new URL(path,"https://isolated.invalid");reads.push(url);
      assert.equal(url.searchParams.get("pageSize"),"50");const page=Number(url.searchParams.get("page"));
      const second=url.pathname.includes("list-b");
      return {total:second?1:51,page,pageSize:50,items:[{id:`tier-${page}`,productId:`product-${page}`,name:second?"Second list zero tier":page===1?"First page zero tier":"Second page tier",sku:"ZERO-SKU",minimumQuantity:1,unitPrice:0,discountPercent:0}]};
    }
    return readApi(path);
  };
  await mounted(api,async({click,change})=>{
    await click("Τιμοκατάλογοι");const section=document.querySelector('[aria-label="Αποθηκευμένες τιμές"]');assert.ok(section);
    assert.match(section.textContent,/First page zero tier/);assert.match(section.textContent,/0,00/);assert.equal(section.querySelectorAll("tbody td")[3].textContent,"0,00");assert.equal(section.querySelectorAll("tbody td")[4].textContent,"0");assert.match(section.textContent,/Σελίδα 1 από 2/);
    await click("Επόμενη");assert.equal(reads.at(-1).searchParams.get("page"),"2");assert.match(section.textContent,/Second page tier/);assert.doesNotMatch(section.textContent,/First page zero tier/);assert.match(section.textContent,/Σελίδα 2 από 2/);
    assert.equal([...section.querySelectorAll("button")].find(button=>button.textContent==="Επόμενη").disabled,true);
    await change(document.querySelector(".wholesale-price-editor select"),"list-b");assert.equal(reads.at(-1).pathname,"/api/wholesale/price-lists/list-b/products");assert.equal(reads.at(-1).searchParams.get("page"),"1");assert.match(section.textContent,/Second list zero tier/);assert.match(section.textContent,/Σελίδα 1 από 1/);
  });
});

test("mounted wholesale failed writes retain entered values and saved-tier reads can be retried",async()=>{
  let tierRead=0;const writes=[];
  const api=async(path,options)=>{
    if(options?.method){writes.push({path,options});throw Error("Write rejected")}
    if(pathname(path)==="/api/wholesale/price-lists/list-a/products"){
      if(++tierRead===1)throw Error("Tier read unavailable");
      return {items:[{id:"tier-retry",productId:"product-a",name:"Recovered persisted tier",minimumQuantity:1,unitPrice:null,discountPercent:5}],total:1,page:1,pageSize:50};
    }
    return readApi(path);
  };
  await mounted(api,async({submit,click})=>{
    const form=document.querySelector("form.wholesale-form");form.elements.namedItem("name").value="Keep this customer";form.elements.namedItem("code").value="KEEP";
    await submit(form);assert.equal(form.elements.namedItem("name").value,"Keep this customer");assert.equal(form.elements.namedItem("code").value,"KEEP");assert.match(document.querySelector(".wholesale-error").textContent,/Write rejected/);
    await click("Τιμοκατάλογοι");assert.match(document.querySelector('[aria-label="Αποθηκευμένες τιμές"]').textContent,/Tier read unavailable/);
    await click("Επανάληψη");assert.match(document.querySelector('[aria-label="Αποθηκευμένες τιμές"]').textContent,/Recovered persisted tier/);assert.equal(document.querySelector("tbody td:nth-child(4)").textContent,"—");
    const listForm=document.querySelector("form.wholesale-list-form");listForm.elements.namedItem("name").value="Keep this list";listForm.elements.namedItem("code").value="KEEP-LIST";
    await submit(listForm);assert.equal(listForm.elements.namedItem("name").value,"Keep this list");assert.equal(listForm.elements.namedItem("code").value,"KEEP-LIST");assert.equal(writes.length,2);
  });
});

test("mounted wholesale overlapping assignment refreshes cannot restore an older customer snapshot",async()=>{
  const oldRead=deferred();let reads=0,writes=0;
  const rows=(name,priceListId)=>[{...customers[0],name,priceListId},{...customers[0],id:"customer-b",name:"Second customer",priceListId:"list-a"}];
  const api=async(path,options)=>{
    if(options?.method==="PUT"){writes++;return {ok:true}}
    if(path==="/api/wholesale/customers"){
      reads++;if(reads===2)return oldRead.promise;
      return {items:rows(reads===1?"Initial snapshot":"Newest snapshot",reads===1?"list-b":"list-a")};
    }
    return readApi(path);
  };
  await mounted(api,async({change,settle})=>{
    await change(document.querySelectorAll(".wholesale-customer-row select")[0],"list-a");assert.equal(reads,2);
    assert.equal(document.querySelectorAll(".wholesale-customer-row select")[0].disabled,true);
    await change(document.querySelectorAll(".wholesale-customer-row select")[1],"list-b");assert.equal(reads,3);assert.match(document.body.textContent,/Newest snapshot/);
    await settle(()=>oldRead.resolve({items:rows("Obsolete customer snapshot","list-b")}));
    assert.match(document.body.textContent,/Newest snapshot/);assert.doesNotMatch(document.body.textContent,/Obsolete customer snapshot/);assert.equal(document.querySelectorAll(".wholesale-customer-row select")[0].value,"list-a");assert.equal(writes,2);
  });
});
