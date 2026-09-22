import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source=fs.readFileSync(new URL("../../client/src/components/platform/WorkforceV2ScheduleTab.jsx",import.meta.url),"utf8");
const styles=fs.readFileSync(new URL("../../client/src/components/platform/workforce-assignment-errors.css",import.meta.url),"utf8");

test("assignment rejections remain visible next to the editor",()=>{
  assert.match(source,/\[assignmentError,setAssignmentError\]=useState\(""\)/);
  assert.match(source,/catch\(e\)\{setAssignmentError\(e\.message\);setError\(e\.message\)\}/);
  assert.match(source,/workforce-assignment-inline-error/);
  assert.match(source,/role="alert"/);
  assert.match(styles,/grid-column:\s*1\s*\/\s*-1/);
});
