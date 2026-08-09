import React,{useMemo,useState} from "react";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const qty=value=>Number(value||0).toLocaleString("el-GR",{maximumFractionDigits:3});

export default function InventoryValuePanel({rows=[],onBack}){
  const [view,setView]=useState("category");
  const normalized=useMemo(()=>rows.map(row=>{
    const stock=(row.stores||[]).reduce((sum,s)=>sum+Number(s.currentStock||0),0);
    const cost=Number(row.costPrice||0);
    return {...row,stock,stockValue:stock*cost,category:row.categoryName||"ΧΩΡΙΣ ΚΑΤΗΓΟΡΙΑ",supplier:row.supplierName||"ΧΩΡΙΣ ΠΡΟΜΗΘΕΥΤΗ"};
  }),[rows]);
  const total=normalized.reduce((sum,row)=>sum+row.stockValue,0);
  const aggregate=key=>{
    const map=new Map();
    normalized.forEach(row=>{const name=row[key];const current=map.get(name)||{name,items:0,stock:0,value:0};current.items+=1;current.stock+=row.stock;current.value+=row.stockValue;map.set(name,current)});
    return [...map.values()].sort((a,b)=>b.value-a.value);
  };
  const grouped=view==="category"?aggregate("category"):view==="supplier"?aggregate("supplier"):null;
  return <section className="inventory-value-panel">
    <div className="inventory-value-head"><div><h2>Αξία αποθήκης</h2><p>Πραγματική αξία stock με βάση ποσότητα × τιμή κόστους.</p></div><div><strong>{money(total)}</strong><button onClick={onBack}>Επιστροφή στα είδη</button></div></div>
    <div className="inventory-value-tabs"><button className={view==="category"?"active":""} onClick={()=>setView("category")}>Ανά κατηγορία</button><button className={view==="supplier"?"active":""} onClick={()=>setView("supplier")}>Ανά προμηθευτή</button><button className={view==="item"?"active":""} onClick={()=>setView("item")}>Ανά είδος</button></div>
    {view!=="item"?<div className="inventory-value-table"><div className="ivr head"><span>{view==="category"?"Κατηγορία":"Προμηθευτής"}</span><span>Είδη</span><span>Stock</span><span>Αξία</span><span>% συνόλου</span></div>{grouped.map(row=><div className="ivr" key={row.name}><span><b>{row.name}</b></span><span>{row.items}</span><span>{qty(row.stock)}</span><span><b>{money(row.value)}</b></span><span>{total?`${((row.value/total)*100).toFixed(2)}%`:"0.00%"}</span></div>)}</div>:
    <div className="inventory-value-table item-table"><div className="ivr head"><span>Κωδικός</span><span>Περιγραφή</span><span>Κατηγορία</span><span>Προμηθευτής</span><span>Stock</span><span>Κόστος</span><span>Αξία</span></div>{normalized.sort((a,b)=>b.stockValue-a.stockValue).map(row=><div className="ivr" key={row.id}><span>{row.sku||"—"}</span><span><b>{row.name}</b></span><span>{row.category}</span><span>{row.supplier}</span><span>{qty(row.stock)}</span><span>{money(row.costPrice)}</span><span><b>{money(row.stockValue)}</b></span></div>)}</div>}
  </section>;
}
