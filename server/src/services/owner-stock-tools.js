import {z} from "zod";

export const stockToolArguments=z.object({product:z.string().trim().min(1).max(120)}).strict();
export const ownerStockTool={type:"function",name:"stock_by_product",strict:true,description:"Διαβάζει το τρέχον καταγεγραμμένο απόθεμα ενός ενεργού είδους από την κανονική Ανάλυση αποθήκης μόνο στο ήδη εξουσιοδοτημένο επιλεγμένο κατάστημα. product: περιγραφή ή SKU του χρήστη, όχι μετατροπή barcode. Δεν είναι φυσική καταμέτρηση ή ιστορικό απόθεμα. Ασαφές είδος απαιτεί συγκεκριμένο SKU χωρίς άθροισμα. Καμία μεταβολή.",parameters:{type:"object",additionalProperties:false,properties:{product:{type:"string",description:"Ακριβώς η περιγραφή ή το SKU που ζήτησε ο χρήστης."}},required:["product"]}};
const fail=(message,status=502)=>{throw Object.assign(new Error(message),{status})};
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR").trim().replace(/\s+/g," ");
const project=(row,keys)=>Object.fromEntries(keys.map(key=>[key,row[key]]));
const identity=["productId","sku","name"];
const units=new Set(["PIECE","KG","LITER","PACKAGE"]);

export async function readCanonicalOwnerStock(req,args,scope,{fetchImpl=fetch,port=process.env.PORT||8080,signal,now=new Date()}={}){
  args=stockToolArguments.parse(args);
  const authorization=req.headers?.authorization,validPort=String(port);
  if(typeof authorization!=="string"||!/^Bearer \S+$/.test(authorization))fail("Απαιτείται ενεργή σύνδεση.",401);
  if(!/^\d{1,5}$/.test(validPort)||+validPort<1||+validPort>65535)fail("Η πηγή αποθήκης δεν είναι διαθέσιμη.",503);
  if(!scope?.companyId||!scope?.storeId||!Number.isFinite(now.getTime()))fail("Η αναφορά αποθήκης δεν αντιστοιχεί σε έγκυρο κατάστημα.");
  // The canonical endpoint binds company to the original authenticated session
  // and checks the requested own active store. Current stock is independent of
  // its sales-period filters; a single day keeps those unused reads bounded.
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
  const query=new URLSearchParams({storeId:scope.storeId,q:args.product,from:today,to:today});
  const response=await fetchImpl(`http://127.0.0.1:${validPort}/api/reports/stock-analysis?${query}`,{method:"GET",headers:{Authorization:authorization},redirect:"error",signal});
  if(!response.ok)fail("Δεν διαβάστηκε η κανονική αναφορά αποθήκης. Δεν εμφανίζονται εκτιμήσεις ή μηδενικό απόθεμα.",[401,403,404].includes(response.status)?response.status:502);
  const report=await response.json();
  if(!Array.isArray(report?.items)||report.count!==report.items.length||report.items.length>10000||report.items.some(row=>!row||row.storeId!==scope.storeId||typeof row.productId!=="string"||!row.productId||typeof row.name!=="string"||!row.name.trim()||!(row.sku===null||typeof row.sku==="string")||!units.has(row.unit)||typeof row.currentStock!=="number"||!Number.isFinite(row.currentStock)))fail("Η αναφορά αποθήκης επέστρεψε μη έγκυρα στοιχεία για το επιλεγμένο κατάστημα.");
  const base={source:"Στατιστικά / Ανάλυση αποθήκης",kind:"product_stock",scope:"OWNER_SELECTED_STORE",companyId:scope.companyId,storeId:scope.storeId,storeName:scope.storeName,productQuery:args.product,observedAt:new Date().toISOString(),recordedStock:true,physicalCount:false,sourceRows:report.items.length,sourceLimit:10000,rows:[],candidates:[],truncated:false};
  if(report.items.length===10000)return {...base,result:"source_limited",truncated:true};
  const q=norm(args.product),exact=report.items.filter(row=>norm(row.sku)===q||norm(row.name)===q),matches=exact.length?exact:report.items.filter(row=>norm(row.sku).includes(q)||norm(row.name).includes(q));
  if(!matches.length)return {...base,result:"no_match"};
  const distinct=new Map(matches.map(row=>[row.productId,row]));
  if(matches.length!==1)return {...base,result:"ambiguous",candidateCount:distinct.size,candidates:[...distinct.values()].slice(0,20).map(row=>project(row,identity)),truncated:distinct.size>20};
  return {...base,result:"matched",rows:[project(matches[0],[...identity,"storeId","storeName","currentStock","unit"])]};
}
