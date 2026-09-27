import fs from "node:fs";
import path from "node:path";

const assetsDir=path.resolve("client/dist/assets");
const bundles=fs.readdirSync(assetsDir).filter(name=>name.endsWith(".js"));
const bundle=bundles.find(name=>{
  const source=fs.readFileSync(path.join(assetsDir,name),"utf8");
  return source.includes("tableServiceEnabled")&&source.includes("ΤΡΑΠΕΖΙΑ");
});

if(!bundle){
  throw new Error("Το production bundle δεν περιέχει το TABLE_SERVICE / ΤΡΑΠΕΖΙΑ.");
}

console.log(`[build] TABLE_SERVICE verified in ${bundle}`);
