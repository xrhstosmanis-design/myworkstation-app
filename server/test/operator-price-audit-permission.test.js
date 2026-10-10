import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source=fs.readFileSync(new URL("../src/middleware/auth.js",import.meta.url),"utf8");
const start=source.indexOf("function enforceStorePosPermissions(");
const end=source.indexOf("function exposeStorePosRuntimeAccess(",start);
const enforce=vm.runInNewContext(`(${source.slice(start,end).trim()})`);
test("price Audit requires the current operator price permission before writing",()=>{
 const req={method:"POST",originalUrl:"/api/store-pos/stores/LAB/audit",body:{actionType:"PRICE_CHANGE"}};
 let status,body;const res={status(v){status=v;return this},json(v){body=v;return this}};
 assert.equal(enforce(req,res,[]),false);assert.equal(status,403);assert.match(body.error,/Αλλαγή τιμής λιανικής/);
 status=undefined;assert.equal(enforce(req,res,["CHANGE_RETAIL"]),true);assert.equal(status,undefined);
 req.body.actionType="CART_ITEM_ADD";assert.equal(enforce(req,res,[]),true);
 req.originalUrl="/api/other/audit";req.body.actionType="PRICE_CHANGE";assert.equal(enforce(req,res,[]),true);
});
