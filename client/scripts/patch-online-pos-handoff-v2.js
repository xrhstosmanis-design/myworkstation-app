import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const file=path.resolve(here,"../src/kat-online-orders-pos-bootstrap.js");
let source=fs.readFileSync(file,"utf8");
const importLine='import "./kat-online-pos-handoff-v2.js";';
if(!source.includes(importLine))source=`${importLine}\n${source}`;
fs.writeFileSync(file,source);
console.log("Online POS handoff V2 wired into client build.");
