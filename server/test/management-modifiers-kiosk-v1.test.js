import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(repo,p),"utf8");
const backend="server/src/routes/management-modifiers.js";
const installer="client/src/components/commerce/installManagementModifiersSuite.js";
const bootstrap="client/src/management-modifiers-bootstrap.js";
const panel="client/src/components/commerce/ManagementModifiersPanel.jsx";
const css="client/src/components/commerce/management-modifiers.css";
const b=read(backend),i=read(installer),boot=read(bootstrap),c=read(panel),styles=read(css),index=read("server/src/index.js"),html=read("client/index.html");

test("modifiers backend and installer parse",()=>{execFileSync(process.execPath,["--check",path.join(repo,backend)]);execFileSync(process.execPath,["--check",path.join(repo,installer)]);execFileSync(process.execPath,["--check",path.join(repo,bootstrap)])});
test("modifiers use real additive company scoped tables",()=>{assert.match(b,/ManagementModifierGroup/);assert.match(b,/ManagementModifier/);assert.match(b,/companyId/);assert.match(b,/SUPER_ADMIN/);assert.match(b,/STORE_OPERATOR/);assert.doesNotMatch(b,/ΚΑΦΕ|ΣΟΚΟΛΑΤΑ|ΤΣΑΙ|EXTRA ΔΟΣΗ/)});
test("group expand loads only selected group modifiers",()=>{assert.match(c,/toggle=async group/);assert.match(c,/groups\/\$\{groupId\}\/modifiers/);assert.match(c,/expanded===group\.id/);assert.match(c,/ChevronDown/);assert.match(c,/ChevronRight/)});
test("modifier grid matches photographed columns and actions",()=>{for(const text of ["ID","Περιγραφή","α/α","Modifier","τιμή","κόστος (χωρίς ΦΠΑ)","Κλείσιμο","Ανανέωση","Νέα εγγραφή"])assert.ok(c.includes(text),text);assert.match(c,/<Edit3\/>/);assert.match(c,/<Trash2\/>/)});
test("group and modifier edits are real CRUD with soft deactivate",()=>{assert.match(b,/router\.post\("\/groups"/);assert.match(b,/router\.patch\("\/groups\/:id"/);assert.match(b,/router\.post\("\/groups\/:id\/modifiers"/);assert.match(b,/router\.patch\("\/modifiers\/:id"/);assert.match(b,/SET "active"=false/);assert.doesNotMatch(b,/DELETE FROM "ManagementModifier/)});
test("modifiers tab is enabled without new MutationObserver",()=>{assert.match(i,/Modifiers/);assert.match(i,/management-modifier-active/);assert.doesNotMatch(i+boot,/new MutationObserver/);assert.match(html,/management-modifiers-bootstrap\.js/)});
test("server mounts modifiers route before generic management route",()=>{const specific=index.indexOf('/api/management/modifiers');const generic=index.indexOf('/api/management",auth');assert.ok(specific>=0&&generic>=0&&specific<generic)});
test("MyWorkStation palette is preserved",()=>{assert.match(styles,/#123b5d/);assert.match(styles,/#0f766e/);assert.doesNotMatch(styles,/#ffa500|#ff9/i)});
