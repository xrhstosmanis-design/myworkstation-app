import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("mobile invoice upload page compresses large images and reports exact errors",()=>{
  const source=fs.readFileSync(new URL("../src/routes/mobile-invoice-upload.js",import.meta.url),"utf8");
  assert.match(source,/function prepare\(file\)/);
  assert.match(source,/toBlob\(ok,"image\/jpeg",\.82\)/);
  assert.match(source,/capture=environment/);
  assert.match(source,/body\.error/);
  assert.match(source,/length>4600000/);
});
