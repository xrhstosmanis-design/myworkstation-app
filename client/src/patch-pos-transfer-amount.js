import fs from "fs";

const path=new URL("./components/commerce/CommercialPosApp.jsx",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="POS_EMPLOYEE_TRANSFER_AMOUNT_V1";
if(src.includes(marker)){
  console.log("POS employee transfer amount already installed.");
  process.exit(0);
}

const stateNeedle='  const [paymentPanel,setPaymentPanel]=useState(false),[mixed,setMixed]=useState({cash:"",card:"",iris:""}),[holds,setHolds]=useState([]);';
if(!src.includes(stateNeedle))throw new Error("POS transfer patch: payment state anchor not found");
src=src.replace(stateNeedle,`${stateNeedle}\n  // ${marker}\n  const [transferPanel,setTransferPanel]=useState(false),[transferForm,setTransferForm]=useState({amount:"",description:"Μεταφορά ποσού"}),[posAccess,setPosAccess]=useState({});`);

const loadNeedle='setProducts(result.products||[]);setHolds(h.rows||[]);setCategory("")';
if(!src.includes(loadNeedle))throw new Error("POS transfer patch: loadPos anchor not found");
src=src.replace(loadNeedle,'setProducts(result.products||[]);setHolds(h.rows||[]);setPosAccess(result.access||{});setCategory("")');

const restoreNeedle='  const restoreHold=async()=>{const h=holds[0];if(!h)return setMessage("Δεν υπάρχει συναλλαγή σε αναμονή.");setBusy(true);setError("");try{const r=await api(`/api/store-pos/stores/${encodeURIComponent(storeId)}/holds/${encodeURIComponent(h.id)}/restore`,{method:"POST",body:"{}"});const rows=(r.items||[]).map(item=>({id:item.productId||item.id,name:item.name,sku:item.sku,qty:Number(item.quantity||item.qty||1),basePrice:Number(item.retailPrice??item.unitPrice??item.price??0),price:Number(item.effectiveUnitPrice??item.unitPrice??item.price??0),priceSource:item.priceSource||"RETAIL",stock:Number(item.stock||0)}));await applyCustomerPricing(r.customer||null,rows);setSelectedId(null);setMessage(`Επανήλθε συναλλαγή αναμονής ${money(r.total)}${r.customer?.name?` · ${r.customer.name}`:""}. Οι ενεργές τιμές θα επανελεγχθούν τώρα.`);await loadHolds()}catch(e){setError(e.message)}finally{setBusy(false)}};';
if(!src.includes(restoreNeedle))throw new Error("POS transfer patch: restoreHold anchor not found");
const transferCode=`${restoreNeedle}\n  const submitTransferAmount=async e=>{\n    e.preventDefault();\n    const amount=num(transferForm.amount);\n    if(amount<=0)return setError("Βάλε ποσό μεγαλύτερο από 0 για τη μεταφορά.");\n    if(!cashOverview?.openSession)return setError("Δεν υπάρχει ενεργή βάρδια για μεταφορά ποσού.");\n    setBusy(true);setError("");setMessage("");\n    try{\n      await api(\`/api/transactions/stores/\${encodeURIComponent(storeId)}\`,{method:"POST",body:JSON.stringify({type:"TRANSFER_AMOUNT",amount,description:transferForm.description||"Μεταφορά ποσού",subtractFromShift:false})});\n      setMessage(\`Μεταφορά ποσού \${money(amount)} καταχωρίστηκε στη βάρδια και στο BackOffice.\`);\n      setTransferPanel(false);setTransferForm({amount:"",description:"Μεταφορά ποσού"});\n      await loadPos();\n    }catch(err){setError(err.message)}finally{setBusy(false)}\n  };`;
src=src.replace(restoreNeedle,transferCode);

const actionNeedle='  const action=a=>{if(a==="CASH")return pay("CASH");if(a==="CARD")return pay("CARD");if(a==="IRIS")return pay("IRIS");if(a==="MIXED")return setPaymentPanel(true);if(a==="PAYMENTS")return setPaymentPanel(v=>!v);if(a==="HOLD")return hold();if(a==="CLEAR_CART"){setCart([]);setSelectedId(null);setCustomer(null);setWholesalePrices({});return}setMessage(`Η ενέργεια ${a} είναι καταγεγραμμένη στο TEST POS και θα συνδεθεί με το αντίστοιχο workflow.`)};';
if(!src.includes(actionNeedle))throw new Error("POS transfer patch: action anchor not found");
src=src.replace(actionNeedle,'  const action=a=>{if(a==="CASH")return pay("CASH");if(a==="CARD")return pay("CARD");if(a==="IRIS")return pay("IRIS");if(a==="MIXED")return setPaymentPanel(true);if(a==="PAYMENTS")return setPaymentPanel(v=>!v);if(a==="TRANSFER_AMOUNT")return setTransferPanel(true);if(a==="HOLD")return hold();if(a==="CLEAR_CART"){setCart([]);setSelectedId(null);setCustomer(null);setWholesalePrices({});return}setMessage(`Η ενέργεια ${a} είναι καταγεγραμμένη στο TEST POS και θα συνδεθεί με το αντίστοιχο workflow.`)};');

const footerNeedle='      <footer>{layout.buttons.filter(b=>b.visible).map(b=><button key={b.id} style={{background:b.color,color:String(b.color).toLowerCase()==="#ffffff"?"#173f34":"#fff"}} onClick={()=>action(b.action)} disabled={busy||quoteBusy||(["CASH","CARD","IRIS","MIXED"].includes(b.action)&&!cart.length)}>{b.label}</button>)}<div className="store-pos-total">';
if(!src.includes(footerNeedle))throw new Error("POS transfer patch: footer anchor not found");
const footerReplacement='      <footer>{layout.buttons.filter(b=>b.visible).map(b=><button key={b.id} style={{background:b.color,color:String(b.color).toLowerCase()==="#ffffff"?"#173f34":"#fff"}} onClick={()=>action(b.action)} disabled={busy||quoteBusy||(["CASH","CARD","IRIS","MIXED"].includes(b.action)&&!cart.length)}>{b.label}</button>)}{posAccess?.transferAmount&& !layout.buttons.some(b=>b.visible&&b.action==="TRANSFER_AMOUNT")&&<button style={{background:"#b7791f",color:"#fff"}} onClick={()=>setTransferPanel(true)} disabled={busy}>ΜΕΤΑΦΟΡΑ ΠΟΣΟΥ</button>}<div className="store-pos-total">';
src=src.replace(footerNeedle,footerReplacement);

const panelNeedle='    {paymentPanel&&<div className="pos-payment-panel"><div><h3>Πληρωμές</h3>';
if(!src.includes(panelNeedle))throw new Error("POS transfer patch: payment panel anchor not found");
const transferPanel='    {transferPanel&&<div className="pos-payment-panel"><form onSubmit={submitTransferAmount}><h3>Μεταφορά ποσού</h3><p>Η κίνηση θα καταγραφεί στον χειριστή, στη βάρδια και στο BackOffice. Δεν καταχωρίζεται ως έξοδο.</p><label>Ποσό<input autoFocus inputMode="decimal" value={transferForm.amount} onChange={e=>setTransferForm(v=>({...v,amount:e.target.value}))} placeholder="0,00"/></label><label>Αιτιολογία<input value={transferForm.description} onChange={e=>setTransferForm(v=>({...v,description:e.target.value}))}/></label><button disabled={busy}>{busy?"Καταχώριση…":"ΚΑΤΑΧΩΡΙΣΗ ΜΕΤΑΦΟΡΑΣ"}</button><button type="button" className="secondary" onClick={()=>setTransferPanel(false)} disabled={busy}>ΚΛΕΙΣΙΜΟ</button></form></div>}\n';
src=src.replace(panelNeedle,transferPanel+panelNeedle);

fs.writeFileSync(path,src);
console.log("POS employee transfer amount installed with BackOffice permission gate.");
