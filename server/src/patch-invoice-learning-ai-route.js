import fs from "fs";

const path=new URL("./index.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const importLine='import platformInvoiceLearningAiRoutes from "./routes/platform-invoice-learning-ai.js";';
if(!src.includes(importLine)){
  const marker='import platformAdvancedOnlineSearchRoutes from "./routes/platform-advanced-online-search.js";';
  if(!src.includes(marker))throw new Error("invoice-learning AI patch: import marker not found");
  src=src.replace(marker,`${marker}\n${importLine}`);
}
const barcodeImport='import platformInvoiceBarcodeResolverRoutes from "./routes/platform-invoice-barcode-resolver.js";';
if(!src.includes(barcodeImport)){
  const marker=importLine;
  if(!src.includes(marker))throw new Error("invoice-learning barcode patch: import marker not found");
  src=src.replace(marker,`${marker}\n${barcodeImport}`);
}
const mount='app.use("/api/platform",platformInvoiceLearningAiRoutes);';
if(!src.includes(mount)){
  const marker='app.use("/api/platform",platformAuditRoutes);';
  if(!src.includes(marker))throw new Error("invoice-learning AI patch: mount marker not found");
  src=src.replace(marker,`${marker}\n${mount}`);
}
const barcodeMount='app.use("/api/platform",platformInvoiceBarcodeResolverRoutes);';
if(!src.includes(barcodeMount)){
  const marker=mount;
  if(!src.includes(marker))throw new Error("invoice-learning barcode patch: mount marker not found");
  src=src.replace(marker,`${marker}\n${barcodeMount}`);
}
fs.writeFileSync(path,src);
console.log("Invoice Learning AI + barcode resolver platform routes mounted.");
