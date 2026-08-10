import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"../..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const server="server/src/routes/customer-control-v2.js";
const client="client/src/components/commerce/installCustomerControlSuiteV2.js";
const entry="client/src/entry.jsx";

function syntax(file){const r=spawnSync(process.execPath,["--check",path.join(root,file)],{encoding:"utf8"});assert.equal(r.status,0,r.stderr||r.stdout)}

test("customer routes and client are valid JavaScript",()=>{syntax(server);syntax(client)});

test("customer control is tenant/role protected and keeps real-data sources",()=>{
  const s=read(server);
  assert.match(s,/SUPER_ADMIN.*OWNER.*ADMIN.*MANAGER/);
  assert.match(s,/"companyId"=\$\{companyId\}/);
  assert.match(s,/FROM "Sale"/);
  assert.match(s,/FROM "CustomerLedger"/);
  assert.match(s,/ABS\(c\."balance"\)>0\.0001/);
});

test("pencil flow exposes the three requested customer tabs",()=>{
  const c=read(client);
  assert.match(c,/Βασικά στοιχεία/);
  assert.match(c,/Διευθύνσεις/);
  assert.match(c,/Λοιπά/);
  assert.match(c,/data-cc-edit/);
});

test("right click and touch long press share the same context actions",()=>{
  const c=read(client);
  assert.match(c,/oncontextmenu/);
  assert.match(c,/setTimeout\(\(\)=>\{timer=null;openContext/);
  assert.match(c,/650/);
  for(const label of ["Διόρθωση στοιχείων","Είσπραξη","Διόρθωση υπολοίπου","Τζίρος μήνα","Τζίρος έτους","Λογιστική καρτέλα","Απενεργοποίηση"])assert.ok(c.includes(label),label);
});

test("receipt pencil is real edit and customer balance changes atomically",()=>{
  const c=read(client),s=read(server);
  assert.match(c,/data-cc-edit-receipt/);
  assert.match(c,/\/api\/customer-control\/receipts\/\$\{receipt\.id\}/);
  assert.match(s,/router\.patch\("\/receipts\/:receiptId"/);
  assert.match(s,/prisma\.\$transaction/);
  assert.match(s,/"balance"="balance"\+\$\{delta\}/);
});

test("customer edit has addresses and loyalty fields without deleting history",()=>{
  const s=read(server),c=read(client);
  assert.match(s,/CREATE TABLE IF NOT EXISTS "CustomerAddress"/);
  assert.match(c,/Κάρτα μέλους/);
  assert.match(c,/Πόντοι/);
  assert.match(s,/SET "active"=false/);
  assert.doesNotMatch(s,/DELETE FROM "Customer"/);
});

test("myDATA/provider stay explicitly disconnected until a real integration exists",()=>{
  const s=read(server),c=read(client);
  assert.match(s,/NOT_CONNECTED/);
  assert.match(c,/Δεν εμφανίζονται πλασματικά παραστατικά/);
});

test("customer suite uses global touch keyboard and existing anti-freeze observer",()=>{
  const e=read(entry);
  assert.match(e,/installTouchKeyboard\(\)/);
  assert.match(e,/installCustomerControlSuiteV2/);
  assert.match(e,/purchaseOrdersHostObserver/);
  assert.match(e,/installCustomerControlSafely/);
});
