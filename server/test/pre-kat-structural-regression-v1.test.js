import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(repo,p),"utf8");
const commerceDir=path.join(repo,"client/src/components/commerce");

const managementFiles=fs.readdirSync(commerceDir).filter(name=>/^Management.*Panel\.jsx$|^installManagement.*\.js$|^management-.*\.css$/.test(name));
const managementCss=managementFiles.filter(name=>name.endsWith(".css"));
const managementCode=managementFiles.filter(name=>/\.(jsx|js)$/.test(name));

test("global touch keyboard is installed once and supports touch + pen",()=>{
  const keyboard=read("client/src/components/commerce/installTouchKeyboard.js");
  const entry=read("client/src/entry.jsx");
  assert.match(keyboard,/pointerType==="touch"\|\|pointerType==="pen"/);
  assert.match(keyboard,/input\.setAttribute\("inputmode","none"\)/);
  assert.match(keyboard,/TEXT_TYPES/);
  assert.match(keyboard,/NUMERIC_TYPES/);
  assert.equal((entry.match(/installTouchKeyboard\(\);/g)||[]).length,1);
});

test("management screens keep MyWorkStation navy/teal palette and reject Kiosk orange structural colors",()=>{
  assert.ok(managementCss.length>=5,"expected management CSS coverage");
  for(const name of managementCss){
    const source=read(`client/src/components/commerce/${name}`);
    assert.ok(source.includes("#123b5d")||source.includes("var(--mws-navy)"),`${name}: missing navy`);
    assert.ok(source.includes("#0f766e")||source.includes("var(--mws-teal)"),`${name}: missing teal`);
    assert.doesNotMatch(source,/#ffa500|#ff9800|#ff9f00|orange\s*!important/i,`${name}: Kiosk orange`);
  }
});

test("global normalization remains loaded after management/report bootstraps",()=>{
  const html=read("client/index.html");
  const theme=html.indexOf("theme-normalization-bootstrap.js");
  assert.ok(theme>0);
  for(const script of ["management-vat-bootstrap.js","management-expense-bootstrap.js","management-product-companies-bootstrap.js","management-modifiers-bootstrap.js","management-customer-categories-bootstrap.js","management-professions-bootstrap.js","management-business-units-bootstrap.js"]){
    const pos=html.indexOf(script);assert.ok(pos>=0&&pos<theme,`${script} must load before theme normalization`);
  }
});

test("new management modules do not create their own MutationObserver loops",()=>{
  for(const name of managementCode){
    const source=read(`client/src/components/commerce/${name}`);
    assert.doesNotMatch(source,/new\s+MutationObserver\s*\(/,`${name}: unexpected observer`);
  }
});

test("inventory archive uses server pagination and bounded page size",()=>{
  const backend=read("server/src/routes/inventory-archive.js");
  const client=read("client/src/components/commerce/InventoryArchivePanel.jsx");
  assert.match(backend,/Math\.min\(200,/);
  assert.match(backend,/LIMIT \$\{pageSize\} OFFSET \$\{offset\}/);
  assert.match(backend,/COUNT\(\*\)::int/);
  assert.ok(client.includes("pageSize"));
  assert.ok(client.includes("Σελίδα")||client.includes("page"));
});

test("price catalog remains paginated instead of rendering the full catalog",()=>{
  const backend=read("server/src/routes/price-catalog-normalized.js");
  assert.match(backend,/pageSize=Math\.min\(/);
  assert.match(backend,/LIMIT \$\{pageSize\} OFFSET \$\{offset\}/);
  assert.match(backend,/COUNT\(\*\)::int/);
});

test("core implemented workspaces keep real lower action wiring",()=>{
  const targets=[
    ["InventoryArchivePanel.jsx",["Κλείσιμο","Νέο είδος","Ομαδική διόρθωση","Παραγγελία","Εισαγωγή από Excel","Εκτύπωση","e‑Delivery"]],
    ["ManagementBusinessUnitsPanel.jsx",["Κλείσιμο","Ανανέωση","Νέα εγγραφή"]],
    ["ManagementModifiersPanel.jsx",["Κλείσιμο","Ανανέωση","Νέα εγγραφή"]],
    ["ManagementCustomerCategoriesPanel.jsx",["Κλείσιμο","Ανανέωση","Νέα εγγραφή"]],
    ["ManagementProfessionsPanel.jsx",["Κλείσιμο","Ανανέωση","Νέα εγγραφή"]],
    ["ManagementParametersPanel.jsx",["Κλείσιμο","Καταχώρηση"]]
  ];
  for(const [file,labels] of targets){
    const source=read(`client/src/components/commerce/${file}`);
    assert.match(source,/onClick=/,`${file}: no action handlers`);
    for(const label of labels)assert.ok(source.includes(label),`${file}: missing ${label}`);
  }
});

test("large report drilldowns remain lazy and load detail only after explicit expansion",()=>{
  const sales=read("client/src/components/commerce/installKioskReportsSalesV4.js");
  const supplier=read("client/src/components/commerce/installSupplierGlobalReports.js");
  assert.match(sales,/data-sales-product/);
  assert.match(sales,/async function drill/);
  assert.match(sales,/\/sales-analysis\/\$\{encodeURIComponent\(button\.dataset\.salesProduct\)\}/);
  assert.ok(/expand|drill|detail|data-sales-product/i.test(supplier));
});
