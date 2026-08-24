import fs from "fs";

const path=new URL("./routes/platform-admin.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="PILOT_BACKUP_RESTORE_VERIFY_V1";
if(src.includes(marker)){
  console.log("Pilot backup restore verification already installed.");
  process.exit(0);
}

const anchor='router.put("/companies/:companyId/stores/:storeId/store-mode-manager",async(req,res,next)=>{';
if(!src.includes(anchor)){
  console.log("Pilot backup restore verification anchor unavailable; skipped safely.");
  process.exit(0);
}

const route=`// ${marker}\nrouter.post("/companies/:companyId/stores/:storeId/pilot-backup/verify",async(req,res,next)=>{\n  try{\n    const document=req.body&&typeof req.body==="object"?req.body:null;\n    if(!document)return res.status(400).json({error:"Δεν δόθηκε έγκυρο backup JSON."});\n    if(document.format!=="MYWORKSTATION_PILOT_SAFETY_BACKUP_V1")return res.status(400).json({error:"Μη υποστηριζόμενη μορφή backup."});\n    if(document.scope?.companyId!==req.params.companyId||document.scope?.storeId!==req.params.storeId)return res.status(409).json({error:"Το backup ανήκει σε διαφορετικό πελάτη ή κατάστημα."});\n    const expected=String(document.integrity?.checksum||"").toLowerCase();\n    if(!/^[a-f0-9]{64}$/.test(expected))return res.status(400).json({error:"Το backup δεν περιέχει έγκυρο SHA-256 checksum."});\n    const snapshot={...document};delete snapshot.integrity;\n    const serialized=JSON.stringify(snapshot,(_key,value)=>typeof value==="bigint"?value.toString():value,2);\n    const actual=crypto.createHash("sha256").update(serialized).digest("hex");\n    if(actual!==expected)return res.status(409).json({error:"Αποτυχία ακεραιότητας backup — το αρχείο έχει αλλάξει ή αλλοιωθεί.",expected,actual});\n    const counts={\n      employees:Array.isArray(document.store?.employees)?document.store.employees.length:0,\n      shifts:Array.isArray(document.store?.shifts)?document.store.shifts.length:0,\n      schedules:Array.isArray(document.store?.schedules)?document.store.schedules.length:0,\n      categories:Array.isArray(document.commercial?.categories)?document.commercial.categories.length:0,\n      products:Array.isArray(document.commercial?.products)?document.commercial.products.length:0,\n      barcodes:Array.isArray(document.commercial?.barcodes)?document.commercial.barcodes.length:0,\n      storeProducts:Array.isArray(document.commercial?.storeProducts)?document.commercial.storeProducts.length:0,\n      suppliers:Array.isArray(document.commercial?.suppliers)?document.commercial.suppliers.length:0,\n      operators:Array.isArray(document.storeMode?.operators)?document.storeMode.operators.length:0,\n      layouts:Array.isArray(document.pos?.publishedLayouts)?document.pos.publishedLayouts.length:0\n    };\n    const completeness=document.completeness||{};\n    const warnings=[];\n    if(completeness.productCatalog===false)warnings.push("Το backup δημιουργήθηκε χωρίς διαθέσιμο Product table.");\n    if(completeness.storeProducts===false)warnings.push("Το backup δημιουργήθηκε χωρίς διαθέσιμο StoreProduct table.");\n    const store=await prisma.store.findFirst({where:{id:req.params.storeId,companyId:req.params.companyId},select:{id:true,name:true}});\n    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα προορισμού."});\n    await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"super-admin",event:"PILOT_SAFETY_BACKUP_RESTORE_VERIFIED",success:true,deviceName:\`\${store.name} · SHA256 \${actual.slice(0,16)}\`,userAgent:req.headers["user-agent"]||null,ipAddress:req.ip||null}});\n    res.json({ok:true,restorable:true,mode:"DRY_RUN_ONLY",checksum:actual,scope:document.scope,generatedAt:document.generatedAt||null,counts,warnings,security:{mutatedDatabase:false,secretsRestored:false}});\n  }catch(error){next(error)}\n});\n\n`;

src=src.replace(anchor,route+anchor);
fs.writeFileSync(path,src);
console.log("Pilot backup restore dry-run verification installed.");
