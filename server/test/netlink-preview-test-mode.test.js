import test from "node:test";
import assert from "node:assert/strict";
import {isNetlinkTestMode,isRenderPrPreview} from "../src/integrations/netlink/environment.js";

test("recognizes only Render PR preview hostnames",()=>{
  assert.equal(isRenderPrPreview("myworkstation-app-pr-231.onrender.com"),true);
  assert.equal(isRenderPrPreview("myworkstation-app.onrender.com"),false);
  assert.equal(isRenderPrPreview("myworkstation-app-pr-231.onrender.com.attacker.example"),false);
});

test("allows Netlink test mode in a production build only on a Render PR preview",()=>{
  assert.equal(isNetlinkTestMode({NODE_ENV:"production",NETLINK_TEST_MODE:"true",RENDER_EXTERNAL_HOSTNAME:"myworkstation-app-pr-231.onrender.com"}),true);
  assert.equal(isNetlinkTestMode({NODE_ENV:"production",NETLINK_TEST_MODE:"true",RENDER_EXTERNAL_HOSTNAME:"myworkstation-app.onrender.com"}),false);
  assert.equal(isNetlinkTestMode({NODE_ENV:"production",NETLINK_TEST_MODE:"false",RENDER_EXTERNAL_HOSTNAME:"myworkstation-app-pr-231.onrender.com"}),false);
  assert.equal(isNetlinkTestMode({NODE_ENV:"production",NETLINK_TEST_MODE:"true"}),false);
});
