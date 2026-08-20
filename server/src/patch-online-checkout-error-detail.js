import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

const here=path.dirname(fileURLToPath(import.meta.url));
const target=path.join(here,"index.js");
let source=fs.readFileSync(target,"utf8");
const marker="/* MWS_ONLINE_CHECKOUT_ERROR_DETAIL_V1 */";
if(source.includes(marker)){
  console.log("online checkout error detail patch already applied");
  process.exit(0);
}
const old='app.use((err,req,res,next)=>{console.error(err);if(err?.name==="ZodError") return res.status(400).json({error:"Ελέγξτε τα στοιχεία της φόρμας.",details:err.issues});if(err?.type==="entity.too.large")return res.status(413).json({error:"Το αρχείο είναι πολύ μεγάλο για εισαγωγή."});res.status(err?.status||500).json({error:err?.status?err.message:"Παρουσιάστηκε εσωτερικό σφάλμα."})});';
const replacement=`${marker}\napp.use((err,req,res,next)=>{console.error(err);if(err?.name==="ZodError") return res.status(400).json({error:"Ελέγξτε τα στοιχεία της φόρμας.",details:err.issues});if(err?.type==="entity.too.large")return res.status(413).json({error:"Το αρχείο είναι πολύ μεγάλο για εισαγωγή."});const onlineCheckout=Boolean(req?.body?.onlineOrderId)&&String(req?.path||"").includes("/store-pos/stores/")&&String(req?.path||"").endsWith("/checkout");res.status(err?.status||500).json({error:err?.status?err.message:(onlineCheckout?String(err?.message||"Άγνωστο σφάλμα Online POS checkout."):"Παρουσιάστηκε εσωτερικό σφάλμα.")})});`;
if(!source.includes(old))throw new Error("global error handler anchor not found");
source=source.replace(old,replacement);
fs.writeFileSync(target,source,"utf8");
console.log("online POS checkout now returns authenticated diagnostic error detail");
