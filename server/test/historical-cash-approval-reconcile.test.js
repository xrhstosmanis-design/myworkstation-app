import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../scripts/reconcile-historical-cash-approvals.mjs',import.meta.url),'utf8');

test('historical cash reconciliation is preview by default and requires explicit approval to write',()=>{
  assert.match(source,/process\.argv\.includes\('--apply'\)/);
  assert.match(source,/if\(!apply\)process\.exitCode=0/);
  assert.match(source,/MWS_CASH_RECONCILE_ACK/);
  assert.match(source,/APPROVE_20261124_53_RECORDS/);
  assert.match(source,/Live candidates changed: refuse all writes/);
  assert.match(source,/Concurrent change detected/);
});
test('historical cash reconciliation is scoped to two stores and exact expected counts',()=>{
  assert.match(source,/cmw0pwyvo000uokg2jrjm1p0c.*suppliers:12,expenses:18/);
  assert.match(source,/cmvgtyt6d000zh7gtbsp1en3p.*suppliers:13,expenses:10/);
  assert.match(source,/s\.suppliers!==stores\[i\]\.suppliers\|\|s\.expenses!==stores\[i\]\.expenses/);
});
test('cash review selector requires real open-shift payment, no bank, no reversal, and at most one euro difference',()=>{
  assert.match(source,/ss\."paymentMethod"='CASH_SHIFT'/);
  assert.match(source,/t\."type"='SUPPLIER_PAYMENT'/);
  assert.match(source,/t\."reversedAt" IS NULL/);
  assert.match(source,/t\."sessionId" IS NOT NULL/);
  assert.match(source,/NOT EXISTS\(SELECT 1 FROM "BankLedgerEntry"/);
  assert.match(source,/ABS\(t\."amount"\s*-\s*\(SELECT COALESCE\(SUM\(a\."amount"\),0\)/);
  assert.match(source, /<=1\.00/);
  assert.doesNotMatch(source,/UPDATE "StoreTransaction"|DELETE FROM "StoreTransaction"|UPDATE "CashShiftSession"/);
});
test('each review status change is audited in the same transaction and status remains explicit',()=>{
  assert.match(source,/prisma\.\$transaction\(async tx=>/);
  assert.equal((source.match(/UPDATE "SupplierPaymentSettlement"/g)||[]).length,1);
  assert.equal((source.match(/UPDATE "OtherExpenseReview"/g)||[]).length,1);
  assert.equal((source.match(/HISTORICAL_CASH_REVIEW_RECONCILED/g)||[]).length,2);
  assert.match(source,/if\(n!==1\)throw Error\('Supplier row changed'\)/);
  assert.match(source,/if\(n!==1\)throw Error\('Expense row changed'\)/);
});
