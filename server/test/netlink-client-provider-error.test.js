import test from "node:test";
import assert from "node:assert/strict";
import {NetlinkClient} from "../src/integrations/netlink/client.js";

const config={
  tokenUrl:"https://auth.example/token",
  apiBase:"https://api.example",
  clientId:"client",
  clientSecret:"secret",
  username:"user",
  password:"pass",
};

test("Netlink client exposes a nested provider error message without object coercion",async()=>{
  const originalFetch=globalThis.fetch;
  let call=0;
  globalThis.fetch=async()=>{
    call+=1;
    if(call===1)return new Response(JSON.stringify({access_token:"token",expires_in:300}),{status:200});
    return new Response(JSON.stringify({error:{message:"Station is not authorized"}}),{status:400});
  };
  try{
    await assert.rejects(()=>new NetlinkClient(config).menu(),error=>{
      assert.equal(error.message,"Station is not authorized");
      assert.equal(error.code,"NETLINK_API_ERROR");
      assert.equal(error.providerStatus,400);
      return true;
    });
  }finally{globalThis.fetch=originalFetch}
});
