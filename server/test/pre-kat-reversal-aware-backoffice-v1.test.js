import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(repo,p),"utf8");
const customerPath="server/src/routes/customer-control-reversal-aware.js";
const auditPath="server/src/routes/kiosk-reports-pos-sale-actions.js";
const salesPath="server/src/routes/kiosk-reports-sales-v4.js";
const stockPath="server/src/routes/kiosk-reports-stock-v3.js";
const clientPath="client/src/components/commerce/installPosSaleAuditReport.js";
const customer=read(customerPath),audit=read(auditPath),sales=read(salesPath),stock=read(stockPath),client=read(clientPath),entry=read("client/src/entry.jsx"),index=read("server/src/index.js"),css=read("client/src/components/commerce/pos-sale-audit-report.css");

test("reversal-aware BackOffice server and client modules parse",()=>{
  for(const p of [customerPath,auditPath,salesPath,stockPath,clientPath])execFileSync(process.execPath,["--check",path.join(repo,p)]);
});

test("customer visit count excludes reversal rows while turnover still nets them",()=>{
  assert.match(customer,/COUNT\(DISTINCT s\."id"\) FILTER \(WHERE COALESCE\(s\."source",''\)<>'POS_REVERSAL'\)/);
  assert.match(customer,/SUM\(s\."total"\)/);
  assert.match(customer,/FILTER \(WHERE s\."source"='POS_REVERSAL'\)/);
  assert.match(customer,/"returnsCurrentYear"/);
  assert.match(customer,/"reversalCount"/);
});

test("customer ledger labels cancellations returns and delayed sales explicitly",()=>{
  assert.match(customer,/'SALE_CANCEL'/);
  assert.match(customer,/'SALE_RETURN'/);
  assert.match(customer,/'SALE_DELAYED'/);
  assert.match(customer,/PosSaleActionAudit/);
  assert.match(customer,/originalSaleId/);
  assert.match(customer,/delayedReason/);
});

test("reversal-aware routes override legacy customer aggregation before generic customer control",()=>{
  const aware=index.indexOf('customerControlReversalAwareRoutes');
  const legacy=index.lastIndexOf('customerControlRoutes');
  assert.ok(aware>=0&&legacy>aware);
  assert.match(index,/app\.use\("\/api\/customer-control",auth,requireCompanyModule\("CORE"\),customerControlReversalAwareRoutes\)/);
});

test("sales analysis nets reversal values but last real sale excludes reversal",()=>{
  assert.match(sales,/sa\."source"/);
  assert.match(sales,/SUM\("quantity"\) AS "salesQuantity"/);
  assert.match(sales,/SUM\("lineTotal"\) AS "grossSales"/);
  assert.match(sales,/MAX\("occurredAt"\) FILTER \(WHERE COALESCE\("source",''\)<>'POS_REVERSAL'\) AS "lastSaleAt"/);
  assert.match(sales,/"normalSaleCount"/);
  assert.match(sales,/"reversalCount"/);
  assert.match(sales,/"returnGrossValue"/);
  assert.match(sales,/isReversal:r\.source==="POS_REVERSAL"/);
});

test("stock statistics net returned quantity but do not call a return the last sale",()=>{
  assert.match(stock,/SUM\(sl\."quantity"\)/);
  assert.match(stock,/MAX\(sale\."occurredAt"\) FILTER \(WHERE COALESCE\(sale\."source",''\)<>'POS_REVERSAL'\)/);
  assert.match(stock,/"reversalQuantity"/);
  assert.match(stock,/totalReversalQuantity/);
});

test("POS action audit is management and tenant/store scoped",()=>{
  assert.match(audit,/SUPER_ADMIN/);assert.match(audit,/OWNER/);assert.match(audit,/ADMIN/);assert.match(audit,/MANAGER/);
  assert.match(audit,/a\."companyId"=\$\{companyId\}/);
  assert.match(audit,/a\."storeId"=\$\{storeId\}/);
  assert.match(audit,/PosSaleActionAudit/);
  assert.match(audit,/originalOccurredAt/);
  assert.match(audit,/oldOccurredAt/);
  assert.match(audit,/newOccurredAt/);
  assert.match(audit,/cancellations/);assert.match(audit,/returns/);assert.match(audit,/delayed/);
});

test("POS action audit is mounted before generic reports",()=>{
  const action=index.indexOf("kioskReportsPosSaleActionsRoutes"),generic=index.lastIndexOf("kioskReportsRoutes");
  assert.ok(action>=0&&generic>action);
  assert.match(index,/app\.use\("\/api\/reports",auth,kioskReportsPosSaleActionsRoutes\)/);
});

test("existing Reports workspace exposes POS audit without creating another observer",()=>{
  assert.match(entry,/installPosSaleAuditReport/);
  assert.match(entry,/installReportsSafely=.*installKioskReportsSuite\(\);installPosSaleAuditReport\(\)/);
  assert.match(client,/data-pos-sale-audit-report|posSaleAuditReport/);
  assert.match(client,/Ακυρώσεις \/ Επιστροφές POS/);
  assert.match(client,/\/api\/reports\/pos-sale-actions/);
  assert.match(client,/Excel \/ CSV/);
  assert.match(client,/Εκτύπωση/);
  assert.doesNotMatch(client,/MutationObserver/);
  assert.equal((entry.match(/new MutationObserver/g)||[]).length,1);
});

test("POS audit UI preserves MyWorkStation structural palette",()=>{
  assert.match(css,/#0f2f4a/i);assert.match(css,/#0f8f83/i);
  assert.doesNotMatch(css,/#ff7f00|#f57c00|#ff9800/i);
});
