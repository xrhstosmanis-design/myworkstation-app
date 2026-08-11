import React,{useEffect,useMemo,useState} from "react";
import {RefreshCw,Search,ShoppingCart,Trash2} from "lucide-react";
import "../platform/pos-designer.css";
import "./store-pos.css";

const euro=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const fallbackLayout={title:"OPERATOR POS",productColumns:6,showSku:true,theme:{headerColor:"#033d2f",accentColor:"#087a52",surfaceColor:"#ffffff"},quickKeys:[],categories:[],buttons:[]};
const CATEGORY_PREFIX="CATEGORY::";
const isCategoryQuick=button=>String(button?.productQuery||"").startsWith(CATEGORY_PREFIX);
const quickCategory=button=>isCategoryQuick(button)?String(button.productQuery).slice(CATEGORY_PREFIX.length):"";
const identifierVariants=value=>{
  const raw=String(value??"").trim();
  if(!raw)return [];
  const compact=raw.replace(/[^0-9A-Za-zΑ-Ωα-ω]/g,"").toLocaleUpperCase("el-GR");
  const variants=new Set([raw.toLocaleUpperCase("el-GR"),compact]);
  if(/^\d+$/.test(compact))variants.add(compact.replace(/^0+(?=\d)/,""));
  return [...variants].filter(Boolean);
};
const productIdentifiers=product=>[product?.id,product?.sku,...(product?.barcodes||[])].flatMap(identifierVariants);
const productMatchesCodes=(product,codes)=>{
  const wanted=new Set((codes||[]).flatMap(identifierVariants));
  if(!wanted.size)return false;
  return productIdentifiers(product).some(value=>wanted.has(value));
};

