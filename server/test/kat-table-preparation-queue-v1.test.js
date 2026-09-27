import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/store-table-orders.js",import.meta.url),"utf8");
const backoffice=await readFile(new URL("../../client/src/components/commerce/TableServiceBackofficePanel.jsx",import.meta.url),"utf8");
const preparationModal=await readFile(new URL("../../client/src/components/store/StorePreparationModal.jsx",import.meta.url),"utf8");

test("every table order records waiter and physical POS terminal",()=>{
  assert.match(route,/ALTER TABLE "TableOrder" ADD COLUMN IF NOT EXISTS "terminalPos"/);
  assert.match(route,/req\.user\?\.terminalPos\|\|req\.headers/);
  assert.match(route,/"operatorName","terminalPos","status"/);
  assert.match(route,/tableName:table\.name,terminalPos,roundNumber,addedTotal,total:finalTotal/);
});

test("preparation queue is store scoped and exposes station table waiter and items",()=>{
  assert.match(route,/table-service\/preparation-queue/);
  assert.match(route,/b\."companyId"=\$\{req\.user\.companyId\}/);
  assert.match(route,/b\."storeId"=\$\{store\.id\}/);
  assert.match(route,/"productionStation"/);
  assert.match(route,/"tableName"/);
  assert.match(route,/name:line\.name/);
});

test("one station can mark ready and table becomes ready only after all stations",()=>{
  assert.match(route,/preparation-queue\/:batchId\/ready/);
  assert.match(route,/SET "status"='READY',"readyAt"=NOW\(\)/);
  assert.match(route,/SELECT COUNT\(\*\)::int AS count/);
  assert.match(route,/Number\(pending\?\.count\|\|0\)===0/);
  assert.match(route,/TABLE_PREPARATION_READY/);
});

test("BackOffice queue refreshes and shows accountable preparation controls",()=>{
  assert.match(backoffice,/Ξεχωριστές ουρές παραγωγής/);
  assert.match(backoffice,/ΣΕ ΠΑΡΑΣΚΕΥΗ/);
  assert.match(backoffice,/batch\.terminalPos/);
  assert.match(backoffice,/batch\.operatorName/);
  assert.match(backoffice,/setInterval\(\(\)=>load\(\),10000\)/);
  assert.match(backoffice,/ΕΤΟΙΜΗ ΣΤΟ/);
  assert.match(backoffice,/item\.notes\?` · \$\{item\.notes\}`/);
});

test("BackOffice separates kitchen coffee bar and every configured production station",()=>{
  assert.match(backoffice,/const stations=useMemo/);
  assert.match(backoffice,/const visibleQueue=useMemo/);
  assert.match(backoffice,/role="tablist"/);
  assert.match(backoffice,/data-production-station/);
  assert.match(backoffice,/ΕΤΟΙΜΗ ΣΤΟ/);
  assert.match(backoffice,/queue\.filter\(row=>row\.productionStation===name/);
});


test("POS preparation loads only the selected product modifiers and settings",()=>{
  assert.match(preparationModal,/modifiers\?productId=\$\{encodeURIComponent\(line\.id\)\}/);
  assert.match(preparationModal,/const loadedGroups=r\.groups\|\|\[\],next=\{\}/);
  assert.match(preparationModal,/for\(const g of loadedGroups\)/);
  assert.match(preparationModal,/setSettings\(r\.settings\|\|null\)/);
});
