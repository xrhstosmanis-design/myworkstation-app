import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const file=path.join(here,"index.js");
let source=fs.readFileSync(file,"utf8");
const importLine='import katOnlinePosHandoffRoutes from "./routes/kat-online-pos-handoff.js";';
if(!source.includes(importLine)){
  const anchor='import katOnlineOrderingModifierRoutes from "./routes/kat-online-ordering-modifiers.js";';
  if(!source.includes(anchor))throw new Error("Online ordering import anchor not found.");
  source=source.replace(anchor,`${anchor}\n${importLine}`);
}
const useLine='app.use("/api/public/kat/pos-handoff",katOnlinePosHandoffRoutes);';
if(!source.includes(useLine)){
  const anchor='app.use("/api/public/kat",katOnlineOrderingModifierRoutes);';
  if(!source.includes(anchor))throw new Error("Online ordering mount anchor not found.");
  source=source.replace(anchor,`${anchor}\n${useLine}`);
}
fs.writeFileSync(file,source);
console.log("Online POS handoff route mounted.");
