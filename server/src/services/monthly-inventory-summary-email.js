export const MONTHLY_INVENTORY_SUMMARY_FORMAT = 'MWS_MONTHLY_INVENTORY_SUMMARY_V1';

import { createHash } from 'node:crypto';
import { verifyMonthlyInventorySnapshotCandidateText } from './monthly-inventory-snapshot-payload.js';

export function formatMonthlyInventorySummary(receipt, { companyId, storeId, issueMonth, storeName }) {
  const snapshot = verifyMonthlyInventorySnapshotCandidateText(receipt.candidateJsonText);
  if (
    receipt.companyId !== companyId || snapshot.companyId !== companyId ||
    receipt.storeId !== storeId || snapshot.storeId !== storeId ||
    receipt.issueMonth !== issueMonth || snapshot.period.issueMonth !== issueMonth ||
    receipt.payloadHash !== snapshot.payloadHash
  ) {
    throw Object.assign(new Error('Monthly inventory snapshot scope mismatch.'), {
      code: 'MONTHLY_INVENTORY_SCOPE_MISMATCH',
    });
  }

  const store = String(storeName || storeId).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  const observedAt = new Intl.DateTimeFormat('el-GR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Athens',
  }).format(new Date(snapshot.period.sourceObservedAt));
  const lines = [
    `Κατάστημα: ${store}`,
    `Μήνας παραστατικών: ${issueMonth}`,
    `Χρόνος καταγραφής αποθέματος (Ελλάδα): ${observedAt}`,
    `Κωδικοί αποθέματος: ${snapshot.coverage.productCount}`,
    `Παραστατικά μήνα προς έλεγχο: ${snapshot.coverage.invoiceCount}`,
    `Εκκρεμή πρωτότυπα όλων των μηνών: ${snapshot.coverage.pendingOriginalCount}`,
  ];

  for (const row of snapshot.quantityByUnit) {
    lines.push(
      `Ποσότητα (${row.unit}): ${row.quantity}`,
      `Αξία λιανικής (EUR): ${row.retailValue ?? `γνωστό υποσύνολο ${row.knownRetailValueSubtotal}, άγνωστη τιμή σε ${row.unknownRetailCount} είδη`}`,
      `Αξία αγοράς (EUR): ${row.purchaseValue ?? `γνωστό υποσύνολο ${row.knownPurchaseValueSubtotal}, άγνωστο κόστος σε ${row.unknownPurchaseCount} είδη`}`,
    );
  }

  return {
    subject: `Μηνιαία σύνοψη αποθέματος · ${store} · ${issueMonth}`,
    text: lines.join('\n'),
    sourceFingerprint: snapshot.payloadHash,
  };
}

export function buildMonthlyInventorySummaryPayload(receipt, { companyId, storeId, issueMonth, storeName, period, settingsVersion }) {
  const message = formatMonthlyInventorySummary(receipt, { companyId, storeId, issueMonth, storeName });
  const metadata = {
    format: MONTHLY_INVENTORY_SUMMARY_FORMAT,
    scope: { companyId, storeId },
    frequency: 'MONTHLY',
    period,
    sourceFingerprint: message.sourceFingerprint,
    financialFinality: 'PROVISIONAL',
    financialLimitations: ['Η αποτίμηση βασίζεται στην καταγραφή αποθέματος κατά τον αναγραφόμενο χρόνο.'],
  };
  const body = JSON.stringify({
    ...metadata,
    issueMonth,
    settingsVersion,
    financialReconciliationComplete: false,
    employeeLiabilityAdjusted: false,
    subject: message.subject,
    text: message.text,
  });
  const byteLength = Buffer.byteLength(body);
  if (byteLength > 2097152) {
    throw Object.assign(new Error('Monthly inventory report is too large.'), { code: 'REPORT_PAYLOAD_INVALID' });
  }
  return {
    ...metadata,
    contentType: 'application/json; charset=utf-8',
    body,
    byteLength,
    payloadFingerprint: createHash('sha256').update(body).digest('hex'),
  };
}
