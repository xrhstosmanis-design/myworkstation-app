import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const render=await readFile(new URL("../../render.yaml",import.meta.url),"utf8");
const ci=await readFile(new URL("../../.github/workflows/ci.yml",import.meta.url),"utf8");
const deploy=await readFile(new URL("../../.github/workflows/deploy-render.yml",import.meta.url),"utf8");

test("task 19 keeps one guarded production web deployment path",()=>{
  const web=render.slice(render.indexOf("name: myworkstation-app"),render.indexOf("- type: cron"));
  assert.match(web,/autoDeployTrigger: off/);
  assert.match(web,/buildFilter:\n\s+ignoredPaths:/);
  assert.match(web,/docs\/\*\*/);
  assert.match(web,/CHECKPOINTS\/\*\*/);
  assert.match(web,/ops\/backup\/\*\*/);
});

test("task 19 rebuilds the backup image only for backup source changes",()=>{
  const cron=render.slice(render.indexOf("- type: cron"));
  assert.match(cron,/buildFilter:\n\s+paths:\n\s+- ops\/backup\/\*\*/);
  assert.doesNotMatch(cron,/ignoredPaths/);
});

test("task 19 cancels obsolete PR checks but preserves running main and manual validation",()=>{
  assert.match(ci,/group: myworkstation-ci-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/);
  const expression=ci.match(/cancel-in-progress: \$\{\{ (.+) \}\}/)?.[1];
  assert.ok(expression,"Cancellation must be an explicit event-aware expression");
  for(const [event,cancel] of [["pull_request",true],["push",false],["workflow_dispatch",false]]){
    assert.equal(runInNewContext(expression,{github:{event_name:event}},{timeout:100}),cancel,event);
  }
  assert.doesNotMatch(ci,/queue:\s*max/,"Keep the existing bounded single-pending CI queue");
});

test("task 19 skips the expensive CI job for documentation-only commits",()=>{
  assert.match(ci,/classify-changes:/);
  assert.match(ci,/docs\/\*\|CHECKPOINTS\/\*\|output\/\*\|\*\.md/);
  assert.match(ci,/if: needs\.classify-changes\.outputs\.full_ci == 'true'/);
});

test("task 19 does not deploy documentation or service-isolated changes to the web app",()=>{
  assert.match(deploy,/Detect production source change/);
  assert.match(deploy,/\.github\/\*\|ops\/backup\/\*\|tools\/windows-kat-setup-exe\/\*/);
  assert.match(deploy,/if: needs\.classify-changes\.outputs\.deploy_required == 'true'/);
});
