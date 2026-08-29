import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("staff scheduling chat uses store personnel, leave and schedule context without automatic writes",async()=>{
  const api=await readFile(new URL("../src/routes/api.js",import.meta.url),"utf8");
  const client=await readFile(new URL("../../client/src/main.jsx",import.meta.url),"utf8");
  assert.match(api,/router\.post\("\/schedules\/chat"/);
  assert.match(api,/approvedLeaves/);
  assert.match(api,/employeeNames/);
  assert.match(api,/shiftTable/);
  assert.match(api,/scheduleRows/);
  assert.match(api,/reasoning:\{effort:"minimal"\}/);
  assert.match(api,/currentSchedule/);
  assert.match(api,/Δεν αποθηκεύεις αλλαγές αυτόματα/);
  assert.match(client,/Συνομιλία με AI/);
  assert.match(client,/Μεταφορά στις οδηγίες/);
  assert.match(client,/ChatScheduleTable/);
  assert.match(client,/Το AI δεν αποθηκεύει αλλαγές αυτόματα/);
});

test("staff scheduling chat opens as an immediately visible modal",async()=>{
  const css=await readFile(new URL("../../client/src/schedule-ai-chat.css",import.meta.url),"utf8");
  assert.match(css,/position:fixed/);
  assert.match(css,/z-index:10000/);
  assert.match(css,/max-height:90vh/);
});
