import React,{useEffect,useMemo,useState} from "react";
import {CreditCard,RefreshCw,Search,ShoppingCart,Trash2,Wallet} from "lucide-react";
import "./store-pos.css";

const euro=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const fallbackLayout={title:"OPERATOR POS",productColumns:6,showSku:true,theme:{headerColor:"#033d2f",accentColor:"#087a52",surfaceColor:"#ffffff"},quickKeys:[],categories:[],buttons:[]};
const CATEGORY_PREFIX="CATEGORY::";
const isCategoryQuick=button=>String(button?.productQuery||"").startsWith(CATEGORY_PREFIX);
const quickCategory=button=>isCategoryQuick(button)?String(button.productQuery).slice(CATEGORY_PREFIX.length):"";

export default function StorePosPanel({api,store,onChanged}){
  const [data,setData]=useState(null),[cart,setCart]=useState([]),[query,setQuery]=useState(""),[category,setCategory]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const load=async()=>{setError("");try{setData(await api(`/api/store-pos/stores/${store.id}`))}catch(err){setError(err.message)}};
  useEffect(()=>{load()},[store.id]);
  const layout=data?.layout||fallbackLayout;
  const products=data?.products||[];
  const categories=useMemo(()=>[...new Set(products.map(p=>p.categoryName).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"el")),[products]);
  const visible=useMemo(()=>products.filter(product=>{
    const q=query.trim().toLocaleLowerCase("el-GR");
    const matches=!q||product.name.toLocaleLowerCase("el-GR").includes(q)||String(product.sku||"").toLocaleLowerCase("el-GR").includes(q)||(product.barcodes||[]).some(code=>String(code).includes(q));
    return matches&&(!category||product.categoryName===category);
  }).slice(0,120),[products,query,category]);
  const total=cart.reduce((sum,row)=>sum+row.salePrice*row.quantity,0);
  const add=product=>setCart(current=>{const found=current.find(row=>row.id===product.id);return found?current.map(row=>row.id===product.id?{...row,quantity:row.quantity+1}:row):[...current,{...product,quantity:1}]});
  const qty=(id,delta)=>setCart(current=>current.map(row=>row.id===id?{...row,quantity:Math.max(1,row.quantity+delta)}:row));
  const remove=id=>setCart(current=>current.filter(row=>row.id!==id));
  const quickProduct=button=>products.find(p=>p.name.toLocaleLowerCase("el-GR").includes(String(button.productQuery||button.label).toLocaleLowerCase("el-GR"))||String(p.sku||"")===String(button.productQuery||"")||(p.barcodes||[]).some(code=>String(code)===String(button.productQuery||"")));
  const useQuick=button=>{
    if(isCategoryQuick(button)){
      const selectedCategory=quickCategory(button);
      setQuery("");
      setCategory(selectedCategory);
      setMessage(selectedCategory?`Άνοιξε η κατηγορία «${selectedCategory}». Επίλεξε προϊόν.`:"");
      return;
    }
    const product=quickProduct(button);
    if(product)add(product);else setError(`Δεν βρέθηκε το προϊόν για το κουμπί «${button.label}».`);
  };
  const checkout=async paymentMethod=>{
    if(!cart.length)return;
    setBusy(true);setError("");setMessage("");
    try{
      const result=await api(`/api/store-pos/stores/${store.id}/checkout`,{method:"POST",body:JSON.stringify({paymentMethod,items:cart.map(row=>({productId:row.id,quantity:row.quantity}))})});
      setCart([]);setMessage(`Η πώληση ${euro(result.total)} καταχωρίστηκε ως ${paymentMethod==="CASH"?"μετρητά":"κάρτα"}.`);onChanged?.();
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };
  return <article className="store-pos-card" style={{"--pos-head":layout.theme?.headerColor||"#033d2f","--pos-accent":layout.theme?.accentColor||"#087a52"}}>
    <div className="store-pos-top"><div><span>ΚΑΝΟΝΙΚΟ POS · ΔΗΜΟΣΙΕΥΜΕΝΗ ΔΙΑΤΑΞΗ</span><h2>{layout.title||"OPERATOR POS"}</h2><small>Έκδοση {data?.layoutVersion||0} · {products.length} ενεργά προϊόντα</small></div><button onClick={load}><RefreshCw/>Ανανέωση</button></div>
    {error&&<div className="store-pos-alert error">{error}</div>}{message&&<div className="store-pos-alert success">{message}</div>}
    <div className="store-pos-body">
      <aside className="store-pos-quick"><h3>ΓΡΗΓΟΡΑ</h3>{(layout.quickKeys||[]).filter(x=>x.visible).map(button=>{const categoryButton=isCategoryQuick(button);const product=categoryButton?null:quickProduct(button);const enabled=categoryButton?Boolean(quickCategory(button)):Boolean(product);return <button key={button.id} style={{background:button.color}} disabled={!enabled} onClick={()=>enabled&&useQuick(button)}>{button.label}<small>{categoryButton?`Κατηγορία · ${quickCategory(button)}`:product?euro(product.salePrice):"Δεν έχει συνδεθεί"}</small></button>})}</aside>
      <section className="store-pos-products">
        <div className="store-pos-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Barcode, SKU ή όνομα προϊόντος"/></div>
        <div className="store-pos-categories"><button className={!category?"active":""} onClick={()=>setCategory("")}>ΟΛΑ</button>{(layout.categories||[]).filter(x=>x.visible).map(button=><button key={button.id} className={category===button.categoryName?"active":""} style={{background:button.color}} onClick={()=>setCategory(button.categoryName||"")}>{button.label}</button>)}{!(layout.categories||[]).length&&categories.map(name=><button key={name} className={category===name?"active":""} onClick={()=>setCategory(name)}>{name}</button>)}</div>
        {category&&<div className="store-pos-alert success">Κατηγορία: <b>{category}</b> · {visible.length} προϊόντα <button type="button" onClick={()=>setCategory("")}>Πίσω σε όλα</button></div>}
        <div className="store-pos-grid" style={{gridTemplateColumns:`repeat(${Math.max(2,Math.min(8,Number(layout.productColumns||6)))},minmax(120px,1fr))`}}>{visible.map(product=><button key={product.id} onClick={()=>add(product)}><b>{product.name}</b>{layout.showSku&&<small>{product.sku||"Χωρίς SKU"}</small>}<strong>{euro(product.salePrice)}</strong></button>)}</div>
      </section>
      <aside className="store-pos-cart"><div className="store-pos-cart-title"><ShoppingCart/><h3>Συναλλαγή</h3><span>{cart.reduce((n,row)=>n+row.quantity,0)} τεμ.</span></div><div className="store-pos-lines">{cart.length===0?<div className="store-pos-empty">Πάτησε προϊόν ή αναζήτησέ το.</div>:cart.map(row=><div className="store-pos-line" key={row.id}><div><b>{row.name}</b><small>{euro(row.salePrice)} × {row.quantity}</small></div><div className="store-pos-qty"><button onClick={()=>qty(row.id,-1)}>-</button><span>{row.quantity}</span><button onClick={()=>qty(row.id,1)}>+</button></div><strong>{euro(row.salePrice*row.quantity)}</strong><button className="trash" onClick={()=>remove(row.id)}><Trash2/></button></div>)}</div><div className="store-pos-total"><span>ΣΥΝΟΛΟ</span><strong>{euro(total)}</strong></div><div className="store-pos-pay"><button disabled={busy||!cart.length} onClick={()=>checkout("CASH")}><Wallet/>ΜΕΤΡΗΤΑ</button><button disabled={busy||!cart.length} onClick={()=>checkout("CARD")}><CreditCard/>ΚΑΡΤΑ</button></div></aside>
    </div>
    <div className="store-pos-nonfiscal">KAT TEST / PILOT: η πώληση καταγράφεται στο MyWorkStation ως NON_FISCAL και δεν στέλνει εντολή σε RBS, CapDriver ή πραγματική ταμειακή.</div>
  </article>;
}
