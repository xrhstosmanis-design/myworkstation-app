import test from "node:test";
import assert from "node:assert/strict";
import {workforceDateEndIso,workforceDateInput,workforceDateStartIso} from "../../client/src/components/platform/workforce-v2-ui-utils.js";

test("Workforce date-only fields keep the selected calendar day",()=>{
  assert.equal(workforceDateStartIso("2026-09-22"),"2026-09-22T00:00:00.000Z");
  assert.equal(workforceDateEndIso("2026-09-22"),"2026-09-22T23:59:59.999Z");
  assert.equal(workforceDateInput(workforceDateStartIso("2026-09-22")),"2026-09-22");
});

test("Workforce optional date-only fields remain empty",()=>{
  assert.equal(workforceDateStartIso(""),null);
  assert.equal(workforceDateEndIso(""),null);
});
