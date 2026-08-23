import fs from "fs";

const path=new URL("./routes/commerce-azure-invoice-reader.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const importLine='import {applyCentralSupplierProfile} from "../lib/invoice-supplier-profile-runtime.js";';
let changed=false;

if(!src.includes(importLine)){
  const anchor='import {reconcileAzureInvoice} from "../lib/invoice-azure-reconciler.js";';
  if(src.includes(anchor)){src=src.replace(anchor,`${anchor}\n${importLine}`);changed=true}
}

// Apply the centrally learned profile after deterministic Azure reconciliation.
// Replace every occurrence so both azure-direct and job ai-recheck use the same profile.
const anchor='    parsed=reconcileAzureInvoice(parsed);';
const replacement='    parsed=reconcileAzureInvoice(parsed);\n    parsed=await applyCentralSupplierProfile(parsed);';
if(!src.includes(replacement)&&src.includes(anchor)){
  src=src.split(anchor).join(replacement);changed=true;
}

if(changed){fs.writeFileSync(path,src);console.log("Commerce Azure invoice reader connected to central supplier reading profiles.")}
else console.log("Commerce Azure supplier-profile runtime already connected or source unchanged.");
