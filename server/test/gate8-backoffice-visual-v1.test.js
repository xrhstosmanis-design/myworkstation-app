import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const commerce=fs.readFileSync(new URL("../../client/src/components/commerce/CommerceHub.jsx",import.meta.url),"utf8");
const styles=fs.readFileSync(new URL("../../client/src/styles.css",import.meta.url),"utf8");

test("BackOffice module navigation never renders escaped newline text",()=>{
  assert.doesNotMatch(commerce,/<\/button>\\n\s*<button/);
  assert.doesNotMatch(commerce,/<BackofficeVideoAuditPanel[^>]+\/>\\n\\n/);
});

test("employee editor is wide, responsive and keeps controls in one form",()=>{
  assert.match(styles,/\.modal form:has\(>\.natural-rule-editor\)\{width:min\(860px,calc\(100vw - 30px\)\)/);
  assert.match(styles,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles,/@media\(max-width:700px\)\{\.modal form:has\(>\.natural-rule-editor\)/);
});
