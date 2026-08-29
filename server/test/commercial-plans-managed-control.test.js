import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root=new URL("../../",import.meta.url);

test("commercial plans and managed control remain separate",async()=>{
  const [ui,route,bootstrap]=await Promise.all([
    readFile(new URL("client/src/components/platform/CommercialLicensePanel.jsx",root),"utf8"),
    readFile(new URL("server/src/routes/platform-admin.js",root),"utf8"),
    readFile(new URL("server/src/platform-bootstrap.js",root),"utf8")
  ]);
  assert.match(ui,/label:"START",price:100/);
  assert.match(ui,/label:"BUSINESS",price:220/);
  assert.match(ui,/label:"AI COMPLETE",price:330/);
  assert.match(ui,/setPlanPrices/);
  assert.match(ui,/Εφαρμογή πακέτου/);
  assert.match(ui,/Έλεγχος BASIC.*149/s);
  assert.match(ui,/Έλεγχος COMPLETE.*249/s);
  assert.match(ui,/Έλεγχος PREMIUM.*349/s);
  assert.match(ui,/ξεχωριστά από τη συνδρομή λογισμικού/);
  assert.match(ui,/Εκτύπωση τιμοκαταλόγου/);
  assert.match(ui,/Οι τιμές δεν περιλαμβάνουν φυσική απογραφή/);
  assert.match(route,/CompanyManagedControlTerms/);
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS "CompanyManagedControlTerms"/);
});

test("commercial screen does not sell physical inventory services",async()=>{
  const ui=await readFile(new URL("client/src/components/platform/CommercialLicensePanel.jsx",root),"utf8");
  assert.match(ui,/δεν περιλαμβάνουν φυσική απογραφή/i);
  assert.doesNotMatch(ui,/ανά άτομο\/ώρα/i);
  assert.doesNotMatch(ui,/χρέωση φυσικής απογραφής/i);
});
