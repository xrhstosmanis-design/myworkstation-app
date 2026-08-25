import fs from "fs";

const path=new URL("../src/components/store/StorePosStandardModals.jsx",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="KAT_POS_VOID_SALE_V2";
if(src.includes(marker)){
  console.log("POS VOID sale patch already installed.");
  process.exit(0);
}

const titleAnchor=' const title={CUSTOMER:"Πελάτης",HOLDS:"Αναμονή συναλλαγής",WASTE:"Φύρα / Κατανάλωση προσωπικού",MIXED:"Μικτή πληρωμή",RETURN:"Επιστροφή"}[active]||"POS";';
if(!src.includes(titleAnchor)){
  console.error("POS VOID function anchor not found; refusing unsafe partial patch.");
  process.exit(1);
}
const voidFn=' const voidSale=async()=>{if(!sale)return setError("Επίλεξε συναλλαγή.");if(!window.confirm(`Να ακυρωθεί οριστικά η πώληση ${euro(sale.total)};`))return;setBusy(true);try{await api(`/api/store-pos/stores/${store.id}/sales/${sale.id}/reverse`,{method:"POST",body:JSON.stringify({kind:"CANCEL",reason:returnReason||"Ακύρωση από χειριστή"})});setMessage(`Η ακύρωση / VOID ${euro(sale.total)} καταχωρίστηκε.`);onChanged?.();onClose()}catch(e){setError(e.message)}finally{setBusy(false)}}; // '+marker+'\n';
src=src.replace(titleAnchor,voidFn+titleAnchor);

const submitAnchor='</button></>}</div></div>}';
if(!src.includes(submitAnchor)){
  console.error("POS VOID button anchor not found; refusing unsafe partial patch.");
  process.exit(1);
}
const voidButton='</button><button className="pos-danger-action" disabled={busy} onClick={voidSale}>ΑΚΥΡΩΣΗ / VOID ΟΛΟΚΛΗΡΩΜΕΝΗΣ ΠΩΛΗΣΗΣ {euro(sale.total)}</button></>}</div></div>}';
src=src.replace(submitAnchor,voidButton);

fs.writeFileSync(path,src);
console.log("POS completed-sale VOID action installed.");
