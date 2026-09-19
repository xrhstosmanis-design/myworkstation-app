import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const bootstrap=await readFile(new URL("../src/video-events-bootstrap.js",import.meta.url),"utf8");
const deviceRoute=await readFile(new URL("../src/routes/video-connector-device.js",import.meta.url),"utf8");
const platformRoute=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const manager=await readFile(new URL("../../client/src/components/platform/VideoConnectionManager.jsx",import.meta.url),"utf8");
const auditUi=await readFile(new URL("../../client/src/components/commerce/installKioskReportsAuditV2.js",import.meta.url),"utf8");

test("V16 persists outbound connector commands and temporary chunked media",()=>{
  for(const table of ["VideoConnectorCommand","VideoMediaArtifact","VideoMediaArtifactChunk"])assert.match(bootstrap,new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
  assert.match(deviceRoute,/STORE_DEVICE/);assert.match(deviceRoute,/VIDEO_DAHUA_READONLY/);assert.match(deviceRoute,/outboundOnly:true/);assert.match(deviceRoute,/MAX_ARTIFACT_BYTES/);assert.match(deviceRoute,/sha256/);
});

test("V16 drives health, snapshot and automatic NVR time from the local connector",()=>{
  assert.match(platformRoute,/commandType:"HEALTH"/);assert.match(platformRoute,/commandType:"SNAPSHOT"/);assert.match(deviceRoute,/timeCheckSource"='NVR_API'/);assert.match(manager,/Πραγματικός έλεγχος σύνδεσης/);assert.match(manager,/Δοκιμαστική εικόνα/);assert.match(manager,/fetchProtectedBlob/);
});

test("V16 never sends NVR credentials to the connector API or browser media URL",()=>{
  assert.doesNotMatch(deviceRoute,/passwordEnc|nvrPassword|username:z/);assert.match(platformRoute,/Cache-Control","private, no-store/);assert.doesNotMatch(auditUi,/src=["'`]rtsp:/i);
});
