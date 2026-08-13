import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(repo,p),"utf8");
const serverPath="server/src/routes/pos-sale-actions.js";
const panelPath="client/src/components/commerce/PosSaleActionsPanel.jsx";
const cssPath="client/src/components/commerce/pos-sale-actions.css";
const transportPath="client/src/pos-checkout-safety.js";
const server=read(serverPath),panel=read(panelPath),css=read(cssPath),transport=read(transportPath),index=read("server/src/index.js"),entry=read("client/src/entry.jsx");

test("POS sale action backend and checkout transport parse",()=>{
  execFileSync(process.execPath,["--check",path.join(repo,serverPath)]);
  execFileSync(process.execPath,["--check",path.join(repo,transportPath)]);
});

test("sale action schema is additive and guaranteed at server startup",()=>{
  for(const field of ["transactionMode","delayedReason","delayedRecordedAt","originalSaleId","reversalKind","reversalState","reversedAt","reversedBy","reversedByName"])assert.match(server,new RegExp(`ADD COLUMN IF NOT EXISTS \\\"${field}\\\"`));
  assert.match(server,/CREATE TABLE IF NOT EXISTS "PosSaleActionAudit"/);
  assert.match(index,/import posSaleActionsRoutes,\{ensurePosSaleActionSchema\}/);
  assert.match(index,/app\.use\("\/api\/store-pos",auth,requireCompanyModule\("STORE_MODE"\),posSaleActionsRoutes\)/);
  assert.ok(index.indexOf("posSaleActionsRoutes")<index.lastIndexOf("storePosRoutes"));
  assert.match(index,/await ensurePosSaleActionSchema\(\)/);
});

test("recent POS sales are tenant store scoped and exclude reversal rows",()=>{
  assert.match(server,/s\."companyId"=\$\{req\.user\.companyId\}/);
  assert.match(server,/s\."storeId"=\$\{store\.id\}/);
  assert.match(server,/s\."source"='POS'/);
  assert.match(server,/s\."status"='COMPLETED'/);
  assert.match(server,/ORDER BY s\."createdAt" DESC LIMIT 30/);
});

test("delayed sale keeps recorded audit time and changes only a current non-fiscal POS sale",()=>{
  assert.match(server,/transactionMode"='DELAYED'/);
  assert.match(server,/"delayedRecordedAt"=NOW\(\)/);
  assert.match(server,/actionType:"DELAYED"/);
  assert.match(server,/oldOccurredAt/);
  assert.match(server,/newOccurredAt/);
  assert.match(server,/fiscalStatus!=="NON_FISCAL"/);
  assert.match(server,/31\*24\*60\*60\*1000/);
  assert.match(server,/Η ετεροχρονισμένη ώρα δεν μπορεί να είναι στο μέλλον/);
  assert.match(server,/"sessionId"=\$\{open\.id\}/);
  assert.match(server,/UPDATE "StoreTransaction" SET "occurredAt"/);
});

test("cancellation is same-shift only while return can create a later reversal",()=>{
  const cancelBlock=server.indexOf('if(body.kind==="CANCEL")');
  const reversalInsert=server.indexOf('INSERT INTO "Sale"',cancelBlock);
  assert.ok(cancelBlock>=0&&reversalInsert>cancelBlock);
  assert.match(server,/Η Ακύρωση επιτρέπεται μόνο όσο η αρχική πώληση βρίσκεται στην τρέχουσα ανοιχτή βάρδια/);
  assert.match(server,/Για παλιότερη πώληση χρησιμοποίησε Επιστροφή/);
  assert.match(server,/kind:z\.enum\(\["CANCEL","RETURN"\]\)/);
});

test("reversal is append-only, nets sale/payments and restores shared tracked BackOffice stock",()=>{
  assert.match(server,/'POS_REVERSAL'/);
  assert.match(server,/originalSaleId/);
  assert.match(server,/reversalKind/);
  assert.match(server,/\$\{-money\(sale\.subtotal\)\}/);
  assert.match(server,/\$\{-money\(sale\.total\)\}/);
  assert.match(server,/\$\{-money\(line\.quantity\)\}/);
  assert.match(server,/\$\{-money\(line\.discount\)\}/);
  assert.match(server,/\$\{-money\(line\.lineTotal\)\}/);
  assert.match(server,/\$\{-money\(payment\.amount\)\}/);
  assert.match(server,/'SALE_CASH'/);
  assert.match(server,/'SALE_CARD'/);
  assert.match(server,/"reversalState"=\$\{body\.kind\}/);
  assert.doesNotMatch(server,/DELETE\s+FROM\s+"Sale"/i);
  assert.match(server,/UPDATE "StoreProduct" sp SET "currentStock"=COALESCE\(sp\."currentStock",0\)\+/);
  assert.match(server,/p\."trackStock"=TRUE/);
  assert.match(server,/p\."companyId"=\$\{req\.user\.companyId\}/);
  assert.match(server,/INSERT\s+INTO\s+"StockMovement"/i);
  assert.match(server,/'POS_REVERSAL'/);
  assert.match(server,/Math\.abs\(money\(line\.quantity\)\)/);
});

test("reversal and delayed actions are serialized and fully audited",()=>{
  assert.match(server,/pg_advisory_xact_lock\(hashtext\(\$\{`delay:/);
  assert.match(server,/pg_advisory_xact_lock\(hashtext\(\$\{`reverse:/);
  assert.match(server,/FOR UPDATE/);
  assert.match(server,/PosSaleActionAudit/);
  assert.match(server,/StoreOperatorAudit/);
  assert.match(server,/POS_RETURN_COMPLETED/);
  assert.match(server,/POS_SALE_CANCELLED/);
  assert.match(server,/POS_SALE_DELAYED/);
  assert.match(server,/actionType:body\.kind/);
  assert.match(server,/reason:body\.reason/);
});

test("checkout delayed post-process is retry-safe and keeps original transaction UUID",()=>{
  assert.match(transport,/__mwsPosDelayedSaleContext/);
  assert.match(transport,/stableKey\(body,delayed\)/);
  assert.match(transport,/clientTransactionId:entry\.id/);
  assert.match(transport,/DELAYED_POSTPROCESS_FAILED/);
  assert.match(transport,/entry\.createdAt=Date\.now\(\)/);
  assert.match(transport,/sales\/\$\{encodeURIComponent\(sale\.saleId\)\}\/delayed/);
  assert.match(transport,/mws:pos-delayed-consumed/);
});

test("TEST POS exposes real delayed cancellation and return controls without a new observer",()=>{
  assert.match(entry,/PosSaleActionsPanel/);
  assert.match(entry,/<PosSaleActionsPanel api=\{storeApi\} storeId=\{storeId\}/);
  for(const label of ["ΕΤΕΡΟΧΡ.","ΠΩΛΗΣΕΙΣ / ΑΚΥΡΩΣΗ","Ακύρωση","Επιστροφή","Υποχρεωτική αιτιολογία"])assert.match(panel,new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(panel,/type="datetime-local"/);
  assert.match(panel,/\/sales\/\$\{encodeURIComponent\(target\.id\)\}\/reverse/);
  assert.doesNotMatch(panel,/MutationObserver/);
  assert.match(css,/\.commercial-pos-runtime\+\.pos-sale-actions-dock\{display:flex\}/);
});

test("sale action UI stays on MyWorkStation navy teal semantic palette",()=>{
  assert.match(css,/#0f2f4a/i);
  assert.match(css,/#0f8f83/i);
  assert.doesNotMatch(css,/#ff7f00|#f57c00|#ff9800/i);
});
