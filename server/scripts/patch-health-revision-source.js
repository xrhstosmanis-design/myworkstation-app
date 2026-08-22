import fs from "node:fs";

const fileUrl=new URL("../src/index.js",import.meta.url);
const path=fileUrl.pathname;
const before=fs.readFileSync(path,"utf8");
if(before.includes("revision:process.env.RENDER_GIT_COMMIT")){
  console.log("Health revision source already patched.");
  process.exit(0);
}
const old='app.get("/api/health",(_,res)=>res.json({ok:true,version:"0.22.0+kat-test-pos"}));';
const next='app.get("/api/health",(_,res)=>res.json({ok:true,version:"0.22.0+kat-test-pos",revision:process.env.RENDER_GIT_COMMIT||process.env.GITHUB_SHA||"local",uptimeSeconds:Math.floor(process.uptime())}));';
if(!before.includes(old))throw new Error("Health endpoint anchor changed; refusing unsafe patch.");
fs.writeFileSync(path,before.replace(old,next),"utf8");
console.log("Health revision source patch applied.");
