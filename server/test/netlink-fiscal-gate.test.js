import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {fiscalReceiptError,validFiscalReceipt} from "../src/integrations/netlink/fiscal-gate.js";

test("accepts only an issued fiscal receipt with number and issuance time",()=>{
  const issuedAt=new Date();
  assert.equal(validFiscalReceipt({status:"ISSUED",fiscalNumber:"A-123",issuedAt}),true);
  assert.equal(validFiscalReceipt({status:"PENDING",fiscalNumber:"A-123",issuedAt}),false);
  assert.equal(validFiscalReceipt({status:"ISSUED",fiscalNumber:"",issuedAt}),false);
  assert.equal(validFiscalReceipt({status:"ISSUED",fiscalNumber:"A-123",issuedAt:null}),false);
});

test("missing receipt blocks PIN issuance with a stable code",()=>{
  const error=fiscalReceiptError();
  assert.equal(error.status,409);
  assert.equal(error.code,"NETLINK_FISCAL_RECEIPT_REQUIRED");
});

test("execute verifies and audits the fiscal receipt before calling Netlink",()=>{
  const route=fs.readFileSync(new URL("../src/routes/netlink.js",import.meta.url),"utf8");
  const check=route.indexOf("validFiscalReceipt(fiscalDocument)");
  const provider=route.indexOf("netlinkClient().execute");
  assert.ok(check>=0&&provider>check);
  assert.match(route,/"fiscalDocumentId"/);
  assert.match(route,/"fiscalNumber"/);
  assert.match(route,/"fiscalIssuedAt"/);
  assert.match(route,/"serviceFeeAmount"/);
  assert.match(route,/"customerTotal"/);
  assert.match(route,/"commissionAmount"/);
});

test("Render startup repairs the raw-SQL Netlink fiscal columns",()=>{
  const render=fs.readFileSync(new URL("../../render.yaml",import.meta.url),"utf8");
  const compat=fs.readFileSync(new URL("../scripts/ensure-netlink-transaction-compat.js",import.meta.url),"utf8");
  assert.match(render,/node server\/scripts\/ensure-netlink-transaction-compat\.js/);
  assert.match(compat,/ADD COLUMN IF NOT EXISTS "fiscalDocumentId"/);
  assert.match(compat,/ADD COLUMN IF NOT EXISTS "fiscalNumber"/);
  assert.match(compat,/ADD COLUMN IF NOT EXISTS "fiscalIssuedAt"/);
});
