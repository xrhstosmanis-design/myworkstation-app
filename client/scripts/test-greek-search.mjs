import assert from "node:assert/strict";
import {matchesGreekSearch,normalizeGreekSearch} from "../src/utils/greek-search.js";

assert.equal(normalizeGreekSearch("  ΝΟΣΗΛΕΥΤΉΣ  "),"νοσηλευτησ");
assert.equal(normalizeGreekSearch("Νοσοκόμος"),"νοσοκομοσ");
assert.equal(matchesGreekSearch("νερο 1,5",["ΝΕΡΟ ΖΑΓΟΡΙ 1,5 LT","100029544"]),true);
assert.equal(matchesGreekSearch("ζαγορι νερο",["ΝΕΡΟ ΖΑΓΟΡΙ 500ML"]),true);
assert.equal(matchesGreekSearch("νοσηλευτης",["Νοσηλευτής / Νοσοκόμος"]),true);
assert.equal(matchesGreekSearch("500",["ΝΕΡΟ ΖΑΓΟΡΙ 1,5 LT"]),false);

console.log("Greek search tests passed.");
