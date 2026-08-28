import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bootstrap=fs.readFileSync(new URL('../src/commercial-bootstrap.js',import.meta.url),'utf8');
const fiscal=fs.readFileSync(new URL('../src/extended-modules-bootstrap.js',import.meta.url),'utf8');
const ordering=fs.readFileSync(new URL('../src/routes/kat-online-ordering.js',import.meta.url),'utf8');
const handoff=fs.readFileSync(new URL('../src/routes/kat-online-pos-handoff.js',import.meta.url),'utf8');
const reconciliation=fs.readFileSync(new URL('../src/routes/kat-online-ordering-modifiers.js',import.meta.url),'utf8');
const panel=fs.readFileSync(new URL('../../client/src/components/commerce/OnlineOrdersBackofficePanel.jsx',import.meta.url),'utf8');

test('fiscalization remains exactly once per sale without executing a provider',()=>{
  assert.match(fiscal,/CREATE UNIQUE INDEX IF NOT EXISTS "FiscalDocument_saleId_key"/);
  assert.doesNotMatch(reconciliation,/netlinkClient|NETLINK_ENABLE_EXECUTE|sendFiscal|issueReceipt/);
});

test('online stock movements use stable database-enforced idempotency keys',()=>{
  assert.match(bootstrap,/ADD COLUMN IF NOT EXISTS "idempotencyKey"/);
  assert.match(bootstrap,/StockMovement_store_idempotency_key/);
  assert.match(ordering,/online:\$\{order\.id\}:line:\$\{line\.orderLineId\}/);
  assert.match(ordering,/ON CONFLICT \("storeId","idempotencyKey"\)/);
});

test('delayed completion serializes concurrent requests and replays one sale after restart',()=>{
  assert.match(handoff,/pg_advisory_xact_lock/);
  assert.match(handoff,/FOR UPDATE/);
  assert.match(handoff,/order\.saleId&&String\(order\.saleId\)!==saleId/);
  assert.match(handoff,/status:"DELIVERED",replay:true/);
});

test('BackOffice flags duplicate evidence without mutating or deleting it',()=>{
  for(const code of ['DUPLICATE_FISCAL_DOCUMENT','DUPLICATE_SALE_LINK','DUPLICATE_STOCK_MOVEMENT'])assert.match(reconciliation,new RegExp(code));
  assert.match(reconciliation,/integrity:/);
  assert.match(panel,/ΠΙΘΑΝΟ DUPLICATE/);
  assert.match(panel,/Δεν έγινε αυτόματη διαγραφή ή διόρθωση/);
  assert.doesNotMatch(reconciliation,/DELETE FROM/);
});
