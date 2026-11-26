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

test("Netlink execute sends the provider-required requestId and payload wrapper",async()=>{
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
    assert.equal(calls[1].options.signal,undefined,"read-only check deadlines must not change card execution transport");
    assert.equal(calls[1].options.redirect,undefined);
    assert.equal(calls[1].options.headers["X-Request-Id"],"request-123");
    assert.deepEqual(JSON.parse(calls[1].options.body),{requestId:"request-123",payload:{}});
  }finally{globalThis.fetch=originalFetch}
});

// A POST response can be uncertain even when authentication middleware rejects it.
test("Netlink mutation 401 is never automatically replayed",async()=>{
 const previous=globalThis.fetch;let tokens=0,posts=0;
 globalThis.fetch=async(url,opts)=>{if(url===config.tokenUrl){tokens++;return new Response(JSON.stringify({access_token:'test-token'}),{status:200})}posts++;return new Response('{}',{status:401})};
 try{await assert.rejects(()=>new NetlinkClient(config).execute('243',{requestId:'1790000001',payload:{}}),e=>e.providerStatus===401);assert.equal(tokens,1);assert.equal(posts,1)}finally{globalThis.fetch=previous}
});
