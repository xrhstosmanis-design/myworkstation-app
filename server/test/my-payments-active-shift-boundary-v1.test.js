import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ui=fs.readFileSync(new URL("../../client/src/components/store/MyShiftEntriesPanel.jsx",import.meta.url),"utf8");

test("POS my payments is final at shift boundary",()=>{
  assert.match(ui,/if\(!sessionId\)\{setRows\(\[\]\);return\}/);
  assert.match(ui,/String\(row\.sessionId\|\|""\)\.trim\(\)===sessionId/);
  assert.doesNotMatch(ui,/row\.paymentSource==="EXTERNAL"/);
  assert.doesNotMatch(ui,/!row\.sessionId&&!row\.subtractFromShift/);
  assert.match(ui,/Με το κλείσιμο της βάρδιας η προβολή μηδενίζει οριστικά/);
  assert.match(ui,/το ιστορικό παραμένει μόνο στο BackOffice \/ Audit/);
});
