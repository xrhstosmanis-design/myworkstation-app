import React,{useEffect,useMemo,useState} from "react";
import {CreditCard,LogOut,Minus,Plus,RefreshCw,ShoppingCart,WalletCards} from "lucide-react";
import "./commerce-hub.css";
import "../platform/pos-designer.css";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const fallbackLayout={title:"OPERATOR POS",productColumns:6,showSku:true,theme:{headerColor:"#033d2f",accentColor:"#087a52",surfaceColor:"#ffffff"},quickKeys:[],categories:[],buttons:[{id:"cash",label:"ΜΕΤΡΗΤΑ",action:"CASH",color:"#078a4d",visible:true},{id:"card",label:"ΚΑΡΤΑ",action:"CARD",color:"#3979cc",visible:true}]};
const parseStored=(key)=>{try{return JSON.parse(localStorage.getItem(key)||"null")}catch{return null}};

export default function CommercialPosApp({api,storeId}){
  const [session,setSession]=useState(()=>{
    const s=parseStored("storeOperatorSession"),u=parseStored("user");
    return u?.operator===true&&s?.store?.id===storeId?s:null;
  });
  const [directory,setDirectory]=useState(null),[employeeId,setEmployeeId]=useState(""),[pin,setPin]=useState("");
  const [layout,setLayout]=useState(fallbackLayout),[inventory,setInventory]=useState([]),[category,setCategory]=useState(""),[cart,setCart]=useState([]);
  const [cashOverview,setCashOverview]=useState(null),[opening,setOpening]=useState({drawer:"",custody:"",coins:"",safe:""});
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");

  const loadDirectory=async()=>{setLoading(true);setError("");try{const d=await api(`/api/operators/stores/${storeId}/directory`);setDirectory(d);const first=d.operators?.find(x=>x.hasPin);if(first)setEmployeeId(first.employeeId)}catch(e){setError(e.message)}finally{setLoading(false)}};
  useEffect(()=>{if(!session)loadDirectory()},[storeId,session]);

  const login=async e=>{e.preventDefault();setBusy(true);setError("");try{
    const currentUser=parseStored("user");
    if(currentUser&&!currentUser.operator&&localStorage.getItem("token")){
      localStorage.setItem("posReturnAuth",JSON.stringify({token:localStorage.getItem("token"),user:currentUser}));
    }
    const r=await api("/api/operators/login/pin",{method:"POST",body:JSON.stringify({storeId,employeeId,pin})});
    const next={user:r.user,store:r.store,company:r.company};
    localStorage.setItem("token",r.token);localStorage.setItem("storeOperatorSession",JSON.stringify(next));localStorage.setItem("user",JSON.stringify(r.user));setSession(next);setPin("");
  }catch(err){setError(err.message)}finally{setBusy(false)}};

  const logout=async()=>{
    try{await fetch("/api/operators/logout",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${localStorage.getItem("token")||""}`}})}catch{}
    localStorage.removeItem("storeOperatorSession");
    const back=parseStored("posReturnAuth");
    if(back?.token){localStorage.setItem("token",back.token);localStorage.setItem("user",JSON.stringify(back.user||{}))}else{localStorage.removeItem("token");localStorage.removeItem("user")}
    localStorage.removeItem("posReturnAuth");
    window.location.assign("/platform-admin/kat-test");
  };

  const loadPos=async()=>{if(!session)return;setLoading(true);setError("");try{
    const cash=await api(`/api/cash-control/stores/${storeId}/overview`);
    setCashOverview(cash);
    if(!cash.openSession){
      const s=cash.suggestedOpening||{};
      setOpening({drawer:String(s.drawer||""),custody:String(s.custody||""),coins:String(s.coins||""),safe:String(s.safe||"")});
      setInventory([]);return;
    }
    const [l,i]=await Promise.all([api(`/api/commerce/pos-layout?storeId=${encodeURIComponent(storeId)}`),api(`/api/commerce/inventory?storeId=${encodeURIComponent(storeId)}`)]);
    const next=l.layoutJson||{};setLayout({...fallbackLayout,...next,theme:{...fallbackLayout.theme,...(next.theme||{})},quickKeys:next.quickKeys||[],categories:next.categories||[],buttons:next.buttons||fallbackLayout.buttons});setInventory(i.rows||[]);
  }catch(e){setError(e.message)}finally{setLoading(false)}};
  useEffect(()=>{if(session)loadPos()},[session,storeId]);

  const openCash=async e=>{e.preventDefault();setBusy(true);setError("");try{
    await api(`/api/cash-control/stores/${storeId}/sessions/open`,{method:"POST",body:JSON.stringify({shiftLabel:"Βάρδια POS",drawer:Number(opening.drawer||0),custody:Number(opening.custody||0),coins:Number(opening.coins||0),safe:Number(opening.safe||0)})});
    setMessage("Το ταμείο άνοιξε και το POS είναι έτοιμο για πωλήσεις.");await loadPos();
  }catch(err){setError(err.message)}finally{setBusy(false)}};

  const add=product=>setCart(rows=>{const found=rows.find(x=>x.id===product.id);return found?rows.map(x=>x.id===product.id?{...x,qty:x.qty+1}:x):[...rows,{id:product.id,name:product.name,sku:product.sku,qty:1,price:Number(product.salePrice||0),vatRate:Number(product.vatRate||24)}]});
  const qty=(id,delta)=>setCart(rows=>rows.map(x=>x.id===id?{...x,qty:Math.max(0,x.qty+delta)}:x).filter(x=>x.qty>0));
  const total=cart.reduce((sum,x)=>sum+x.qty*x.price,0);
  const visible=useMemo(()=>category?inventory.filter(x=>String(x.categoryName||"").toLocaleLowerCase("el-GR")===category.toLocaleLowerCase("el-GR")):inventory,[inventory,category]);
  const quick=query=>{const n=String(query||"").trim().toLocaleLowerCase("el-GR");const p=inventory.find(x=>[x.name,x.sku].some(v=>String(v||"").toLocaleLowerCase("el-GR")===n))||inventory.find(x=>String(x.name||"").toLocaleLowerCase("el-GR").includes(n));if(p)add(p);else setError(`Δεν βρέθηκε προϊόν για «${query}».`)};
  const pay=async method=>{if(!cart.length)return;setBusy(true);setError("");setMessage("");try{const r=await api("/api/commerce/sales",{method:"POST",body:JSON.stringify({storeId,operatorEmployeeId:session.user?.employeeId||session.user?.id,lines:cart.map(x=>({productId:x.id,description:x.name,quantity:x.qty,unitPrice:x.price,vatRate:x.vatRate})),payments:[{method,amount:total}]})});setCart([]);setMessage(`Δοκιμαστική πώληση ${money(r.total)} καταγράφηκε ως ΜΗ ΦΟΡΟΛΟΓΙΚΗ.`);await loadPos()}catch(e){setError(e.message)}finally{setBusy(false)}};
  const action=a=>{if(a==="CASH"||a==="CARD")return pay(a);if(a==="CLEAR_CART"){setCart([]);return}setMessage(`Η ενέργεια ${a} είναι διαθέσιμη στο εμπορικό POS, χωρίς φορολογική εκτέλεση στο KAT TEST.`)};

  if(!session)return <div className="operator-login-shell"><div className="operator-login-main"><div className="operator-login-card"><div className="operator-login-icon"><ShoppingCart/></div><h2>KAT TEST — Κανονικό POS</h2><p>Είσοδος πωλητή με το προσωπικό PIN.</p>{error&&<div className="operator-login-error">{error}</div>}{loading?<div className="operator-login-loading">Φόρτωση…</div>:<form onSubmit={login}><label>Πωλητής<select value={employeeId} onChange={e=>setEmployeeId(e.target.value)}>{(directory?.operators||[]).filter(x=>x.hasPin).map(x=><option key={x.employeeId} value={x.employeeId}>{x.displayName}</option>)}</select></label><label>PIN<input type="password" inputMode="numeric" maxLength="8" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))} required/></label><button disabled={busy||pin.length<4}>{busy?"Έλεγχος…":"Άνοιγμα POS"}</button></form>}</div></div></div>;

  if(cashOverview&&!cashOverview.openSession)return <div className="operator-login-shell"><div className="operator-login-main"><div className="operator-login-card" style={{maxWidth:620}}><div className="operator-login-icon"><WalletCards/></div><h2>Άνοιγμα Ταμείου</h2><p>Πριν ξεκινήσουν πωλήσεις πρέπει να ανοίξει η βάρδια και να δηλωθούν τα αρχικά ποσά.</p>{error&&<div className="operator-login-error">{error}</div>}<form onSubmit={openCash}><label>Συρτάρι<input inputMode="decimal" value={opening.drawer} onChange={e=>setOpening(v=>({...v,drawer:e.target.value}))} placeholder="0,00"/></label><label>Φύλαξη<input inputMode="decimal" value={opening.custody} onChange={e=>setOpening(v=>({...v,custody:e.target.value}))} placeholder="0,00"/></label><label>Κέρματα<input inputMode="decimal" value={opening.coins} onChange={e=>setOpening(v=>({...v,coins:e.target.value}))} placeholder="0,00"/></label><label>Χρηματοκιβώτιο<input inputMode="decimal" value={opening.safe} onChange={e=>setOpening(v=>({...v,safe:e.target.value}))} placeholder="0,00"/></label><button disabled={busy}>{busy?"Άνοιγμα…":"Άνοιγμα Ταμείου & POS"}</button></form><button onClick={logout} style={{marginTop:10}}>Έξοδος</button></div></div></div>;

  return <div className="commercial-pos-runtime" style={{minHeight:"100vh",background:"#eef3f2",padding:16}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div><b style={{fontSize:22}}>MyWorkStation · {session.store?.name}</b><div style={{fontSize:13}}>Κανονικό εμπορικό POS · KAT TEST · ΜΗ ΦΟΡΟΛΟΓΙΚΟ</div></div><div style={{display:"flex",gap:8}}><button onClick={loadPos}><RefreshCw/> Ανανέωση</button><button onClick={logout}><LogOut/> Έξοδος</button></div></div>
    {error&&<div className="commerce-error">{error}</div>}{message&&<div className="commerce-success">{message}</div>}
    <div className="operator-pos-preview" style={{"--preview-head":layout.theme.headerColor,"--preview-accent":layout.theme.accentColor,"--preview-surface":layout.theme.surfaceColor,minHeight:"760px"}}>
      <div className="operator-preview-head"><b>MW</b><span>MyWorkStation · {session.store?.name}<strong>{layout.title}</strong></span><input placeholder="Barcode ή αναζήτηση προϊόντος"/><button>⌕</button><small>{session.user?.fullName}<br/>KAT TEST</small></div>
      <aside className="operator-quick"><header><b>ΓΡΗΓΟΡΑ</b><small>{layout.quickKeys.filter(x=>x.visible).length} θέσεις</small></header>{layout.quickKeys.filter(x=>x.visible).slice(0,24).map((b,i)=><button key={b.id} style={{background:b.color}} onClick={()=>quick(b.productQuery)}><i>{i+1}</i>{b.label}</button>)}</aside>
      <main className="operator-sale"><div className="operator-table-head"><span>ΠΟΣ.</span><span>ΕΙΔΟΣ</span><span>STOCK</span><span>ΤΙΜΗ</span><span>ΣΥΝΟΛΟ</span></div>{cart.length===0?<div className="operator-empty"><ShoppingCart/><b>Νέα συναλλαγή</b><small>Πάτησε προϊόν ή γρήγορη θέση</small></div>:<div style={{padding:10,display:"grid",gap:6}}>{cart.map(x=><div key={x.id} style={{display:"grid",gridTemplateColumns:"90px 1fr 90px 100px 110px",alignItems:"center",gap:8,background:"white",padding:8,borderRadius:8}}><span style={{display:"flex",gap:4,alignItems:"center"}}><button onClick={()=>qty(x.id,-1)}><Minus size={14}/></button>{x.qty}<button onClick={()=>qty(x.id,1)}><Plus size={14}/></button></span><b>{x.name}</b><span>—</span><span>{money(x.price)}</span><strong>{money(x.qty*x.price)}</strong></div>)}</div>}<div className="operator-category-head"><b>ΚΑΤΗΓΟΡΙΕΣ</b><button onClick={()=>setCategory("")}>ΟΛΑ</button></div><div className="operator-categories" style={{gridTemplateColumns:`repeat(${layout.productColumns},1fr)`}}>{layout.categories.filter(x=>x.visible).map((b,i)=><button key={b.id} style={{background:b.color}} onClick={()=>setCategory(b.categoryName||b.label)}><i>{i+1}</i>{b.label}</button>)}</div><div style={{display:"grid",gridTemplateColumns:`repeat(${layout.productColumns},1fr)`,gap:8,padding:10}}>{visible.slice(0,60).map(p=><button key={p.id} onClick={()=>add(p)} style={{minHeight:74,borderRadius:9,border:"1px solid #cbd5e1",background:"#fff",fontWeight:800}}>{p.name}<small style={{display:"block",marginTop:4}}>{money(p.salePrice)}</small></button>)}</div></main>
      <aside className="operator-keypad"><label>ΠΕΛΑΤΗΣ — Πελάτης λιανικής</label><div className="operator-money"><span>ΣΥΝΟΛΟ<b>{money(total)}</b></span><span>ΕΙΔΗ<b>{cart.reduce((s,x)=>s+x.qty,0)}</b></span></div><div className="operator-numbers">{[7,8,9,4,5,6,1,2,3,0,",","⌫"].map(v=><button key={v}>{v}</button>)}</div><button className="operator-clear" onClick={()=>setCart([])}>ΚΑΘΑΡΙΣΜΟΣ</button></aside>
      <footer>{layout.buttons.filter(x=>x.visible).map(b=><button key={b.id} style={{background:b.color}} onClick={()=>action(b.action)} disabled={busy}>{b.action==="CARD"?<CreditCard size={18}/>:b.action==="CASH"?<WalletCards size={18}/>:null}{b.label}</button>)}<strong>ΣΥΝΟΛΟ<br/><b>{money(total)}</b></strong></footer>
    </div>
  </div>;
}
