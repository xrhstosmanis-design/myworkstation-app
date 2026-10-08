import test from "node:test";
import assert from "node:assert/strict";
import {normalizeAudienceSettings,audienceLabelFor,DEFAULT_AUDIENCE_LABELS} from "../../shared/pos-audience-settings.mjs";

test("legacy and malformed layouts require explicit boolean audience enablement",()=>{
  for(const value of [undefined,null,{}, {enabled:"true"},{enabled:1},{enabled:false}])assert.equal(normalizeAudienceSettings(value).enabled,false);
  assert.equal(normalizeAudienceSettings({enabled:true}).enabled,true);
});
test("renaming preserves pricing keys and defaults missing or invalid labels",()=>{
  const settings=normalizeAudienceSettings({enabled:true,labels:{DOCTOR:"  Ιατρικό προσωπικό  ",NURSE:"",STAFF:"x".repeat(61),CUSTOMER:42}});
  assert.equal(audienceLabelFor("DOCTOR",settings),"Ιατρικό προσωπικό");
  assert.equal(settings.labels.NURSE,DEFAULT_AUDIENCE_LABELS.NURSE);
  assert.equal(settings.labels.STAFF,DEFAULT_AUDIENCE_LABELS.STAFF);
  assert.equal(settings.labels.CUSTOMER,DEFAULT_AUDIENCE_LABELS.CUSTOMER);
  assert.equal(audienceLabelFor("unknown",settings),DEFAULT_AUDIENCE_LABELS.NORMAL);
});
