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

test("Netlink execute sends only the provider payload and keeps request id in the header",async()=>{
  const originalFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async(url,options={})=>{
    calls.push({url,options});
    if(calls.length===1)return new Response(JSON.stringify({access_token:"token",expires_in:300}),{status:200});
    return new Response(JSON.stringify({data:{ok:true}}),{status:200});
  };
  try{
    await new NetlinkClient(config).execute("164",{requestId:"request-123",payload:{},confirmation:undefined});
    assert.equal(calls[1].url,"https://api.example/164/execute");
    assert.equal(calls[1].options.headers["X-Request-Id"],"request-123");
    assert.deepEqual(JSON.parse(calls[1].options.body),{});
  }finally{globalThis.fetch=originalFetch}
});
