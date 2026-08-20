import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const indexFile=path.join(here,"index.js");
let source=fs.readFileSync(indexFile,"utf8");
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
fs.writeFileSync(indexFile,source);

const orderFile=path.join(here,"routes/kat-online-ordering.js");
let orderSource=fs.readFileSync(orderFile,"utf8");
const legacy='if(body.status==="DELIVERED")saleId=await postCommercialSale(tx,{order:current,store,user:req.user,config});';
const guarded='if(body.status==="DELIVERED"){const error=new Error("Η τελική παράδοση ολοκληρώνεται από το κανονικό POS με επιλογή Μετρητά ή Κάρτα.");error.status=409;throw error}';
if(orderSource.includes(legacy))orderSource=orderSource.replace(legacy,guarded);
fs.writeFileSync(orderFile,orderSource);
console.log("Online POS handoff route mounted and legacy direct delivery disabled.");
