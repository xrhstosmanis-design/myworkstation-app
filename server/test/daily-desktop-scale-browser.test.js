import test from "node:test";
import assert from "node:assert/strict";
import {readFile, writeFile, mkdtemp, rm, access} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {renderPosFixture} from "./helpers/pos-ui-browser.mjs";

const html = await readFile(new URL("../../client/public/kat/app.html", import.meta.url), "utf8");
const baseline = html.replace(/\/\* DAILY-DESKTOP-SCALE-01[\s\S]*?(?=<\/style>)/, "");
let chrome = process.env.CHROME_BIN;
for (const bin of ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) {
  if (!chrome) {try {await access(bin); chrome = bin;} catch {}}
}

for (const width of [1920, 1440, 1024, 768, 390]) {
  test("actual DAILY desktop readability and unchanged narrow/KAT layout at " + width, {skip: !chrome && !process.env.CI, timeout: 90000}, async () => {
    assert.ok(chrome, "Chromium required in CI");
    const dir = await mkdtemp(path.join(tmpdir(), "daily-scale-"));
    try {
      const sizes = {};
      for (const store of ["daily-olive-orange", "kat-olive-orange"]) {
        for (const [kind, source] of [["before", baseline], ["after", html]]) {
          const name = store + "-" + kind;
          const fixture = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace('<html lang="el">', '<html lang="el" class="' + store + '">');
          const file = path.join(dir, name + ".html");
          const probe = `const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}},styles=s=>{const c=getComputedStyle(document.querySelector(s));return {font:c.fontSize,line:c.lineHeight}};document.body.dataset.result=JSON.stringify({viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,shell:rect('.shell'),head:rect('.head'),logo:rect('.logo'),search:rect('.search'),cart:rect('.cart'),checkout:rect('.checkout'),body:styles('body'),title:styles('.brand h1')})`;
          await writeFile(file, fixture.replace("</body>", "<script>" + probe + "</script></body>"));
          const result = await renderPosFixture({chrome, file, width, height: 1080, profile: path.join(dir, name)});
          sizes[name] = JSON.parse(result.result);
          assert.equal(sizes[name].viewport, width);
          assert.equal(sizes[name].overflow, false, name + " horizontal overflow");
          assert.ok(sizes[name].search.width >= 150, name + " useful search");
          assert.ok(sizes[name].checkout.width >= 240, name + " reachable checkout");
        }
        const before = sizes[store + "-before"], after = sizes[store + "-after"];
        if (store === "kat-olive-orange" || width <= 1000) {
          assert.deepEqual(after, before, store + " preserved geometry and typography");
        } else {
          assert.ok(parseFloat(after.body.font) > parseFloat(before.body.font), "larger readable base");
          assert.ok(parseFloat(after.title.font) > parseFloat(before.title.font), "larger store title");
          assert.ok(after.logo.width > before.logo.width, "larger original logo");
          assert.ok(after.checkout.height >= 50, "large checkout control");
          if (width === 1920) {
            assert.ok(after.shell.width > before.shell.width, "use wide screen");
            assert.ok(after.shell.width >= width * .9, "occupy at least90percent desktop width");
          }
        }
      }
    } finally {
      await rm(dir, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
    }
  });
}
