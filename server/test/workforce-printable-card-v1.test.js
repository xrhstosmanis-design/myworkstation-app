import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createLegacyWorkCardCode,createWorkCardCode,normalizeWorkCard,workCardHash,workCardLast4} from "../src/workforce-card-code.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

test("work cards are deterministic, store-scoped and POS-normalized",()=>{
  const input={companyId:"company-1",storeId:"store-1",employeeId:"employee-1",secret:"test-only-secret"};
  const first=createWorkCardCode(input),reprint=createWorkCardCode(input);
  assert.equal(first,reprint);
  assert.match(first,/^MW2[A-F0-9]{16}$/);
  assert.match(createLegacyWorkCardCode(input),/^MWSWC[A-F0-9]{24}$/);
  assert.notEqual(first,createWorkCardCode({...input,storeId:"store-2"}));
  assert.equal(normalizeWorkCard(` ${first.toLowerCase()} `),first);
  assert.equal(normalizeWorkCard("ΜΣ2266ΔΦΕ1424Ε8Β2Ψ7"),"MW2266DFE1424E8B2C7");
  assert.equal(normalizeWorkCard("μς2αβψδεφ0123456789"),"MW2ABCDEF0123456789");
  assert.equal(normalizeWorkCard("μςσςψαβψδεφ0123456789"),"MWSWCABCDEF0123456789");
  assert.equal(normalizeWorkCard("ΜΣΣΣΨΑΒΨΔΕΦ0123456789"),"MWSWCABCDEF0123456789");
  assert.equal(workCardHash(first),workCardHash(first.toLowerCase()));
  assert.equal(workCardHash("MW2266DFE1424E8B2C7"),workCardHash("ΜΣ2266ΔΦΕ1424Ε8Β2Ψ7"));
  assert.equal(workCardLast4(first),first.slice(-4));
});

test("work card issuance preserves existing credentials and keeps secrets out of audit",()=>{
  const source=read("server/src/routes/platform-workforce-v2-employees.js");
  assert.match(source,/router\.post\("\/:employeeId\/work-card"/);
  assert.match(source,/existing\?\.cardCodeHash&&existing\.cardCodeHash!==cardCodeHash/);
  assert.match(source,/createLegacyWorkCardCode/);
  assert.match(source,/"cardCodeHash"=\$\{cardCodeHash\},"cardCodeLast4"=\$\{cardCodeLast4\}/);
  assert.doesNotMatch(source,/SET[^\n]+"pinHash"[^\n]+WORKFORCE_WORK_CARD_PREPARED/);
  const auditLine=source.split("\n").find(line=>line.includes("WORKFORCE_WORK_CARD_PREPARED"));
  assert.ok(auditLine);
  assert.doesNotMatch(auditLine,/cardCode[,:]/);
  assert.match(auditLine,/cardLast4/);
});

test("employee UI offers a printable Code 128 card without a PIN",()=>{
  const tab=read("client/src/components/platform/WorkforceV2EmployeeTab.jsx");
  const printable=read("client/src/components/platform/workforce-card-print.js");
  assert.match(tab,/Εκτύπωση κάρτας/);
  assert.match(tab,/employee\.baseStoreId!==store\.id/);
  assert.match(printable,/CODE128/);
  assert.match(printable,/const quietZone=30/);
  assert.match(printable,/preserveAspectRatio="xMidYMid meet"/);
  assert.match(printable,/QRCode\.toString\(payload\.cardCode/);
  assert.match(printable,/Κάμερα: QR · Scanner: barcode/);
  assert.doesNotMatch(printable,/Προσωπικό PIN|pinHash/);
});
