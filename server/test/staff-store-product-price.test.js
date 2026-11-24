import test from "node:test";
import assert from "node:assert/strict";
import {staffProfiles,staffRequestCapability,validStaffCapabilities} from "../../shared/backoffice-staff.mjs";
import {saveStaffStoreProductPrice} from "../src/services/staff-store-product-price.js";
import {invoiceDbFixture,isolatedInvoiceDb} from "./helpers/invoice-common-draft-fixture.js";
import {installStaffActionPolicy} from "./helpers/backoffice-staff-actions-fixture.js";

const capability="products.price-edit";
const path="/api/owner-products/p/store-price";
test("price edit is a separately granted exact store action",()=>{
  assert.equal(staffRequestCapability("PATCH",path),capability);
  assert.equal(staffRequestCapability("GET",path),null);
  assert.equal(staffRequestCapability("PATCH","/api/owner-products/p/prices"),null);
  assert.equal(staffRequestCapability("POST","/api/owner-products/prices/bulk"),null);
  assert.equal(validStaffCapabilities([capability]),false);
  assert.equal(validStaffCapabilities(["products.read",capability]),true);
  for(const profile of Object.values(staffProfiles))assert.ok(!profile.capabilities.includes(capability));
});

test("price request rejects store spoofing or mixed fields before a transaction",async()=>{
  const user={id:"staff",companyId:"c",storeId:"s",staffAccess:true};
  const db={$transaction:()=>assert.fail("must reject before DB")};
  await assert.rejects(saveStaffStoreProductPrice(db,{user,body:{storeId:"other",expectedPrice:1,salePrice:2}},"p"),{status:403});
  for(const body of [
    {storeId:"s",expectedPrice:1,salePrice:2,stores:[{storeId:"other"}]},
    {storeId:"s",expectedPrice:1,salePrice:2,vatRate:24},
    {storeId:"s",expectedPrice:1,salePrice:2.111}
  ])await assert.rejects(saveStaffStoreProductPrice(db,{user,body},"p"),{name:"ZodError"});
});

test("native store price edit keeps company price, another store, stock and history intact",{skip:!isolatedInvoiceDb()},async()=>{
  const {db,seed,close}=await invoiceDbFixture();
  try{
    await seed({posLines:1});
    const user=await installStaffActionPolicy(db,{capabilities:["products.read",capability]});
    await db.$executeRawUnsafe('ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "salePrice" numeric DEFAULT 7, ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true');
    await db.$executeRawUnsafe('ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true');
    await db.$executeRawUnsafe('CREATE TABLE "ProductPriceHistory" ("id" text PRIMARY KEY,"companyId" text,"productId" text,"storeId" text,"oldPrice" numeric,"newPrice" numeric,"changeType" text,"createdByUserId" text)');
    await db.$executeRaw`UPDATE "Product" SET "salePrice"=7 WHERE "id"='p'`;
    await db.$executeRaw`UPDATE "StoreProduct" SET "salePrice"=9 WHERE "storeId"='control' AND "productId"='p'`;
    const request=(salePrice,expectedPrice=7)=>({user,staffGrant:{capability},body:{storeId:"s",expectedPrice,salePrice}});
    const run=(salePrice,expectedPrice)=>saveStaffStoreProductPrice(db,request(salePrice,expectedPrice),"p");
    const results=await Promise.allSettled([run(3.5),run(4.5)]);
    assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
    assert.equal(results.find(result=>result.status==="rejected").reason.code,"STAFF_PRICE_CHANGED");
    const first=results.find(result=>result.status==="fulfilled").value;
    assert.equal(first.updated,true);
    assert.equal((await run(first.salePrice)).updated,false);
    const prices=await db.$queryRaw`SELECT "storeId","salePrice","currentStock" FROM "StoreProduct" WHERE "productId"='p' ORDER BY "storeId"`;
    assert.deepEqual(prices.map(row=>[row.storeId,Number(row.salePrice),Number(row.currentStock)]),[["control",9,20],["s",first.salePrice,10]]);
    const [base]=await db.$queryRaw`SELECT "salePrice" FROM "Product" WHERE "id"='p'`;
    assert.equal(Number(base.salePrice),7);
    const history=await db.$queryRaw`SELECT * FROM "ProductPriceHistory"`;
    assert.equal(history.length,1);
    assert.equal(history[0].storeId,"s");
    assert.equal(history[0].createdByUserId,user.id);
    assert.equal(Number(history[0].oldPrice),7);
    await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "capabilities"='["products.read"]'::jsonb`;
    await assert.rejects(run(5,first.salePrice),{status:403});
  }finally{await close();}
});
