import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";

const localCompany = { id: "company-a", name: "Πρώτη εταιρεία", taxId: "123456789" };
const otherCompany = { id: "company-b", name: "Δεύτερη εταιρεία", taxId: "987654321" };
const localStore = { id: "store-a", name: "Ριζαρίου", city: "Αθήνα" };
const otherStore = { id: "store-b", name: "Αχαρνών", city: "Αθήνα" };
const companies = [{ ...localCompany, stores: [localStore] }, { ...otherCompany, stores: [otherStore] }];
const owner = { id: "owner-a", role: "OWNER", fullName: "Fixture Owner", company: localCompany };

test("Owner filters the visible directory, guards company changes and opens only an available store", async () => {
  const filename = fileURLToPath(new URL("../../client/src/main.jsx", import.meta.url));
  const source = fs.readFileSync(filename, "utf8")
    .replace('createRoot(document.getElementById("root")).render(<App/>);', "export { App };");
  const app = await build({
    stdin: { contents: source, resolveDir: path.dirname(filename), loader: "jsx" },
    bundle: true, write: false, platform: "node", format: "cjs",
    external: ["react", "react-dom", "react-dom/client"], loader: { ".css": "empty" },
    plugins: [{ name: "isolated-child-panels", setup(builder) {
      builder.onLoad({ filter: /\.jsx$/ }, ({ path: modulePath }) => {
        const name = path.basename(modulePath);
        if (["BackofficeShell.jsx", "BackofficeStores.jsx", "OwnerStoreDirectory.jsx"].includes(name)) return;
        return { contents: `import React from "react";
          export default function Panel({store}) {return <div data-panel="${name}">{store?.name}</div>}`, loader: "jsx" };
      });
    } }]
  });
  const module = { exports: {} };
  const virtualConsole = new VirtualConsole();
  const navigation = [];
  virtualConsole.on("jsdomError", error => {
    if (error.type !== "not implemented") throw error;
    navigation.push(error.message);
  });
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://isolated.invalid/?source=fixture", virtualConsole
  });
  const keys = ["window", "document", "navigator", "localStorage", "sessionStorage", "fetch", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, {
    configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key]
  });
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  new Function("require", "module", "exports", app.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  let root = createRoot(document.getElementById("root"));
  const requests = [];
  let scrolls = 0;
  window.HTMLElement.prototype.scrollIntoView = () => { scrolls += 1; };
  localStorage.setItem("token", "fixture-original");
  localStorage.setItem("user", JSON.stringify(owner));
  const response = data => ({ ok: true, status: 200, json: async () => data });
  globalThis.fetch = async (url, options) => {
    if (url === "/api/auth/owner-companies/select") {
      return new Promise(resolve => requests.push({ resolve, options }));
    }
    if (url === "/api/auth/owner-companies") return response({ companies });
    if (url === "/api/stores") return response(options.headers.Authorization === "Bearer fixture-switched" ? [otherStore] : [localStore]);
    return response({});
  };
  const render = () => act(() => root.render(createElement(module.exports.App)));
  const button = label => [...document.querySelectorAll("button")].find(node => node.textContent.trim() === label);
  const click = label => act(() => {
    const node = button(label);
    assert.ok(node, label);
    node.click();
  });
  try {
    await render();
    const input = document.querySelector('input[type="search"]');
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    await act(() => {
      setValue.call(input, "ριζαριου ΑΘΗΝΑ");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    assert.ok(button("Ριζαρίου · Άνοιγμα"));
    assert.equal(Boolean(button("Αχαρνών · Άνοιγμα")), false);
    await click("Ριζαρίου · Άνοιγμα");
    assert.equal(document.querySelector('[data-panel="StoreCloudPage.jsx"]').textContent, localStore.name);
    assert.equal(scrolls, 1);

    await click("Αρχική");
    const nextStore = button("Αχαρνών · Άνοιγμα");
    await act(() => { nextStore.click(); nextStore.click(); });
    assert.equal(requests.length, 1);
    assert.equal(button("Ριζαρίου · Άνοιγμα").disabled, true);
    assert.deepEqual(JSON.parse(requests[0].options.body), { companyId: otherCompany.id });
    await click("Καταστήματα");
    assert.equal(requests[0].options.signal.aborted, true);
    await act(() => requests[0].resolve(response({ token: "fixture-stale", user: { ...owner, company: otherCompany } })));
    assert.equal(localStorage.getItem("token"), "fixture-original");
    assert.equal(sessionStorage.getItem("ownerSelectedStoreId"), null);
    assert.ok(button("Άνοιγμα καταστήματος"));

    await click("Αρχική");
    await click("Αχαρνών · Άνοιγμα");
    await act(() => requests[1].resolve(response({ token: "fixture-mismatched", user: owner })));
    assert.match(document.querySelector('[role="alert"]').textContent, /Δεν επιβεβαιώθηκε/);
    assert.equal(localStorage.getItem("token"), "fixture-original");

    await act(() => root.unmount());
    root = createRoot(document.getElementById("root"));
    sessionStorage.setItem("ownerSelectedStoreId", otherStore.id);
    await render();
    assert.match(document.querySelector('[role="alert"]').textContent, /δεν είναι πλέον διαθέσιμο/);
    assert.equal(document.querySelector('[data-panel="StoreCloudPage.jsx"]'), null);
    assert.equal(sessionStorage.getItem("ownerSelectedStoreId"), null);

    await click("Αχαρνών · Άνοιγμα");
    const otherOwner = { ...owner, company: otherCompany };
    await act(() => requests[2].resolve(response({ token: "fixture-switched", user: otherOwner })));
    assert.equal(localStorage.getItem("token"), "fixture-switched");
    assert.deepEqual(JSON.parse(localStorage.getItem("user")), otherOwner);
    assert.equal(sessionStorage.getItem("ownerSelectedStoreId"), otherStore.id);
    assert.equal(navigation.length, 1);
    assert.match(navigation[0], /navigation/);

    await act(() => root.unmount());
    root = createRoot(document.getElementById("root"));
    await render();
    assert.equal(document.querySelector('[data-panel="StoreCloudPage.jsx"]').textContent, otherStore.name);
    assert.equal(sessionStorage.getItem("ownerSelectedStoreId"), null);
  } finally {
    await act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
