import fs from "fs";

const path=new URL("../src/components/store/StorePosStandardModals.jsx",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="KAT_RETURN_ACTIVE_SHIFT_ONLY_V1";
if(src.includes(marker)){
  console.log("Return sales active-shift filter already installed.");
  process.exit(0);
}

const old=' const loadSales=async()=>{setBusy(true);try{const r=await api(`/api/store-pos/stores/${store.id}/sales/recent`);const a=(r.rows||[]).filter(s=>!s.reversalState&&s.source!=="POS_REVERSAL");setSales(a);chooseSale(a[0]||null)}catch(e){setError(e.message)}finally{setBusy(false)}};';
const replacement=' const loadSales=async()=>{setBusy(true);try{/* '+marker+' */const [r,overview]=await Promise.all([api(`/api/store-pos/stores/${store.id}/sales/recent`),api(`/api/cash-control/stores/${store.id}/overview`)]);const openedAt=overview?.openSession?.openedAt?new Date(overview.openSession.openedAt).getTime():null;const a=(r.rows||[]).filter(s=>!s.reversalState&&s.source!=="POS_REVERSAL"&&openedAt!==null&&new Date(s.occurredAt||s.createdAt).getTime()>=openedAt);setSales(a);chooseSale(a[0]||null)}catch(e){setSales([]);chooseSale(null);setError(e.message)}finally{setBusy(false)}};';
if(!src.includes(old)){
  console.error("Return sales loader anchor not found; refusing unsafe partial patch.");
  process.exit(1);
}
src=src.replace(old,replacement);
fs.writeFileSync(path,src);
console.log("POS returns now show only sales from the active shift.");
