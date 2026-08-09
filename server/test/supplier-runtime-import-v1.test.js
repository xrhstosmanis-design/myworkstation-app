import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const check=file=>{
  const path=fileURLToPath(new URL(file,import.meta.url));
  const result=spawnSync(process.execPath,["--check",path],{encoding:"utf8"});
  assert.equal(result.status,0,`${file}\n${result.stderr||result.stdout}`);
};

test("supplier server modules pass Node syntax check",()=>{
  check("../src/routes/supplier-control.js");
  check("../src/routes/supplier-control-normalized.js");
  check("../src/supplier-control-bootstrap.js");
  check("../src/index.js");
});

test("supplier route modules can be imported without opening a database connection",async()=>{
  await import("../src/supplier-control-bootstrap.js");
  await import("../src/routes/supplier-control.js");
  await import("../src/routes/supplier-control-normalized.js");
});
