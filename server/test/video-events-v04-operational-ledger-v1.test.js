import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../src/video-events-bootstrap.js",import.meta.url),"utf8");

test("V04 stores timestamp store POS operator and type on every video event",()=>{
  assert.match(source,/CREATE TABLE IF NOT EXISTS "VideoOperationalEvent"/);
  for(const field of ["companyId","storeId","terminalPos","operatorId","operatorName","eventType","eventAt","nvrEventAt"])assert.match(source,new RegExp(`"${field}"`));
  assert.match(source,/VideoOperationalEvent_pos_operator_type_idx/);
});

test("V04 rejects incomplete identity and derives the NVR timestamp from the saved offset",()=>{
  assert.match(source,/requires εταιρεία|απαιτεί εταιρεία/);
  assert.match(source,/!event\?\.companyId\|\|!event\?\.storeId\|\|!event\?\.terminalPos\|\|!event\?\.eventType/);
  assert.match(source,/eventAt\.getTime\(\)\+timeOffsetSeconds\*1000/);
  assert.match(source,/WHERE "companyId"=\$\{event\.companyId\} AND "storeId"=\$\{event\.storeId\} AND "active"=true/);
});

test("V04 keeps source linkage and optional amount without credentials",()=>{
  for(const field of ["sourceType","sourceId","amount","details"])assert.match(source,new RegExp(`"${field}"`));
  assert.doesNotMatch(source,/VideoOperationalEvent[\s\S]{0,700}passwordEnc/);
});
