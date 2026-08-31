import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildWorkforceMigrationPreview,
  inferLegacyShiftAvailability,
  normalizeWorkforceText,
  workforceRoleCode
} from "../src/workforce-v2-migration.js";

const read=path=>fs.readFileSync(new URL(path,import.meta.url),"utf8");

const store={id:"store-kat",name:"Κυλικείο ΚΑΤ",active:true};
const cashier={id:"role-cashier",companyId:"company-1",name:"Ταμίας",code:"TAMIAS",active:true};
const morning={id:"shift-morning",name:"Πρωί",code:"MORNING",startTime:"07:00",endTime:"15:00"};
const night={id:"shift-night",name:"Βράδυ",code:"NIGHT",startTime:"23:00",endTime:"07:00"};

function legacy(overrides={}){
  return {
    id:"legacy-1",
    fullName:"Αθηνά Μάρκου",
    phone:"2100000000",
    email:"athina@example.test",
    position:"Ταμίας",
    type:"PERMANENT",
    active:true,
    storeId:store.id,
    store,
    maxDaysPerWeek:5,
    maxHoursPerWeek:40,
    updatedAt:"2026-08-31T12:00:00.000Z",
    rules:[{allowed:true,shiftType:morning}],
    ...overrides
  };
}

test("Workforce role normalization creates stable Greek-safe codes",()=>{
  assert.equal(normalizeWorkforceText("  Ταμίας  "),"ΤΑΜΙΑΣ");
  assert.equal(workforceRoleCode("Ταμίας"),"TAMIAS");
  assert.equal(workforceRoleCode("Παραγωγή Καφέ"),"PARAGOGI_KAFE");
});

test("legacy shift rules become an explicit availability proposal",()=>{
  const availability=inferLegacyShiftAvailability(legacy({rules:[{allowed:true,shiftType:morning},{allowed:true,shiftType:night}]}));
  assert.deepEqual({morning:availability.worksMorning,afternoon:availability.worksAfternoon,night:availability.worksNight},{morning:true,afternoon:false,night:true});
  assert.equal(availability.source,"LEGACY_ALLOWED_SHIFTS");
});

test("migration preview maps a clean legacy employee without writing data",()=>{
  const input=legacy();
  const snapshot=structuredClone(input);
  const preview=buildWorkforceMigrationPreview({legacyEmployees:[input],workforceEmployees:[],roles:[cashier],stores:[store]});
  assert.deepEqual(input,snapshot);
  assert.equal(preview.summary.total,1);
  assert.equal(preview.summary.ready,1);
  assert.equal(preview.rows[0].status,"READY");
  assert.equal(preview.rows[0].proposed.baseStoreId,store.id);
  assert.equal(preview.rows[0].proposed.primaryRoleId,cashier.id);
  assert.deepEqual(preview.rows[0].proposed.storeAccess,[{storeId:store.id,isBaseStore:true,canSchedule:true}]);
  assert.match(preview.previewHash,/^[a-f0-9]{64}$/);
});

test("missing roles and possible duplicates are forced to manual review",()=>{
  const preview=buildWorkforceMigrationPreview({
    legacyEmployees:[legacy({position:"Barista"})],
    workforceEmployees:[{id:"wf-1",fullName:"Αθηνά Μάρκου",email:"athina@example.test",baseStoreId:store.id,legacyEmployeeId:null}],
    roles:[cashier],
    stores:[store]
  });
  assert.equal(preview.rows[0].status,"NEEDS_REVIEW");
  assert.equal(preview.summary.missingRole,1);
  assert.equal(preview.summary.possibleDuplicates,1);
  assert.ok(preview.rows[0].warnings.some(item=>item.includes("ρόλος")));
  assert.ok(preview.rows[0].warnings.some(item=>item.includes("διπλότυπος")));
});

test("an already-linked legacy employee is identified and never proposed as a new record",()=>{
  const preview=buildWorkforceMigrationPreview({
    legacyEmployees:[legacy()],
    workforceEmployees:[{id:"wf-1",fullName:"Αθηνά Μάρκου",email:"athina@example.test",baseStoreId:store.id,legacyEmployeeId:"legacy-1"}],
    roles:[cashier],
    stores:[store]
  });
  assert.equal(preview.rows[0].status,"ALREADY_LINKED");
  assert.equal(preview.summary.alreadyLinked,1);
});