export default function StorePosPanel({api,store,onChanged}){
  const [data,setData]=useState(null),[cart,setCart]=useState([]),[query,setQuery]=useState(""),[category,setCategory]=useState(""),[categoryCodes,setCategoryCodes]=useState([]),[browseActive,setBrowseActive]=useState(false),[received,setReceived]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const load=async()=>{setError("");try{setData(await api(`/api/store-pos/stores/${store.id}`))}catch(err){setError(err.message)}};
  useEffect(()=>{load()},[store.id]);
  const layout=data?.layout||fallbackLayout;
  const products=data?.products||[];
  const allCategories=useMemo(()=>[...new Set(products.map(p=>p.categoryName).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"el")),[products]);
  const visible=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase("el-GR");
    if(!browseActive&&!q)return [];
    return products.filter(product=>{
      const matches=!q||product.name.toLocaleLowerCase("el-GR").includes(q)||String(product.sku||"").toLocaleLowerCase("el-GR").includes(q)||(product.barcodes||[]).some(code=>String(code).includes(q));
      const categoryMatch=categoryCodes.length?productMatchesCodes(product,categoryCodes):(!category||product.categoryName===category);
      return matches&&categoryMatch;
    }).slice(0,120);
  },[products,query,category,categoryCodes,browseActive]);
  const total=cart.reduce((sum,row)=>sum+row.salePrice*row.quantity,0);
  const receivedNumber=Number(String(received||"").replace(",","."))||0;
  const change=Math.max(0,receivedNumber-total);
  const add=product=>setCart(current=>{const found=current.find(row=>row.id===product.id);return found?current.map(row=>row.id===product.id?{...row,quantity:row.quantity+1}:row):[...current,{...product,quantity:1}]});
  const qty=(id,delta)=>setCart(current=>current.map(row=>row.id===id?{...row,quantity:Math.max(1,row.quantity+delta)}:row));
  const remove=id=>setCart(current=>current.filter(row=>row.id!==id));
  const quickProduct=button=>{
    const needle=String(button.productQuery||button.label||"").trim();
    const lower=needle.toLocaleLowerCase("el-GR");
    return products.find(product=>productMatchesCodes(product,[needle])||product.name.toLocaleLowerCase("el-GR").includes(lower));
  };
  const openGroup=(label,codes,fallbackCategory="")=>{setQuery("");setBrowseActive(true);setCategory(label||fallbackCategory||"");setCategoryCodes(Array.isArray(codes)?codes:[]);setMessage("")};
  const home=()=>{setCategory("");setCategoryCodes([]);setBrowseActive(false);setQuery("");setMessage("")};
  const useQuick=button=>{if(isCategoryQuick(button)){openGroup(button.label,button.productCodes||[],quickCategory(button));return}const product=quickProduct(button);if(product)add(product);else setError(`Δεν βρέθηκε το προϊόν για το κουμπί «${button.label}».`)};
  const checkout=async paymentMethod=>{if(!cart.length)return;setBusy(true);setError("");setMessage("");try{const result=await api(`/api/store-pos/stores/${store.id}/checkout`,{method:"POST",body:JSON.stringify({paymentMethod,items:cart.map(row=>({productId:row.id,quantity:row.quantity}))})});setCart([]);setReceived("");setMessage(`Η πώληση ${euro(result.total)} καταχωρίστηκε.`);onChanged?.()}catch(err){setError(err.message)}finally{setBusy(false)}};
  const runAction=button=>{switch(button.action){case"CASH":checkout("CASH");break;case"CARD":checkout("CARD");break;case"CLEAR_CART":setCart([]);setReceived("");break;default:setMessage(`Η ενέργεια «${button.label}» είναι διαθέσιμη στη διάταξη και θα συνδεθεί με την αντίστοιχη εμπορική λειτουργία.`)}};
  const keypad=value=>{if(value==="⌫")return setReceived(v=>v.slice(0,-1));if(value===",")return setReceived(v=>v.includes(",")?v:`${v||"0"},`);setReceived(v=>`${v}${value}`)};
  const categoryButtons=(layout.categories||[]).filter(x=>x.visible);
  const quickButtons=(layout.quickKeys||[]).filter(x=>x.visible);
  const actionButtons=(layout.buttons||[]).filter(x=>x.visible);

  return <article className="store-pos-card store-pos-designer-runtime">
    <div className="store-pos-top" style={{background:layout.theme?.headerColor||"#033d2f"}}><div><span>ΚΑΝΟΝΙΚΟ POS · ΔΗΜΟΣΙΕΥΜΕΝΗ ΔΙΑΤΑΞΗ</span><h2>{layout.title||"OPERATOR POS"}</h2><small>Έκδοση {data?.layoutVersion||0} · {products.length} ενεργά προϊόντα</small></div><button onClick={load}><RefreshCw/>Ανανέωση</button></div>
    {error&&<div className="store-pos-alert error">{error}</div>}{message&&<div className="store-pos-alert success">{message}</div>}
    <div className="operator-pos-preview store-runtime-pos" style={{"--preview-head":layout.theme?.headerColor||"#033d2f","--preview-accent":layout.theme?.accentColor||"#087a52","--preview-surface":layout.theme?.surfaceColor||"#fff"}}>
      <div className="operator-preview-head"><b>MW</b><span>MyWorkStation · {store.name}<strong>{layout.title||"OPERATOR POS"}</strong></span><input value={query} onChange={e=>{setQuery(e.target.value);setBrowseActive(Boolean(e.target.value.trim()))}} placeholder="Barcode ή αναζήτηση προϊόντος"/><button aria-label="Αναζήτηση"><Search/></button><small>Συνδεδεμένος<br/>Εργαζόμενος</small></div>

      <aside className="operator-quick"><header><b>ΓΡΗΓΟΡΑ</b><small>{quickButtons.length} θέσεις</small></header>{quickButtons.slice(0,16).map((button,index)=>{const categoryButton=isCategoryQuick(button);const product=categoryButton?null:quickProduct(button);const enabled=categoryButton?Boolean((button.productCodes||[]).length||quickCategory(button)):Boolean(product);return <button key={button.id} disabled={!enabled} onClick={()=>enabled&&useQuick(button)} style={{background:button.color}}><i>{index+1}</i>{button.label}{!categoryButton&&product&&<small>{euro(product.salePrice)}</small>}</button>})}</aside>

      <main className="operator-sale">
        <div className="operator-table-head"><span>ΠΟΣ.</span><span>ΕΙΔΟΣ</span><span>STOCK</span><span>ΤΙΜΗ</span><span>ΣΥΝΟΛΟ</span></div>
        <div className="runtime-transaction-area">{cart.length===0?<div className="operator-empty">🛒<b>Νέα συναλλαγή</b><small>Πάτησε προϊόν ή σκάναρε barcode</small></div>:cart.map(row=><div className="runtime-sale-row" key={row.id}><span className="runtime-qty"><button onClick={()=>qty(row.id,-1)}>−</button><b>{row.quantity}</b><button onClick={()=>qty(row.id,1)}>+</button></span><span><b>{row.name}</b>{layout.showSku&&<small>{row.sku||""}</small>}</span><span>{row.currentStock??row.stock??0}</span><span>{euro(row.salePrice)}</span><span><b>{euro(row.salePrice*row.quantity)}</b><button className="runtime-trash" onClick={()=>remove(row.id)}><Trash2/></button></span></div>)}</div>
        <div className="operator-category-head"><b>{browseActive?(category||"ΑΠΟΤΕΛΕΣΜΑΤΑ"):"ΚΑΤΗΓΟΡΙΕΣ"}</b><span>{browseActive?<button className="runtime-home-link" onClick={home}>ΒΑΣΙΚΗ ΟΘΟΝΗ</button>:"ΒΑΣΙΚΗ ΟΘΟΝΗ"}</span></div>
        <div className="operator-categories runtime-category-grid" style={{gridTemplateColumns:`repeat(${Math.max(2,Math.min(8,Number(layout.productColumns||6)))},1fr)`}}>{browseActive?visible.map((product,index)=><button key={product.id} onClick={()=>add(product)} style={{background:layout.theme?.accentColor||"#087a52"}}><i>{index+1}</i>{product.name}<small>{euro(product.salePrice)}</small></button>):categoryButtons.length?categoryButtons.slice(0,24).map((button,index)=><button key={button.id} onClick={()=>{const codes=button.productCodes||[];codes.length?openGroup(button.label,codes,button.categoryName||""):(setBrowseActive(true),setCategoryCodes([]),setCategory(button.categoryName||button.label||""))}} style={{background:button.color}}><i>{index+1}</i>{button.label}</button>):allCategories.slice(0,24).map((name,index)=><button key={name} onClick={()=>{setBrowseActive(true);setCategory(name);setCategoryCodes([])}}><i>{index+1}</i>{name}</button>)}</div>
      </main>

      <aside className="operator-keypad"><label>ΠΕΛΑΤΗΣ — Πελάτης λιανικής</label><div className="operator-money"><span>ΕΛΑΒΑ<b>{receivedNumber?euro(receivedNumber):"0,00 €"}</b></span><span>ΡΕΣΤΑ<b>{euro(change)}</b></span></div><div className="operator-numbers">{[7,8,9,4,5,6,1,2,3,0,",","⌫"].map(value=><button key={value} onClick={()=>keypad(String(value))}>{value}</button>)}</div><button className="operator-clear" onClick={()=>setReceived("")}>ΚΑΘΑΡΙΣΜΟΣ ΠΟΣΟΥ</button></aside>

      <footer>{actionButtons.map(button=><button key={button.id} onClick={()=>runAction(button)} disabled={busy&&["CASH","CARD"].includes(button.action)} style={{background:button.color,color:"#fff"}}>{button.label}</button>)}<strong>ΣΥΝΟΛΟ<br/><b>{euro(total)}</b></strong></footer>
    </div>
    <div className="store-pos-nonfiscal">KAT TEST / PILOT: η πώληση καταγράφεται στο MyWorkStation ως NON_FISCAL και δεν στέλνει εντολή σε RBS, CapDriver ή πραγματική ταμειακή.</div>
  </article>;
}
