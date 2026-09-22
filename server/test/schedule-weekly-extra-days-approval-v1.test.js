import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const api=fs.readFileSync(new URL("../src/routes/api.js",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../../client/src/main.jsx",import.meta.url),"utf8");

test("legacy scheduler keeps contractual days unless the current period explicitly approves 5 or 6",()=>{
  assert.match(api,/const maxDays=emp\._briefApprovedMaxDays\?\?emp\.maxDaysPerWeek/);
  assert.match(api,/const maxHours=emp\._briefApprovedMaxHours\?\?emp\.maxHoursPerWeek/);
  assert.doesNotMatch(api,/emp\.allowSixthDay\?Math\.max\(emp\.maxDaysPerWeek,6\)/);
  assert.match(api,/function requestedWeeklyDays/);
  assert.match(api,/WEEKLY_EXTRA_DAYS_APPROVED/);
  assert.match(api,/WEEKLY_EXTRA_DAYS_BLOCKED/);
  assert.match(api,/Ισχύει μόνο για/);
});

test("employee UI distinguishes contractual limits from the weekly exception capability",()=>{
  assert.match(ui,/Συμβατικές ημέρες την εβδομάδα/);
  assert.match(ui,/Συμβατικές ώρες την εβδομάδα/);
  assert.match(ui,/Μπορεί κατ’ εξαίρεση να εργαστεί 5η\/6η ημέρα/);
  assert.match(ui,/μόνο από επιβεβαιωμένη οδηγία της συγκεκριμένης εβδομάδας/);
});
