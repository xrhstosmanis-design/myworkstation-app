import React,{useEffect,useMemo,useState} from "react";
import {CreditCard,Keyboard,Printer,RefreshCw,Search,ShoppingCart,Trash2,Wallet,X} from "lucide-react";
import "../platform/pos-designer.css";
import "./store-pos.css";

const euro=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const fallbackLayout={title:"OPERATOR POS",productColumns:6,showSku:true,buttonFontScale:1,theme:{headerColor:"#033d2f",accentColor:"#087a52",surfaceColor:"#ffffff"},quickKeys:[],categories:[]};
const CATEGORY_PREFIX="CATEGORY::";
const isCategoryQuick=button=>String(button?.productQuery||"").startsWith(CATEGORY_PREFIX);
const quickCategory=button=>isCategoryQuick(button)?String(button.productQuery).slice(CATEGORY_PREFIX.length):"";
const identifierVariants=value=>{const raw=String(value??"").trim();if(!raw)return[];const compact=raw.replace(/[^0-9A-Za-zΑ-Ωα-ω]/g,"").toLocaleUpperCase("el-GR");const variants=new Set([raw.toLocaleUpperCase("el-GR"),compact]);if(/^\d+$/.test(compact))variants.add(compact.replace(/^0+(?=\d)/,""));return[...variants].filter(Boolean)};
const productIdentifiers=product=>[product?.id,product?.sku,product?.sourceCode,product?.masterCode,...(product?.barcodes||[])].flatMap(identifierVariants);
const productMatchesCodes=(product,codes)=>{const wanted=new Set((codes||[]).flatMap(identifierVariants));return wanted.size>0&&productIdentifiers(product).some(value=>wanted.has(value))};

