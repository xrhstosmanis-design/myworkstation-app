import test from "node:test";
import assert from "node:assert/strict";
import {encryptStoreIntegrationValue,decryptStoreIntegrationValue} from "../src/integrations/store-integration-crypto.js";
import {createNetlinkConnectionStore,connectionScope} from "../src/integrations/netlink/store-connection.js";
import {createScopedNetlinkClient,NetlinkClient} from "../src/integrations/netlink/client.js";

test("encrypted store secrets are authenticated, randomized and require an explicit server key",t=>{
  const previous=process.env.INTEGRATION_CREDENTIALS_KEY,oldParameters=process.env.PARAMETERS_ENCRYPTION_KEY;
  t.after(()=>{previous===undefined?delete process.env.INTEGRATION_CREDENTIALS_KEY:process.env.INTEGRATION_CREDENTIALS_KEY=previous;oldParameters===undefined?delete process.env.PARAMETERS_ENCRYPTION_KEY:process.env.PARAMETERS_ENCRYPTION_KEY=oldParameters});
  process.env.INTEGRATION_CREDENTIALS_KEY="synthetic-netlink-key";
  const value={username:"synthetic-user",password:"synthetic-password"},a=encryptStoreIntegrationValue(value),b=encryptStoreIntegrationValue(value);
  assert.notEqual(a,b);assert.ok(!a.includes(value.password));assert.deepEqual(decryptStoreIntegrationValue(a),value);
  const parts=a.split(":");parts[3]=Buffer.from("tampered").toString("base64");assert.throws(()=>decryptStoreIntegrationValue(parts.join(":")));
  delete process.env.INTEGRATION_CREDENTIALS_KEY;delete process.env.PARAMETERS_ENCRYPTION_KEY;
  assert.throws(()=>encryptStoreIntegrationValue(value),e=>e.status===503);
});

test("scoped adapter reloads credentials, never shares tokens, and refuses disabled/missing stores before network",async t=>{
  const originalFetch=globalThis.fetch,previousKey=process.env.INTEGRATION_CREDENTIALS_KEY;
  process.env.INTEGRATION_CREDENTIALS_KEY="synthetic-key";
  t.after(()=>{globalThis.fetch=originalFetch;previousKey===undefined?delete process.env.INTEGRATION_CREDENTIALS_KEY:process.env.INTEGRATION_CREDENTIALS_KEY=previousKey});
  const rows=new Map(),queries=[],requests=[];
  const set=(store,user,station)=>rows.set("company/"+store,{stationId:station,enabled:true,credentialsEnc:encryptStoreIntegrationValue({username:user,password:"password-"+user})});
  set("A","alice","station-A");set("B","bob","station-B");
  const connections=createNetlinkConnectionStore({$queryRaw:async(strings,...values)=>{queries.push({sql:strings.join("?"),values});return [rows.get(values.join("/"))].filter(Boolean)}});
  globalThis.fetch=async(url,options)=>{
    requests.push({url,options});
    if(url.endsWith("/token")){const username=options.body.get("username");return new Response(JSON.stringify({access_token:"token-"+username,expires_in:300}))}
    return new Response(JSON.stringify({station:options.headers["X-Station-Id"],authorization:options.headers.Authorization}));
  };
  const provider=config=>new NetlinkClient({...config,tokenUrl:"https://fixture.invalid/token",apiBase:"https://fixture.invalid",clientId:"app",clientSecret:"app-secret"});
  const make=storeId=>createScopedNetlinkClient({companyId:"company",storeId},{connections:async()=>connections,provider});
  const a=make("A"),b=make("B");
  const both=await Promise.all([a.menu(),b.menu()]);assert.deepEqual(both,[{station:"station-A",authorization:"Bearer token-alice"},{station:"station-B",authorization:"Bearer token-bob"}]);
  set("A","alice-new","station-A-new");assert.deepEqual(await a.menu(),{station:"station-A-new",authorization:"Bearer token-alice-new"});
  rows.get("company/A").enabled=false;const count=requests.length;
  await assert.rejects(a.menu(),e=>e.code==="NETLINK_STORE_NOT_CONFIGURED");
  await assert.rejects(make("missing").menu(),e=>e.code==="NETLINK_STORE_NOT_CONFIGURED");
  assert.equal(requests.length,count);
  const status=await connections.status({companyId:"company",storeId:"B"});assert.deepEqual(Object.keys(status).sort(),["configured","enabled","stationId","updatedAt"]);
  assert.ok(queries.every(q=>q.sql.includes('"companyId"=? AND "storeId"=?')));
  assert.throws(()=>connectionScope({companyId:"company"}),e=>e.code==="NETLINK_STORE_REQUIRED");
  assert.throws(()=>make("customer-demo-store-reserved"),e=>e.code==="CUSTOMER_DEMO_OUTBOUND_BLOCKED");
  assert.throws(()=>createScopedNetlinkClient({companyId:"customer-demo-reserved",storeId:"A"}),e=>e.code==="CUSTOMER_DEMO_OUTBOUND_BLOCKED");
});


test("a success status without an access token cannot pass the connection check",async t=>{
  const originalFetch=globalThis.fetch;let count=0;t.after(()=>{globalThis.fetch=originalFetch});
  globalThis.fetch=async()=>{count++;return new Response(JSON.stringify({message:"not a token"}))};
  const client=new NetlinkClient({tokenUrl:"https://fixture.invalid/token",apiBase:"https://fixture.invalid",clientId:"app",clientSecret:"app-secret",username:"fixture",password:"fixture",stationId:"fixture"});
  await assert.rejects(client.menu(),e=>e.code==="NETLINK_INVALID_TOKEN");assert.equal(count,1);
});
