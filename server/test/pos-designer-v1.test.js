import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const bootstrap=fs.readFileSync(new URL("../src/platform-bootstrap.js",import.meta.url),"utf8");
const platform=fs.readFileSync(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const commerce=fs.readFileSync(new URL("../src/routes/commerce-v1.js",import.meta.url),"utf8");
const designer=fs.readFileSync(new URL("../../client/src/components/platform/PosDesignerPanel.jsx",import.meta.url),"utf8");
const pos=fs.readFileSync(new URL("../../client/src/components/commerce/CommerceHub.jsx",import.meta.url),"utf8");

test("POS layouts keep a draft separate from published store versions",()=>{
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS "PlatformPosDraft"/);
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS "StorePosLayout"/);
  assert.match(platform,/\/pos-designer\/draft/);
  assert.match(platform,/\/pos-designer\/publish/);
  assert.match(platform,/ON CONFLICT \("storeId"\)[\s\S]*"version"="StorePosLayout"\."version"\+1/);
});

test("publication targets only explicit, existing store ids",()=>{
  assert.match(platform,/storeIds:z\.array\(z\.string\(\)\)\.min\(1\)\.max\(1000\)/);
  assert.match(platform,/if\(stores\.length!==storeIds\.length\)/);
  assert.match(designer,/Οι αλλαγές παραμένουν πρόχειρες/);
  assert.match(designer,/Δημοσίευση \(\{selected\.size\}\)/);
});

test("the live POS reads only its tenant store published layout",()=>{
  assert.match(commerce,/WHERE "storeId"=\$\{store\.id\} AND "companyId"=\$\{req\.user\.companyId\}/);
  assert.match(pos,/\/api\/commerce\/pos-layout\?storeId=/);
  assert.match(pos,/posLayout\.buttons/);
  assert.match(pos,/runPosAction/);
});

test("the Super Admin designer controls the approved operator POS surface",()=>{
  assert.match(platform,/quickKeys:z\.array/);
  assert.match(platform,/categories:z\.array/);
  assert.match(platform,/theme:z\.object/);
  assert.match(designer,/Ζωντανή προεπισκόπηση — πραγματική διάταξη καταστήματος/);
  assert.match(designer,/Γρήγορα \(20\)/);
  assert.match(designer,/Κατηγορίες \(14\)/);
  assert.match(designer,/ΒΑΣΙΚΗ ΔΟΜΗ: 20 Γρήγορες θέσεις \+ 14 Κατηγορίες/);
  assert.match(pos,/store-operator-pos/);
  assert.match(pos,/addQuickProduct/);
  assert.match(pos,/setPosCategory/);
});
