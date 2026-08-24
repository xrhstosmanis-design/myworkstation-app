import fs from "fs";

const path=new URL("./routes/cash-control.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="MULTI_POS_CLOSE_GUARD_V1";
if(src.includes(marker)){
  console.log("Multi-POS close guard already installed.");
  process.exit(0);
}

const anchor='router.post("/sessions/:sessionId/close",route(async(req,res)=>{\n  const body=closeSchema.parse(req.body||{}),actorName=req.user.fullName||"Χρήστης";';
if(!src.includes(anchor)){
  console.log("Multi-POS close guard anchor unavailable; skipped safely.");
  process.exit(0);
}

const replacement=`router.post("/sessions/:sessionId/close",route(async(req,res)=>{\n  // ${marker}\n  if(req.user?.tokenType==="STORE_OPERATOR"){\n    const terminalPos=await requestTerminal(req);\n    const terminalRows=await prisma.$queryRaw\`SELECT \"terminalPos\" FROM \"CashShiftSession\" WHERE \"id\"=\${req.params.sessionId} AND \"companyId\"=\${req.user.companyId} AND \"storeId\"=\${req.user.storeId} LIMIT 1\`;\n    if(!terminalRows[0])return res.status(404).json({error:"Δεν βρέθηκε η βάρδια."});\n    if(String(terminalRows[0].terminalPos||"MAIN").trim().toUpperCase()!==terminalPos)return res.status(403).json({error:"Δεν μπορείς να κλείσεις βάρδια άλλου POS."});\n  }\n  const body=closeSchema.parse(req.body||{}),actorName=req.user.fullName||"Χρήστης";`;

src=src.replace(anchor,replacement);
fs.writeFileSync(path,src);
console.log("Multi-POS cross-terminal close guard installed.");
