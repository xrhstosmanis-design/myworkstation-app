import React,{useEffect,useMemo,useState} from "react";
import "./commercial-tools.css";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR",minimumFractionDigits:3});

export default function SupplierPriceComparisonPanel({api}){
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const load=async()=>{setLoading(true);setError("");try{setRows(await api("/api/commerce/supplier-price-comparison"))}catch(e){setError(e.message)}finally{setLoading(false)}};
  useEffect(()=>{load()},[]);
  const products=useMemo(()=>{const groups=new Map();rows.forEach(row=>{if(!groups.has(row.productId))groups.set(row.productId,{id:row.productId,name:row.productName,sku:row.sku,suppliers:[]});groups.get(row.productId).suppliers.push(row)});return [...groups.values()]},[rows]);
  return <section className="commerce-box supplier-comparison"><div className="supplier-comparison-head"><div><h3>Ποιος προμηθευτής είναι φθηνότερος;</h3><p>Σύγκριση πραγματικού κόστους ανά τεμάχιο από εγκεκριμένα παραστατικά αγορών.</p></div><button className="commerce-primary" onClick={load}>Ανανέωση</button></div>
    {error&&<div className="commerce-error">{error}</div>}{loading?<div>Υπολογισμός τιμών…</div>:products.length===0?<div>Δεν υπάρχουν ακόμη εγκεκριμένες αγορές με προϊόν και προμηθευτή.</div>:<div className="supplier-products">{products.map(product=><article key={product.id}><header><span><b>{product.name}</b><small>{product.sku||"Χωρίς SKU"}</small></span><em>{product.suppliers.length} {product.suppliers.length===1?"προμηθευτής":"προμηθευτές"}</em></header><div>{product.suppliers.map(supplier=>{const cheapest=Number(supplier.priceRank)===1,next=product.suppliers.find(item=>Number(item.priceRank)>1);return <div className={cheapest?"cheapest":""} key={supplier.supplierId}><span>{cheapest&&<strong>ΦΘΗΝΟΤΕΡΟΣ</strong>}<b>{supplier.supplierName}</b><small>Τελευταία αγορά: {supplier.lastPurchaseAt?new Date(supplier.lastPurchaseAt).toLocaleDateString("el-GR"):"—"}</small></span><span><b>{money(supplier.bestPieceCost)} / τεμ.</b><small>Τελευταίο: {money(supplier.lastPieceCost)}</small>{cheapest&&next&&<small>Όφελος {money(Number(next.bestPieceCost)-Number(supplier.bestPieceCost))} / τεμ.</small>}</span></div>})}</div></article>)}</div>}
  </section>;
}
