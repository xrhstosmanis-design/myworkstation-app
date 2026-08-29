import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("staff scheduling chat uses store personnel, leave and schedule context without automatic writes",async()=>{
  const api=await readFile(new URL("../src/routes/api.js",import.meta.url),"utf8");
  const client=await readFile(new URL("../../client/src/main.jsx",import.meta.url),"utf8");
  assert.match(api,/router\.post\("\/schedules\/chat"/);
  assert.match(api,/approvedLeaves/);
  assert.match(api,/currentSchedule/);
  assert.match(api,/Δεν αποθηκεύεις και δεν αλλάζεις πρόγραμμα αυτόματα/);
  assert.match(client,/Συνομιλία με AI/);
  assert.match(client,/Μεταφορά στις οδηγίες/);
  assert.match(client,/Το AI δεν αποθηκεύει αλλαγές αυτόματα/);
});
