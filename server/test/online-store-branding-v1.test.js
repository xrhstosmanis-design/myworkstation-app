import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const bootstrap=await readFile(new URL("../src/kat-online-ordering-bootstrap.js",import.meta.url),"utf8");
const admin=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const route=await readFile(new URL("../src/routes/kat-online-ordering-modifiers.js",import.meta.url),"utf8");
const manager=await readFile(new URL("../../client/src/components/platform/OnlineStoreManager.jsx",import.meta.url),"utf8");
const storefront=await readFile(new URL("../../client/public/kat/app.html",import.meta.url),"utf8");

test("branding fields are additive and scoped to each online store config",()=>{
  for(const field of ["brandName","brandTagline","brandLogoUrl","brandPrimaryColor","brandSecondaryColor","brandWelcomeMessage","estimatedMinutes"]){assert.match(bootstrap,new RegExp(`"${field}"`));assert.match(admin,new RegExp(field));assert.match(route,new RegExp(field))}
});

test("Super Admin validates safe branding values",()=>{
  assert.match(admin,/brandPrimaryColor:z\.string\(\)\.regex/);
  assert.match(admin,/brandSecondaryColor:z\.string\(\)\.regex/);
  assert.match(admin,/regex\(\/\^https\?:\\\/\\\//);
  assert.match(admin,/estimatedMinutes:z\.coerce\.number\(\)\.int\(\)\.min\(5\)\.max\(180\)/);
});

test("branding editor exposes name, logo, colors, message and preparation time",()=>{
  for(const label of ["Όνομα καταστήματος","URL λογοτύπου","Μήνυμα καλωσορίσματος","Βασικό χρώμα","Εκτιμώμενος χρόνος"])assert.match(manager,new RegExp(label));
});

test("public storefront applies branding without injecting HTML",()=>{
  assert.match(storefront,/style\.setProperty\('--wine'/);
  assert.match(storefront,/logo\.src=settings\.brandLogoUrl/);
  assert.match(storefront,/brandWelcome\.textContent=settings\.brandWelcomeMessage/);
  assert.doesNotMatch(storefront,/brandWelcome\.innerHTML/);
});
