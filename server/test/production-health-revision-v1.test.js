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
  assert.match(workflow, /EXPECTED_REVISION: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /\\"revision\\":\\"\$EXPECTED_REVISION\\"/);
});