test("Workforce v2 API is tenant/package scoped, confirmation gated and preview-only",()=>{
  const route=[
    "../src/routes/platform-workforce-v2.js",
    "../src/routes/platform-workforce-v2-employees.js",
    "../src/routes/platform-workforce-v2-migration.js",
    "../src/routes/platform-workforce-v2-roles.js",
    "../src/routes/workforce-v2-access.js",
    "../src/routes/workforce-v2-validation.js"
  ].map(read).join("\n");
  const packageMount=read("../src/routes/platform-store-modules.js");
  const earlyPlatformGate=read("../src/routes/platform-owner-security.js");
  const serverEntry=read("../src/index.js");
  const ui=[
    "../../client/src/components/platform/WorkforceV2EmployeesPanel.jsx",
    "../../client/src/components/platform/WorkforceV2MigrationTab.jsx",
    "../../client/src/components/platform/useWorkforceV2Manager.js"
  ].map(read).join("\n");
  const schema=read("../prisma/schema.prisma");

  assert.match(route,/requirePersonnelPackage\(req,storeId,PERSONNEL_BASIC\)/);
  assert.match(route,/const confirmed=z\.literal\(true\)/);
  assert.match(route,/WORKFORCE_EMPLOYEE_CREATED/);
  assert.match(route,/WORKFORCE_ROLE_UPDATED/);
  assert.match(route,/mode:"PREVIEW_ONLY"/);
  assert.match(route,/readOnly:true/);
  assert.match(route,/applyAvailable:false/);
  assert.match(route,/applyEndpoint:null/);
  assert.match(route,/WORKFORCE_ROUTE_NOT_FOUND/);
  assert.doesNotMatch(route,/router\.(?:post|put|patch)\("\/migration\/apply/);

  const packageChildMount=packageMount.indexOf('router.use("/companies/:companyId/stores/:storeId/workforce-v2",platformWorkforceV2Routes)');
  const packageSuperAdminGuard=packageMount.indexOf('router.use((req,res,next)=>isSuperAdmin(req.user)?next()');
  assert.ok(packageChildMount>=0&&packageSuperAdminGuard>packageChildMount,"Workforce package routes must be mounted before the package Super Admin-only guard");

  assert.match(earlyPlatformGate,/import platformStoreModulesRoutes from "\.\/platform-store-modules\.js"/);
  const earlyStoreModulesMount=earlyPlatformGate.indexOf('router.use("/store-modules",platformStoreModulesRoutes);');
  const genericSuperAdminGate=earlyPlatformGate.indexOf('const allowed=req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN";');
  assert.ok(earlyStoreModulesMount>=0&&genericSuperAdminGate>earlyStoreModulesMount,"Store-module routes must execute before the first generic Platform Super Admin gate");
  assert.doesNotMatch(earlyPlatformGate,/workforcePath|managementRole/);

  const firstSharedPlatformMount=serverEntry.indexOf('app.use("/api/platform",platformOwnerSecurityRoutes);');
  assert.ok(firstSharedPlatformMount>=0,"The shared Platform route must be mounted");
  for(const laterRouter of ["platformSuperAdminAnalyticsDetailsRoutes","platformAdminRoutes","platformStoreIntegrationsRoutes"]){
    const laterMount=serverEntry.indexOf(`app.use("/api/platform",${laterRouter});`);
    assert.ok(laterMount>firstSharedPlatformMount,`${laterRouter} must stay after the shared store-module entry`);
  }

  assert.match(ui,/ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΜΟΝΟ — ΚΑΜΙΑ ΜΕΤΑΦΟΡΑ/);
  assert.match(ui,/Δεν υπάρχει κουμπί εφαρμογής/);
  assert.match(ui,/confirmed:true/);
  assert.doesNotMatch(ui,/migration\/apply/);

  for(const model of ["WorkforceEmployee","WorkforceRole","WorkforceEmployeeStoreAccess","WorkforceHourlyRate","WorkforceAuditLog"]){
    assert.match(schema,new RegExp(`model ${model}\\b`));
  }
});
