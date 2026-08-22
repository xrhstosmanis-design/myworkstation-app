import fs from "fs";

const file=new URL("./index.js",import.meta.url);
let src=fs.readFileSync(file,"utf8");
let changed=false;

const importLine='import platformInvoiceLearningWorkspaceRoutes,{ensureInvoiceLearningWorkspaceSchema} from "./routes/platform-invoice-learning-workspace.js";';
if(!src.includes(importLine)){
  const marker='import platformAdminRoutes from "./routes/platform-admin.js";';
  if(!src.includes(marker))throw new Error("platform-admin import marker not found");
  src=src.replace(marker,`${marker}\n${importLine}`);
  changed=true;
}

const mountLine='app.use("/api/platform",platformInvoiceLearningWorkspaceRoutes);';
if(!src.includes(mountLine)){
  const marker='app.use("/api/platform",platformAdminRoutes);';
  if(!src.includes(marker))throw new Error("platform-admin mount marker not found");
  src=src.replace(marker,`${marker}\n${mountLine}`);
  changed=true;
}

if(!src.includes('await ensureInvoiceLearningWorkspaceSchema()')){
  const marker='await ensureMasterCatalogSchema();';
  if(!src.includes(marker))throw new Error("master catalog bootstrap marker not found");
  src=src.replace(marker,`${marker}await ensureInvoiceLearningWorkspaceSchema();`);
  changed=true;
}

if(changed){fs.writeFileSync(file,src);console.log("Invoice Learning central workspace route mounted.")}
else console.log("Invoice Learning central workspace route already mounted.");
