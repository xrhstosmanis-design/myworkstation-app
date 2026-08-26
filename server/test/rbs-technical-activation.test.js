import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const route=fs.readFileSync(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../../client/src/components/platform/CommercialLicensePanel.jsx",import.meta.url),"utf8");
test("technical modules require a dedicated audited Super Admin endpoint",()=>{assert.match(route,/technical-activation/);assert.match(route,/requiresTechnicalActivation/);assert.match(route,/TECHNICAL_MODULE_/);assert.match(route,/TECHNICAL_PILOT_READ_ONLY/)});
test("commercial license update cannot newly enable a technical module",()=>{assert.match(route,/alreadyTechnicallyActive/);assert.match(route,/!catalogModule\?\.commercialReady&&!alreadyTechnicallyActive/);assert.match(route,/findUnique\(\{where:\{id:req\.params\.companyId\},include:\{modules:true\}\}\)/)});
test("platform UI labels technical activation as pilot read-only",()=>{assert.match(ui,/technicalActivation/);assert.match(ui,/PILOT READ-ONLY/);assert.match(ui,/PC του ΚΑΤ/)});
