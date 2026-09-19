import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/kiosk-reports-audit.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/installKioskReportsAuditV2.js",import.meta.url),"utf8");
const connector=await readFile(new URL("../../tools/windows-video-connector/VideoConnector.ps1",import.meta.url),"utf8");
const installer=await readFile(new URL("../../tools/windows-video-connector/Install-VideoConnector.ps1",import.meta.url),"utf8");
const discovery=await readFile(new URL("../../tools/windows-video-connector/Discover-VideoDevices.ps1",import.meta.url),"utf8");

test("V17 requests the exact existing 30-before 60-after Audit window",()=>{
  assert.match(route,/startAt:new Date\(event\.clipStartAt\)\.toISOString\(\)/);assert.match(route,/endAt:new Date\(event\.clipEndAt\)\.toISOString\(\)/);assert.match(route,/commandType:"CLIP"/);assert.match(route,/latestEventArtifact/);
});

test("V17 shows authenticated browser-compatible media instead of direct RTSP",()=>{
  assert.match(ui,/waitVideoCommand/);assert.match(ui,/protectedBlob/);assert.match(ui,/document\.createElement\("video"\)/);assert.doesNotMatch(ui,/src=["'`]rtsp:/i);assert.match(connector,/video\/mp4/);assert.match(connector,/movflags \+faststart/);
});

test("V17 stores device and Dahua credentials with Windows DPAPI and uses no inbound listener",()=>{
  assert.match(installer,/ProtectedData.*LocalMachine/);assert.match(installer,/protectedNvrCredential/);assert.match(installer,/outboundOnly=\$true/);assert.doesNotMatch(connector,/HttpListener|TcpListener|Start-Job/);assert.doesNotMatch(connector,/Write-SafeLog.*NvrCredential/);
});

test("V17 verifies a Dahua recording through mediaFileFind before downloading the clip",()=>{
  assert.match(connector,/mediaFileFind\.cgi\?action=factory\.create/);
  assert.match(connector,/action=findFile&object=/);
  assert.match(connector,/action=findNextFile&object=/);
  assert.match(connector,/DAHUA_RECORDING_NOT_FOUND/);
  assert.match(connector,/loadfile\.cgi\?action=startLoad/);
});

test("V17 discovers ONVIF devices locally without exposing an inbound service",()=>{
  assert.match(discovery,/239\.255\.255\.250/);assert.match(discovery,/NetworkVideoTransmitter/);assert.match(installer,/Discover-VideoDevices\.ps1/);assert.match(connector,/GetDeviceInformation/);assert.match(connector,/GetSnapshotUri/);assert.doesNotMatch(discovery,/HttpListener|TcpListener/);
});
