import test from "node:test";
import assert from "node:assert/strict";
import {videoAdapterFor,videoAdapterDescriptor,supportedVideoAdapterProtocols} from "../src/services/video-adapters.js";

test("V12 provides explicit ONVIF RTSP and vendor API adapters",()=>{
  assert.deepEqual(supportedVideoAdapterProtocols,["ONVIF","RTSP","VENDOR_API"]);
  assert.equal(videoAdapterFor("ONVIF").capabilities().timeApi,true);
  assert.equal(videoAdapterFor("RTSP").capabilities().clipExport,false);
  assert.equal(videoAdapterFor("VENDOR_API").capabilities().clipExport,true);
});

test("V12 validates protocol-specific endpoints without making a network call",()=>{
  const descriptor=videoAdapterDescriptor({protocol:"ONVIF",endpoint:"https://nvr.local/onvif",username:"admin",passwordConfigured:true});
  assert.equal(descriptor.endpointHost,"https://nvr.local");
  assert.equal(descriptor.realConnectionPerformed,false);
  assert.throws(()=>videoAdapterFor("RTSP").validate({endpoint:"https://nvr.local/live"}),/rtsp:\/\//);
  assert.throws(()=>videoAdapterFor("VENDOR_CLIENT"),/Δεν υπάρχει ενεργός adapter/);
});

test("V12 never exposes credentials and honestly blocks unverified connections",async()=>{
  const adapter=videoAdapterFor("VENDOR_API");
  const descriptor=videoAdapterDescriptor({protocol:"VENDOR_API",endpoint:"https://nvr.local/api",username:"admin",passwordConfigured:true});
  assert.equal(JSON.stringify(descriptor).includes("admin"),false);
  await assert.rejects(adapter.connect(),/προσβάσιμο NVR/);
});
