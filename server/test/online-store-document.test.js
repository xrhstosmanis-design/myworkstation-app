import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {once} from "node:events";
import express from "express";
import {onlineStoreDocumentHandler} from "../src/online-store-document.js";
import {fileURLToPath} from "node:url";

const publicDir = fileURLToPath(new URL("../../client/public/", import.meta.url));
const original = await readFile(new URL("../../client/public/kat/app.html", import.meta.url), "utf8");

test("crawler receives DAILY identity before JavaScript, with original storefront preserved", async t => {
  const app = express();
  app.get("/online/:publicSlug", onlineStoreDocumentHandler(publicDir));
  app.use(express.static(publicDir));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = "http://127.0.0.1:" + server.address().port;
  const headers = {"User-Agent": "WhatsApp/2.0"};
  for (const route of ["/online/daily-bite", "/online/daily-bite/?preview=fresh"]) {
    const response = await fetch(origin + route, {headers});
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();
    assert.equal((html.match(/<title>/g) || []).length, 1);
    assert.match(html, /<title>DAILY BITE - Online Παραγγελίες<\/title>/);
    assert.doesNotMatch(html.split("</head>")[0], /<title>Κυλικείο ΚΑΤ/);
    for (const property of ["og:title", "og:url", "og:image", "og:description"]) {
      assert.equal((html.match(new RegExp('property="' + property + '"', "g")) || []).length, 1);
    }
    assert.match(html, /rel="canonical" href="https:\/\/myworkstation-app.onrender.com\/online\/daily-bite"/);
    assert.match(html, /name="twitter:title" content="DAILY BITE/);
    assert.equal(html.slice(html.indexOf("<style>")), original.slice(original.indexOf("<style>")));
    const head = await fetch(origin + route, {method: "HEAD", headers});
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    assert.equal(head.headers.get("content-length"), response.headers.get("content-length"));
  }
  for (const slug of ["kat", "unknown-store", "DAILY-BITE"]) {
    assert.equal(await (await fetch(origin + "/online/" + slug, {headers})).text(), original);
  }
  const logoResponse = await fetch(origin + "/kat/brand-daily-bite.png", {headers});
  assert.equal(logoResponse.headers.get("content-type"), "image/png");
  const logo = Buffer.from(await logoResponse.arrayBuffer());
  assert.equal(logo.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(logo.readUInt32BE(16), 825);
  assert.equal(logo.readUInt32BE(20), 774);
});

test("missing shared document follows Express error handling", async t => {
  const app = express();
  app.get("/online/:publicSlug", onlineStoreDocumentHandler(publicDir + "/missing"));
  app.use((error, req, res, next) => res.status(503).send(error.code));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch("http://127.0.0.1:" + server.address().port + "/online/daily-bite");
  assert.equal(response.status, 503);
  assert.equal(await response.text(), "ENOENT");
});
