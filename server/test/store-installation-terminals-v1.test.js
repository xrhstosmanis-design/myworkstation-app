import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const platformRoutes=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const operatorRoutes=await readFile(new URL("../src/routes/store-operators.js",import.meta.url),"utf8");
const auth=await readFile(new URL("../src/middleware/auth.js",import.meta.url),"utf8");
const platformUi=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const operatorUi=await readFile(new URL("../../client/src/components/store/StoreOperatorApp.jsx",import.meta.url),"utf8");

test("Super Admin manages one installation terminal per physical POS",()=>{
  assert.match(platformRoutes,/installation-terminals/);
  assert.match(platformRoutes,/crypto\.randomBytes\(32\)/);
  assert.match(platformRoutes,/createHash\("sha256"\)/);
  assert.match(platformRoutes,/24\*60\*60\*1000/);
  assert.match(platformRoutes,/STORE_TERMINAL_CREATED/);
  assert.match(platformRoutes,/STORE_TERMINAL_DISABLED/);
  assert.match(platformUi,/Εγκαταστάσεις \/ Τερματικά/);
  assert.match(platformUi,/Δημιουργία τερματικού/);
  assert.match(platformUi,/Αντιγραφή link/);
  assert.match(platformUi,/Απενεργοποίηση/);
});

test("activation is one-time and stores only a signed device binding on the PC",()=>{
  assert.match(operatorRoutes,/activate-terminal/);
  assert.match(operatorRoutes,/"tokenHash"=NULL/);
  assert.match(operatorRoutes,/tokenType:"STORE_TERMINAL"/);
  assert.match(operatorRoutes,/expiresIn:"365d"/);
  assert.match(operatorUi,/history\.replaceState/);
  assert.match(operatorUi,/query\.delete\("activation"\)/);
  assert.match(operatorUi,/terminalBindingKey/);
  assert.match(operatorUi,/terminalToken:result\.terminalToken/);
  assert.doesNotMatch(operatorUi,/activationToken.*localStorage\.setItem/);
});

test("PIN and card sessions inherit the verified physical terminal",()=>{
  assert.match(operatorRoutes,/resolveLoginTerminal/);
  assert.match(operatorRoutes,/terminalToken:z\.string\(\)\.optional\(\)\.nullable\(\)/);
  assert.match(operatorRoutes,/terminalId:row\.terminalId\|\|null/);
  assert.match(operatorUi,/terminalToken:terminalBinding\?\.terminalToken\|\|null/g);
  assert.match(auth,/payload\.terminalId/);
  assert.match(auth,/STORE_TERMINAL_DISABLED/);
  assert.match(auth,/req\.user\.terminalPos=payload\.terminalPos/);
});

test("installation work does not add fiscal or Netlink integration",()=>{
  for(const source of [platformRoutes,operatorRoutes,platformUi,operatorUi]){
    assert.doesNotMatch(source,/Netlink|RBS API|CapDriver API/i);
  }
});
