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
  globalThis.alert = message => errors.push(message);
  try {
    const {registerInventoryMenuRow} = await import("../../client/src/components/commerce/inventoryProductActionsV2.js");
    const element = document.querySelector(".ia-row");
    const calls = [];
    const tabs = [];
    let current = true;
    const context = {
      row:{productId:"product-id",name:"Test item",sku:"KM3282",currentStock:112,salePrice:2.2},
      storeId:"selected-store",
      isCurrent:()=>current,
      onEdit:tab=>tabs.push(tab),
      async api(path, options) {
        calls.push([path,options]);
        return {product:{currentStock:112},movements:[]};
      },
    };
    registerInventoryMenuRow(element,context);
    const open = () => element.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}));
    const click = action => document.querySelector(`[data-a="${action}"]`).onclick({stopPropagation(){}});
    open();
    await click("movements");
    const [path] = calls[0];
    const url = new URL(path,dom.window.location.origin);
    assert.equal(url.pathname,"/api/owner-products/product-id/movements");
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
    registerInventoryMenuRow(element,{...context,readOnly:true});
    open();
    assert.equal(document.querySelector('[data-a="destroy"]').disabled,true);
    assert.equal(document.querySelector('[data-a="movements"]').disabled,false);
  } finally {
    dom.window.close();
    for (const key of ["window","document","innerWidth","innerHeight","alert"]) delete globalThis[key];
  }
});
