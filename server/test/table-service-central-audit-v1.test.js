import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const auditRoute=await readFile(new URL("../src/routes/kiosk-reports-audit.js",import.meta.url),"utf8");
const tableRoute=await readFile(new URL("../src/routes/store-table-orders.js",import.meta.url),"utf8");

test("central audit includes table-service configuration events",()=>{
  for(const event of ["DINING_AREA_CREATED","DINING_TABLE_CREATED","DINING_TABLE_UPDATED"]){
    assert.match(auditRoute,new RegExp(`auditEventLabels\\.${event}`));
    assert.match(auditRoute,new RegExp(`'${event}'`));
  }
});

test("central audit renders detailed Greek dining descriptions",()=>{
  assert.match(auditRoute,/ΔΗΜΙΟΥΡΓΙΑ ΣΑΛΑΣ/);
  assert.match(auditRoute,/ΔΗΜΙΟΥΡΓΙΑ ΤΡΑΠΕΖΙΟΥ/);
  assert.match(auditRoute,/ΕΝΗΜΕΡΩΣΗ ΤΡΑΠΕΖΙΟΥ/);
  assert.match(auditRoute,/Σάλα \$\{areaName\}/);
  assert.match(auditRoute,/Τετράγωνο/);
  assert.match(auditRoute,/diningAreaNames/);
});

test("new table configuration audit rows retain Greek actor identity",()=>{
  assert.match(tableRoute,/actorName:req\.user\.fullName\|\|req\.user\.email\|\|"Χειριστής BackOffice"/);
  assert.match(tableRoute,/terminalPos:"BACKOFFICE"/);
  assert.match(auditRoute,/LEFT JOIN "User" u ON u\."id"=a\."actorId"/);
});
