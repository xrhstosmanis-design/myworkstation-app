import {readFile,writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";

const indexPath=fileURLToPath(new URL("../src/index.js",import.meta.url));

function insertAfter(source,anchor,addition){
  if(source.includes(addition.trim()))return source;
  if(!source.includes(anchor))throw new Error(`Δεν βρέθηκε το anchor efood route: ${anchor}`);
  return source.replace(anchor,`${anchor}\n${addition}`);
}

export function patchEfoodPelicanRoutes(source){
  let next=source;
  next=insertAfter(next,'import platformStoreIntegrationsRoutes from "./routes/platform-store-integrations.js";','import platformEfoodIntegrationRoutes from "./routes/platform-efood-integrations.js";\nimport efoodPelicanWebhookRoutes from "./routes/efood-pelican-webhook.js";');
  next=insertAfter(next,'app.use("/api/public/online",katOnlineOrderingModifierRoutes);','app.use("/api/public/efood",efoodPelicanWebhookRoutes);');
  next=insertAfter(next,'app.use("/api/platform",platformStoreIntegrationsRoutes);','app.use("/api/platform",platformEfoodIntegrationRoutes);');
  return next;
}

async function main(){
  const source=await readFile(indexPath,"utf8");
  const patched=patchEfoodPelicanRoutes(source);
  if(patched!==source)await writeFile(indexPath,patched,"utf8");
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])main().catch(error=>{console.error(error);process.exit(1)});
