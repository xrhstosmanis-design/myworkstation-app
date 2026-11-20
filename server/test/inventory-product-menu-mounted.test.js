import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import {JSDOM} from "jsdom";

test("warehouse menu uses the selected store and product independently of displayed columns", async () => {
  const dom = new JSDOM('<div class="ia-shell"><div class="ia-row data"><span>PIECE</span></div></div>', {
    url: "https://example.test/?supportStore=different-store",
  });
  const {document, MouseEvent} = dom.window;
  Object.assign(globalThis, {window:dom.window, document, innerWidth:1200, innerHeight:900});
  const errors = [];
  const downloads = [];
  const prints = [];
  dom.window.HTMLAnchorElement.prototype.click = function(){ downloads.push(this.download); };
  dom.window.open = () => ({document:{write:html=>prints.push(html),close(){}}});
  globalThis.alert = message => errors.push(message);
  try {
    const {registerInventoryMenuRow} = await import("../../client/src/components/commerce/inventoryProductActionsV2.js");
    const element = document.querySelector(".ia-row");
    const calls = [];
    const tabs = [];
    const callbacks = [];
    let current = true;
    const context = {
      row:{productId:"product-id",name:"Test item",sku:"KM3282",currentStock:112,salePrice:2.2,lastPurchasePrice:1,barcode:"4006381333931",description:"Label note"},
      storeId:"selected-store",
      isCurrent:()=>current,
      onEdit:tab=>tabs.push(tab),
      onDelivery:()=>callbacks.push("delivery"),
      onOrders:()=>callbacks.push("orders"),
      async api(path, options) {
        calls.push([path,options]);
        if(path.startsWith("/api/price-catalog/lookups"))return {customers:[{id:"customer",name:"Customer"}]};
        if(path.startsWith("/api/price-catalog/wholesale"))return {items:[]};
        if(path.startsWith("/api/commerce/suppliers"))return [{id:"supplier",name:"Supplier"}];
        if(path.includes("/price-history"))return [];
        if(path.includes("/purchases"))return {purchases:[]};
        return {product:{currentStock:112},movements:[]};
      },
    };
    registerInventoryMenuRow(element,context);
    const open = () => element.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}));
    const click = async action => {
      document.querySelector(`[data-a="${action}"]`).click();
      await new Promise(resolve=>setImmediate(resolve));
    };
    open();
    await click("movements");
    const [path] = calls[0];
    const url = new URL(path,dom.window.location.origin);
    assert.equal(url.pathname,"/api/inventory-ledger/product-id/movements");
    assert.equal(url.searchParams.get("storeId"),"selected-store");
    assert.match(document.querySelector(".mws-inv-modal").textContent,/112/);

    open();
    await click("edit-barcodes");
    open();
    await click("edit-suppliers");
    assert.deepEqual(tabs,["barcodes","suppliers"]);

    open();
    await click("stock");
    const modal = document.querySelector(".mws-inv-modal");
    await modal.querySelector("[data-save]").onclick();
    assert.equal(calls.length,1,"an empty correction must not reset stock to zero");
    modal.querySelector("[data-qty]").value="110";
    current = false;
    await modal.querySelector("[data-save]").onclick();
    assert.equal(calls.length,1,"a correction opened in another store must not reach the API");
    assert.equal(errors.length,2);

    current = true;
    for (const [action,title] of [
      ["price","Αλλαγή λιανικής"],["markup","Αλλαγή λιανικής"],["wholesale","Τιμή χονδρικής"],
      ["destroy","Καταστροφή ποσότητας"],["supplier-return","Δελτίο Αποστολής Επιστροφής"],
      ["purchases","Ιστορικό αγορών"],["history","Ιστορικό αλλαγών τιμής"],
    ]){
      open();
      await click(action);
      assert.match(document.querySelector(".mws-inv-modal header").textContent,new RegExp(title),action);
    }

    for (const action of ["edit","edit-active","delivery","orders","barcode","barcodes","comment","comments","a4","a5","a6","exportrow","export-movements","export-purchases","export-history"]){
      open();
      await click(action);
    }
    assert.deepEqual(tabs,["barcodes","suppliers","basic","basic"]);
    assert.deepEqual(callbacks,["delivery","orders"]);
    assert.equal(prints.length,7);
    assert.match(prints[0],/4006381333931/);
    assert.match(prints[2],/Label note/);
    assert.deepEqual(downloads,["eidos-KM3282.csv","kiniseis-KM3282.csv","agores-KM3282.csv","times-KM3282.csv"]);
    open();
    await click("price");
    document.querySelector(".mws-inv-modal [data-price]").value="3.10";
    document.querySelector(".mws-inv-modal [data-save]").click();
    await new Promise(resolve=>setImmediate(resolve));
    const [pricePath,priceRequest]=calls.at(-1);
    assert.equal(pricePath,"/api/price-catalog/products/product-id/price");
    assert.equal(priceRequest.method,"PATCH");
    assert.deepEqual(JSON.parse(priceRequest.body),{storeId:"selected-store",salePrice:3.1});

    assert.equal(errors.length,2);

    registerInventoryMenuRow(element,{...context,readOnly:true});
    open();
    assert.equal(document.querySelector('[data-a="destroy"]').disabled,true);
    assert.equal(document.querySelector('[data-a="movements"]').disabled,false);
  } finally {
    dom.window.close();
    for (const key of ["window","document","innerWidth","innerHeight","alert"]) delete globalThis[key];
  }
});

test("production HTML does not install another warehouse click handler",()=>{
  const html=readFileSync(new URL("../../client/index.html",import.meta.url),"utf8");
  const keyboard=readFileSync(new URL("../../client/src/touch-keyboard-bootstrap.js",import.meta.url),"utf8");
  assert.doesNotMatch(html,/inventoryContextCorrections/);
  assert.doesNotMatch(keyboard,/mountInventoryContext|mws-inventory-context/);
});
