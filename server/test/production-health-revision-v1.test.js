import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

test("production health exposes deployed git revision", async () => {
  const source = await text("server/src/index.js");
  assert.match(source, /revision:process\.env\.RENDER_GIT_COMMIT\|\|process\.env\.GIT_COMMIT\|\|null/);
});

test("Render deploy gate waits for the exact GitHub revision", async () => {
  const workflow = await text(".github/workflows/deploy-render.yml");
  assert.match(workflow, /EXPECTED_REVISION: \$\{\{ steps\.revision\.outputs\.sha \}\}/);
  assert.match(workflow, /h\.ok===true&&h\.revision===process\.env\.EXPECTED_REVISION/);
  assert.doesNotMatch(workflow, /grep -Fq/);
});

test("Render deploy preserves the previous healthy revision as rollback evidence", async () => {
  const workflow = await text(".github/workflows/deploy-render.yml");
  assert.match(workflow, /Capture rollback checkpoint/);
  assert.match(workflow, /health\.revision/);
  assert.match(workflow, /render-rollback-checkpoint\.json/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /retention-days: 30/);
  const capture=workflow.indexOf("Capture rollback checkpoint");
  const trigger=workflow.indexOf("Trigger Render deployment");
  assert.ok(capture>=0&&trigger>capture,"rollback checkpoint must be captured before deployment");
});
