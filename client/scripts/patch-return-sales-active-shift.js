import fs from "fs";

const path=new URL("../src/components/store/StorePosStandardModals.jsx",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="RETURN_SALES_EXACT_SESSION_V2";
if(src.includes(marker)){
  console.log("Return sales exact-session filter already installed.");
  process.exit(0);
}

const old=' const loadSales=async()=>{setBusy(true);try{const r=await api(`/api/store-pos/stores/${store.id}/sales/recent`);const a=(r.rows||[]).filter(s=>!s.reversalState&&s.source!=="POS_REVERSAL");setSales(a);chooseSale(a[0]||null)}catch(e){setError(e.message)}finally{setBusy(false)}};';
const replacement=' const loadSales=async()=>{setBusy(true);try{/* '+marker+' */const [r,overview]=await Promise.all([api(`/api/store-pos/stores/${store.id}/sales/recent`),api(`/api/cash-control/stores/${store.id}/overview`)]);const sessionId=overview?.openSession?.id;const a=(r.rows||[]).filter(s=>!s.reversalState&&s.source==="POS"&&sessionId&&s.sessionId===sessionId);setSales(a);chooseSale(a[0]||null)}catch(e){setSales([]);chooseSale(null);setError(e.message)}finally{setBusy(false)}};';
if(!src.includes(old)){
  console.error("Return sales loader anchor not found; refusing unsafe partial patch.");
  process.exit(1);
}
src=src.replace(old,replacement);
fs.writeFileSync(path,src);
console.log("POS returns now show only sales from the active shift.");