export default function StorePosPanel({api,store,onChanged}){
  const [data,setData]=useState(null),[cart,setCart]=useState([]),[query,setQuery]=useState(""),[categoryModal,setCategoryModal]=useState(null),[received,setReceived]=useState(""),[keypadOpen,setKeypadOpen]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const load=async()=>{setError("");try{setData(await api(`/api/store-pos/stores/${store.id}`))}catch(err){setError(err.message)}};
  useEffect(()=>{load()},[store.id]);
  const layout=data?.layout||fallbackLayout,products=data?.products||[];
  const quickButtons=(layout.quickKeys||[]).filter(x=>x.visible),categoryButtons=(layout.categories||[]).filter(x=>x.visible);
  const fontScale=Math.max(.8,Math.min(1.8,Number(layout.buttonFontScale||1)));
  const searchRows=useMemo(()=>{const q=query.trim().toLocaleLowerCase("el-GR");if(!q)return[];return products.filter(product=>product.name.toLocaleLowerCase("el-GR").includes(q)||String(product.sku||"").toLocaleLowerCase("el-GR").includes(q)||(product.barcodes||[]).some(code=>String(code).includes(q))).slice(0,48)},[products,query]);
  const modalProducts=useMemo(()=>{if(!categoryModal)return[];const codes=categoryModal.productCodes||[];if(codes.length)return products.filter(product=>productMatchesCodes(product,codes));const name=categoryModal.categoryName||categoryModal.label;return products.filter(product=>String(product.categoryName||"").toLocaleLowerCase("el-GR")===String(name||"").toLocaleLowerCase("el-GR"))},[products,categoryModal]);
  const total=cart.reduce((sum,row)=>sum+row.salePrice*row.quantity,0),receivedNumber=Number(String(received||"").replace(",","."))||0,change=Math.max(0,receivedNumber-total);
  const add=product=>{setCart(current=>{const found=current.find(row=>row.id===product.id);return found?current.map(row=>row.id===product.id?{...row,quantity:row.quantity+1}:row):[...current,{...product,quantity:1}]});setQuery("")};
  const qty=(id,delta)=>setCart(current=>current.map(row=>row.id===id?{...row,quantity:Math.max(1,row.quantity+delta)}:row));
  const remove=id=>setCart(current=>current.filter(row=>row.id!==id));
  const quickProduct=button=>{const needle=String(button.productQuery||button.label||"").trim(),lower=needle.toLocaleLowerCase("el-GR");return products.find(product=>productMatchesCodes(product,[needle])||product.name.toLocaleLowerCase("el-GR").includes(lower))};
  const useQuick=button=>{if(isCategoryQuick(button)){setCategoryModal({label:button.label,categoryName:quickCategory(button),productCodes:button.productCodes||[],color:button.color});return}const product=quickProduct(button);if(product)add(product);else setError(`Δεν βρέθηκε το προϊόν για το κουμπί «${button.label}».`)};
  const checkout=async(paymentMethod,payments)=>{if(!cart.length)return;setBusy(true);setError("");setMessage("");try{const result=await api(`/api/store-pos/stores/${store.id}/checkout`,{method:"POST",body:JSON.stringify({paymentMethod,payments,items:cart.map(row=>({productId:row.id,quantity:row.quantity}))})});setCart([]);setReceived("");setMessage(`Η πώληση ${euro(result.total)} καταχωρίστηκε στο BackOffice του καταστήματος.`);onChanged?.()}catch(err){setError(err.message)}finally{setBusy(false)}};
  const mixed=()=>{if(!cart.length)return;const cash=Number(window.prompt(`Σύνολο ${euro(total)}. Πόσα μετρητά δίνει ο πελάτης;`,`0`)?.replace(",","."));if(!Number.isFinite(cash)||cash<0||cash>total)return;const card=Number((total-cash).toFixed(2));checkout("MIXED",[{method:"CASH",amount:cash},{method:"CARD",amount:card}])};
  const keypad=value=>{if(value==="⌫")return setReceived(v=>v.slice(0,-1));if(value===",")return setReceived(v=>v.includes(",")?v:`${v||"0"},`);setReceived(v=>`${v}${value}`)};
  const standardAction=action=>{switch(action){case"CLEAR":setCart([]);setReceived("");break;case"CASH":checkout("CASH");break;case"CARD":checkout("CARD");break;case"MIXED":mixed();break;case"PREP":setMessage("Η αποστολή στην Παρασκευή θα χρησιμοποιεί τα modifiers και τους σταθμούς του BackOffice.");break;case"PAYMENTS":setMessage("Το μενού Πληρωμών θα συνδεθεί με Μεταφορά ποσού, Έξοδα, Προμηθευτές, Πελάτες και Πληρωμές βάρδιας του BackOffice.");break;case"WASTE":setMessage("Η Φύρα θα καταγράφεται στο BackOffice, θα αφαιρεί stock και δεν θα εκδίδει φορολογική απόδειξη.");break;default:setMessage("Η λειτουργία είναι STANDARD και θα συνδεθεί με το BackOffice του καταστήματος.")}};

  return <article className="store-pos-card mws-standard-pos" style={{"--pos-head":layout.theme?.headerColor||"#033d2f","--pos-accent":layout.theme?.accentColor||"#087a52","--pos-button-font":fontScale}}>
    <div className="store-pos-top"><div><span>MYWORKSTATION · STANDARD POS</span><h2>{layout.title||"OPERATOR POS"}</h2><small>{store.name} · Έκδοση {data?.layoutVersion||0} · {products.length} ενεργά προϊόντα</small></div><div className="runtime-top-actions"><button onClick={()=>setKeypadOpen(v=>!v)} title="Εμφάνιση / απόκρυψη αριθμητικού πληκτρολογίου"><Keyboard/></button><button onClick={load}><RefreshCw/>Ανανέωση</button></div></div>
    {error&&<div className="store-pos-alert error">{error}</div>}{message&&<div className="store-pos-alert success">{message}</div>}

    <div className={`standard-pos-grid ${keypadOpen?"with-keypad":"without-keypad"}`}>
      <aside className="standard-quick-panel"><header><b>ΓΡΗΓΟΡΑ</b><small>{quickButtons.length}</small></header><div className="standard-quick-grid">{quickButtons.slice(0,16).map((button,index)=>{const categoryButton=isCategoryQuick(button),product=categoryButton?null:quickProduct(button),enabled=categoryButton?Boolean((button.productCodes||[]).length||quickCategory(button)):Boolean(product);return <button key={button.id} disabled={!enabled} onClick={()=>enabled&&useQuick(button)} style={{background:button.color,fontSize:`calc(13px * var(--pos-button-font))`}}><i>{index+1}</i><span>{button.label}</span>{product&&<small>{euro(product.salePrice)}</small>}</button>})}</div></aside>

      <section className="standard-sale-panel">
        <div className="standard-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Barcode, SKU ή αναζήτηση προϊόντος"/>{query&&<button onClick={()=>setQuery("")}><X/></button>}</div>
        {query&&<div className="standard-search-results">{searchRows.length?searchRows.map(product=><button key={product.id} onClick={()=>add(product)}><b>{product.name}</b><small>{product.sku||""}</small><strong>{euro(product.salePrice)}</strong></button>):<span>Δεν βρέθηκαν προϊόντα.</span>}</div>}
        <div className="standard-table-head"><span>ΠΟΣ.</span><span>ΕΙΔΟΣ</span><span>STOCK</span><span>ΤΙΜΗ</span><span>ΣΥΝΟΛΟ</span></div>
        <div className="standard-lines">{cart.length===0?<div className="standard-empty"><ShoppingCart/><b>Νέα συναλλαγή</b><span>Πάτησε Γρήγορο, Κατηγορία ή αναζήτησε / σκάναρε προϊόν.</span></div>:cart.map(row=><div className="standard-line" key={row.id}><div className="line-qty"><button onClick={()=>qty(row.id,-1)}>−</button><b>{row.quantity}</b><button onClick={()=>qty(row.id,1)}>+</button></div><div className="line-name"><b>{row.name}</b>{layout.showSku&&<small>{row.sku||""}</small>}</div><span>{row.currentStock??0}</span><span>{euro(row.salePrice)}</span><div className="line-total"><b>{euro(row.salePrice*row.quantity)}</b><button onClick={()=>remove(row.id)}><Trash2/></button></div></div>)}</div>
        <div className="standard-category-strip"><header><b>ΚΑΤΗΓΟΡΙΕΣ</b><small>Πατάς κατηγορία → ανοίγει popup προϊόντων</small></header><div>{categoryButtons.map((button,index)=><button key={button.id} onClick={()=>setCategoryModal({...button})} style={{background:button.color,fontSize:`calc(12px * var(--pos-button-font))`}}><i>{index+1}</i>{button.label}</button>)}</div></div>
      </section>

      {keypadOpen&&<aside className="standard-keypad"><button className="customer-button">ΠΕΛΑΤΗΣ — Πελάτης λιανικής</button><div className="money-cards"><span>ΕΛΑΒΑ<b>{receivedNumber?euro(receivedNumber):"0,00 €"}</b></span><span>ΡΕΣΤΑ<b>{euro(change)}</b></span></div><div className="number-grid">{[7,8,9,4,5,6,1,2,3,0,",","⌫"].map(value=><button key={value} onClick={()=>keypad(String(value))}>{value}</button>)}</div><button className="clear-money" onClick={()=>setReceived("")}>ΚΑΘΑΡΙΣΜΟΣ</button></aside>}
    </div>

    <div className="standard-action-bar"><button className="danger" onClick={()=>standardAction("CLEAR")}>ΑΚΥΡΩΣΗ</button><button onClick={()=>standardAction("HOLD")}>ΑΝΑΜΟΝΗ</button><button onClick={()=>standardAction("PAYMENTS")}><Wallet/>ΠΛΗΡΩΜΕΣ</button><button onClick={()=>standardAction("PREP")}><Printer/>ΠΑΡΑΣΚΕΥΗ</button><button onClick={()=>standardAction("WASTE")}>ΦΥΡΑ</button><button className="mixed" onClick={()=>standardAction("MIXED")}>ΜΙΚΤΗ</button><button className="card" onClick={()=>standardAction("CARD")} disabled={!cart.length||busy}><CreditCard/>ΚΑΡΤΑ</button><button className="cash" onClick={()=>standardAction("CASH")} disabled={!cart.length||busy}><Wallet/>ΜΕΤΡΗΤΑ</button><strong><small>ΣΥΝΟΛΟ</small>{euro(total)}</strong></div>

    {categoryModal&&<div className="category-product-overlay" onMouseDown={e=>e.target===e.currentTarget&&setCategoryModal(null)}><section><header><div><small>ΚΑΤΗΓΟΡΙΑ</small><h2>{categoryModal.label}</h2><p>{modalProducts.length} προϊόντα</p></div><button onClick={()=>setCategoryModal(null)}><X/></button></header><div className="category-product-grid" style={{gridTemplateColumns:`repeat(${Math.max(3,Math.min(7,Number(layout.productColumns||6)))},minmax(120px,1fr))`}}>{modalProducts.length?modalProducts.map(product=><button key={product.id} onClick={()=>{add(product);setCategoryModal(null)}} style={{fontSize:`calc(14px * var(--pos-button-font))`}}><b>{product.name}</b><small>{product.sku||""}</small><strong>{euro(product.salePrice)}</strong></button>):<div className="category-empty"><b>Δεν βρέθηκαν τα επιλεγμένα προϊόντα στο κατάστημα.</b><span>Η κατηγορία είναι αποθηκευμένη, αλλά χρειάζεται σωστή αντιστοίχιση με τα προϊόντα του BackOffice.</span></div>}</div></section></div>}

    <div className="store-pos-nonfiscal">KAT TEST / PILOT: η πώληση καταγράφεται στο MyWorkStation ως NON_FISCAL και δεν στέλνει εντολή σε RBS, CapDriver ή πραγματική ταμειακή.</div>
  </article>;
}
