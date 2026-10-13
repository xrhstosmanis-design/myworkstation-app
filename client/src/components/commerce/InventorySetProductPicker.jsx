import React,{useEffect,useState} from "react";

export default function InventorySetProductPicker({api,storeId,parentId,value,onChange,disabled=false}){
  const [query,setQuery]=useState(""),[page,setPage]=useState(1),[selected,setSelected]=useState(null);
  const [result,setResult]=useState(null);
  const search=query.trim(),scope=JSON.stringify([storeId,parentId,search,page]);
  const current=result?.scope===scope?result:null;
  const chosen=selected?.productId===value&&Boolean(value)?selected:null;
  useEffect(()=>{if(!value){setSelected(null);setQuery("");setPage(1)}},[value]);
  useEffect(()=>{
    if(!storeId||!parentId||chosen||search.length<2||disabled)return;
    let cancelled=false;
    const timer=setTimeout(async()=>{
      setResult({scope,loading:true,items:[]});
      try{
        const params=new URLSearchParams({storeId,q:search,status:"ACTIVE",page:String(page),pageSize:"25"});
        const data=await api(`/api/inventory-archive?${params}`);
        if(!cancelled)setResult({scope,loading:false,items:(data.items||[]).filter(row=>row.productId!==parentId),pages:Number(data.pages||1)});
      }catch(error){if(!cancelled)setResult({scope,loading:false,items:[],error:error.message||"Η αναζήτηση δεν ολοκληρώθηκε."})}
    },250);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[api,scope,Boolean(chosen),disabled]);
  const clear=()=>{setSelected(null);setQuery("");setPage(1);setResult(null);onChange("")};
  return <div className="ia-set-picker">
    <label htmlFor="ia-set-product-search">Συσχετιζόμενο είδος · Αναζήτηση</label>
    {chosen?<div className="ia-set-selected"><div><b>{chosen.name}</b><small>SKU: {chosen.sku||"—"} · {chosen.barcode||"Χωρίς barcode"}</small></div><button type="button" disabled={disabled} onClick={clear}>Αλλαγή είδους</button></div>:<>
      <input id="ia-set-product-search" type="search" value={query} disabled={disabled||!storeId} autoComplete="off" placeholder="Όνομα, SKU ή barcode" onChange={event=>{setQuery(event.target.value);setPage(1)}} onKeyDown={event=>{if(event.key==="Enter")event.preventDefault()}}/>
      {search.length<2?<small>Γράψε τουλάχιστον 2 χαρακτήρες και επίλεξε το σωστό είδος.</small>:<div className="ia-set-search-results" aria-live="polite">
        {!current||current.loading?<span>Αναζήτηση…</span>:current.error?<span role="alert">{current.error}</span>:current.items.length?current.items.map(row=><button type="button" key={row.productId} disabled={disabled} onClick={()=>{setSelected(row);onChange(row.productId)}}><div><b>{row.name}</b><small>SKU: {row.sku||"—"} · {row.barcode||"Χωρίς barcode"}</small></div><strong>{Number(row.salePrice||0).toLocaleString("el-GR",{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></button>):<span>Δεν βρέθηκαν άλλα ενεργά είδη στο επιλεγμένο κατάστημα.</span>}
      </div>}
      {current&&!current.loading&&!current.error&&current.pages>1&&<div className="ia-set-search-pages"><button type="button" disabled={disabled||page<=1} onClick={()=>setPage(p=>p-1)}>Προηγούμενα</button><span>{page} / {current.pages}</span><button type="button" disabled={disabled||page>=current.pages} onClick={()=>setPage(p=>p+1)}>Επόμενα</button></div>}
    </>}
  </div>;
}
