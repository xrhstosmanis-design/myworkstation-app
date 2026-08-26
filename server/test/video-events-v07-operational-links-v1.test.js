import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../src/video-events-bootstrap.js",import.meta.url),"utf8");

test("V07 links every required critical operation to a video event type",()=>{
  for(const type of ["VOID","RETURN","DISCOUNT","DRAWER_OPEN","CASH_DIFFERENCE","REVERSAL","SUPPLIER_PAYMENT","SUSPICIOUS_ACTION"])assert.match(source,new RegExp(`'${type}'`));
  assert.match(source,/StoreTransaction_video_event/);
  assert.match(source,/PosSaleActionAudit_video_event/);
  assert.match(source,/CashShiftSession_video_event/);
});

test("V07 captures only technically active VIDEO_EVENTS stores with an active recorder",()=>{
  assert.match(source,/"moduleKey"='VIDEO_EVENTS' AND m\."active"=TRUE/);
  assert.match(source,/"StoreVideoConnection" c[\s\S]*c\."active"=TRUE/);
  assert.match(source,/IF NOT FOUND THEN RETURN NEW/);
});

test("V07 is idempotent and stores no credentials",()=>{
  assert.match(source,/VideoOperationalEvent_source_event_uq/);
  assert.match(source,/ON CONFLICT DO NOTHING/);
  assert.match(source,/capturedAutomatically/);
  assert.doesNotMatch(source,/captureVideoOperationalEvent[\s\S]*passwordEnc/);
});
