import test from "node:test";
import assert from "node:assert/strict";
import { supplierReportDate } from "../src/lib/supplier-report-date.js";

test("supplier export dates preserve Greek year/month boundaries on UTC hosts", () => {
  assert.equal(supplierReportDate("2025-12-31T22:00:00.000Z"), "1/1/2026");
  assert.equal(supplierReportDate("2026-09-30T21:00:00.000Z"), "1/10/2026");
  assert.equal(supplierReportDate("2026-10-07T20:59:59.999Z"), "7/10/2026");
});

test("supplier export dates preserve calendar dates across Greek DST changes", () => {
  assert.equal(supplierReportDate("2026-03-28T22:00:00.000Z"), "29/3/2026");
  assert.equal(supplierReportDate("2026-10-24T21:00:00.000Z"), "25/10/2026");
});
