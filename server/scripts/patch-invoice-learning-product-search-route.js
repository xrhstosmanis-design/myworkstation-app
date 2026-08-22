import fs from "node:fs";
const p=new URL("../src/index.js",import.meta.url);let s=fs.readFileSync(p,"utf8");
const imp='import platformInvoiceLearningProductSearchRoutes from "./routes/platform-invoice-learning-product-search.js";';
if(!s.includes(imp)){
  const anchor='import platformAdvancedOnlineSearchRoutes from "./routes/platform-advanced-online-search.js";';
  if(!s.includes(anchor))throw new Error("platform route import anchor missing");
  s=s.replace(anchor,anchor+'\n'+imp);
}
const mount='app.use("/api/platform",platformInvoiceLearningProductSearchRoutes);';
if(!s.includes(mount)){
  const anchor='app.use("/api/platform/advanced-online-search",platformAdvancedOnlineSearchRoutes);';
  if(!s.includes(anchor))throw new Error("platform route mount anchor missing");
  s=s.replace(anchor,anchor+'\n'+mount);
}
fs.writeFileSync(p,s,"utf8");
console.log("Invoice Learning product search route registered.");
