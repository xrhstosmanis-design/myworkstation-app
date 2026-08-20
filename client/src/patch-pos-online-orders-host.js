import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const file=path.join(here,"components/store/StorePosPanel.jsx");
let source=fs.readFileSync(file,"utf8");

if(!source.includes('data-online-orders-host="true"')){
  const pattern=/(<button type="button" onClick=\{\(\)=>setStoreMenu\(true\)\}[\s\S]*?<\/button>)(\{operator&&)/;
  if(!pattern.test(source))throw new Error("POS store-button anchor not found for online orders host");
  source=source.replace(pattern,'$1<span data-online-orders-host="true" style={{display:"inline-flex",alignItems:"center",minHeight:42}}></span>$2');
  fs.writeFileSync(file,source);
  console.log("[build] POS online orders host inserted beside store button");
}else{
  console.log("[build] POS online orders host already present");
}
