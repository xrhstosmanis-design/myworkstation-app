import React,{useEffect,useMemo,useState} from "react";
import {LogOut,RefreshCw,ShoppingCart,WalletCards} from "lucide-react";
import "./commerce-hub.css";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const fallbackLayout={title:"OPERATOR POS",productColumns:6,showSku:true,theme:{headerColor:"#033d2f",accentColor:"#087a52",surfaceColor:"#ffffff"},quickKeys:[],categories:[],buttons:[{id:"cash",label:"ΜΕΤΡΗΤΑ",action:"CASH",color:"#078a4d",visible:true},{id:"card",label:"ΚΑΡΤΑ",action:"CARD",color:"#3979cc",visible:true}]};
const parseStored=key=>{try{return JSON.parse(localStorage.getItem(key)||"null")}catch{return null}};

export default function CommercialPosApp({api,storeId}){
  const [session,setSession]=useState(()=>{const s=parseStored("storeOperatorSession"),u=parseStored("user");return u?.operator===true&&s?.store?.id===storeId?s:null});
  const [directory,setDirectory]=useState(null),[employeeId,setEmployeeId]=useState(""),[pin,setPin]=useState("");
  const [layout,setLayout]=useState(fallbackLayout),[products,setProducts]=useState([]),[category,setCategory]=useState(""),[cart,setCart]=useState([]);
  const [cashOverview,setCashOverview]=useState(null),[opening,setOpening]=useState({drawer:"",custody:"",coins:"",safe:""});
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");

  const loadDirectory=async()=>{setLoading(true);setError("");try{const d=await api(`/api/operators/stores/${storeId}/directory`);setDirectory(d);const first=d.operators?.find(x=>x.hasPin);if(first)setEmployeeId(first.employeeId)}catch(e){setError(e.message)}finally{setLoading(false)}};
  useEffect(()=>{if(!session)loadDirectory()},[storeId,session]);

  const login=async e=>{e.preventDefault();setBusy(true);setError("");try{
    const currentUser=parseStored("user");
    if(currentUser&&!currentUser.operator&&localStorage.getItem("token"))localStorage.setItem("posReturnAuth",JSON.stringify({token:localStorage.getItem("token"),user:currentUser}));
    const r=await api("/api/operators/login/pin",{method:"POST",body:JSON.stringify({storeId,employeeId,pin})});
    const next={user:r.user,store:r.store,company:r.company};localStorage.setItem("token",r.token);localStorage.setItem("storeOperatorSession",JSON.stringify(next));localStorage.setItem("user",JSON.stringify(r.user));setSession(next);setPin("");
  }catch(err){setError(err.message)}finally{setBusy(false)}};

  const logout=async()=>{try{await api("/api/operators/logout",{method:"POST"})}catch{}finally{
    localStorage.removeItem("storeOperatorSession");
    const back=parseStored("posReturnAuth");
    if(back?.token){localStorage.setItem("token",back.token);localStorage.setItem("user",JSON.stringify(back.user||{}))}else{localStorage.removeItem("token");localStorage.removeItem("user")}
    localStorage.removeItem("posReturnAuth");window.location.assign("/platform-admin/kat-test");
  }};

  const loadPos=async()=>{if(!session)return;setLoading(true);setError("");try{
    const cash=await api(`/api/cash-control/stores/${storeId}/overview`);setCashOverview(cash);
    if(!cash.openSession){const s=cash.suggestedOpening||{};setOpening({drawer:String(s.drawer||""),custody:String(s.custody||""),coins:String(s.coins||""),safe:String(s.safe||"")});setProducts([]);return}
    const result=await api(`/api/store-pos/stores/${encodeURIComponent(storeId)}`);
    const next=result.layout||{};setLayout({...fallbackLayout,...next,theme:{...fallbackLayout.theme,...(next.theme||{})},quickKeys:next.quickKeys||[],categories:next.categories||[],buttons:next.buttons||fallbackLayout.buttons});setProducts(result.products||[]);setCategory("");
  }catch(e){setError(e.message)}finally{setLoading(false)}};
  useEffect(()=>{if(session)loadPos()},[session,storeId]);

  const openCash=async e=>{e.preventDefault();setBusy(true);setError("");try{await api(`/api/cash-control/stores/${storeId}/sessions/open`,{method:"POST",body:JSON.stringify({shiftLabel:"Βάρδια POS",drawer:Number(String(opening.drawer||0).replace(",",".")),custody:Number(String(opening.custody||0).replace(",",".")),coins:Number(String(opening.coins||0).replace(",",".")),safe:Number(String(opening.safe||0).replace(",","."))})});setMessage("Το ταμείο άνοιξε. Το POS είναι έτοιμο.");await loadPos()}catch(err){setError(err.message)}finally{setBusy(false)}};

  const add=product=>setCart(rows=>{const found=rows.find(x=>x.id===product.id);return found?rows.map(x=>x.id===product.id?{...x,qty:x.qty+1}:x):[...rows,{id:product.id,name:product.name,sku:product.sku,qty:1,price:Number(product.salePrice||0),stock:Number(product.currentStock||0)}]});
  const changeQty=(id,delta)=>setCart(rows=>rows.map(x=>x.id===id?{...x,qty:Math.max(0,x.qty+delta)}:x).filter(x=>x.qty>0));
  const total=cart.reduce((sum,x)=>sum+x.qty*x.price,0);
  const visible=useMemo(()=>category?products.filter(x=>String(x.categoryName||"").toLocaleLowerCase("el-GR")===category.toLocaleLowerCase("el-GR")):products,[products,category]);
  const quick=query=>{const n=String(query||"").trim().toLocaleLowerCase("el-GR");const p=products.find(x=>[x.name,x.sku].some(v=>String(v||"").toLocaleLowerCase("el-GR")===n))||products.find(x=>String(x.name||"").toLocaleLowerCase("el-GR").includes(n));if(p){setError("");add(p)}else setError(`Δεν βρέθηκε προϊόν για «${query}».`)};
  const pay=async method=>{if(!cart.length)return;setBusy(true);setError("");setMessage("");try{const r=await api(`/api/store-pos/stores/${encodeURIComponent(storeId)}/checkout`,{method:"POST",body:JSON.stringify({items:cart.map(x=>({productId:x.id,quantity:x.qty})),paymentMethod:method})});setCart([]);setMessage(`Δοκιμαστική πώληση ${money(r.total)} καταγράφηκε ως ΜΗ ΦΟΡΟΛΟΓΙΚΗ.`);await loadPos()}catch(e){setError(e.message)}finally{setBusy(false)}};
  const action=a=>{if(a==="CASH"||a==="CARD")return pay(a);if(a==="CLEAR_CART")return setCart([]);setMessage(`Η ενέργεια ${a} δεν εκτελεί φορολογική πράξη στο KAT TEST.`)};

  if(!session)return <div className="operator-login-shell"><div className="operator-login-main"><div className="operator-login-card"><div className="operator-login-icon"><ShoppingCart/></div><h2>KAT TEST — POS ΚΑΤ</h2><p>Είσοδος πωλητή με προσωπικό PIN.</p>{error&&<div className="operator-login-error">{error}</div>}{loading?<div className="operator-login-loading">Φόρτωση…</div>:<form onSubmit={login}><label>Πωλητής<select value={employeeId} onChange={e=>setEmployeeId(e.target.value)}>{(directory?.operators||[]).filter(x=>x.hasPin).map(x=><option key={x.employeeId} value={x.employeeId}>{x.displayName}</option>)}</select></label><label>PIN<input type="password" inputMode="numeric" maxLength="8" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))} required/></label><button disabled={busy||pin.length<4}>{busy?"Έλεγχος…":"Είσοδος στο POS"}</button></form>}</div></div></div>;

  if(cashOverview&&!cashOverview.openSession)return <div className="operator-login-shell"><div className="operator-login-main"><div className="operator-login-card" style={{maxWidth:620}}><div className="operator-login-icon"><WalletCards/></div><h2>Άνοιγμα Ταμείου</h2><p>Πριν εμφανιστεί το POS ανοίγεις πρώτα τη βάρδια.</p>{error&&<div className="operator-login-error">{error}</div>}<form onSubmit={openCash}><label>Συρτάρι<input inputMode="decimal" value={opening.drawer} onChange={e=>setOpening(v=>({...v,drawer:e.target.value}))} placeholder="0,00"/></label><label>Φύλαξη<input inputMode="decimal" value={opening.custody} onChange={e=>setOpening(v=>({...v,custody:e.target.value}))} placeholder="0,00"/></label><label>Κέρματα<input inputMode="decimal" value={opening.coins} onChange={e=>setOpening(v=>({...v,coins:e.target.value}))} placeholder="0,00"/></label><label>Χρηματοκιβώτιο<input inputMode="decimal" value={opening.safe} onChange={e=>setOpening(v=>({...v,safe:e.target.value}))} placeholder="0,00"/></label><button disabled={busy}>{busy?"Άνοιγμα…":"Άνοιγμα Ταμείου & POS"}</button></form><button onClick={logout} style={{marginTop:10}}>Έξοδος</button></div></div></div>;

  return <div className="commercial-pos-runtime" style={{minHeight:"100vh",background:"#eef3f2",padding:12}}>
    <div className="kat-pos-topbar"><div><b>MyWorkStation · {session.store?.name}</b><small>POS ΚΑΤ · KAT TEST · ΜΗ ΦΟΡΟΛΟΓΙΚΟ</small></div><div><button onClick={loadPos}><RefreshCw/> Ανανέωση</button><button onClick={logout}><LogOut/> Έξοδος</button></div></div>
    {error&&<div className="commerce-error">{error}</div>}{message&&<div className="commerce-success">{message}</div>}
    <div className="store-operator-pos kat-test-real-pos" style={{"--store-pos-head":layout.theme?.headerColor||"#033d2f","--store-pos-accent":layout.theme?.accentColor||"#087a52","--store-pos-surface":layout.theme?.surfaceColor||"#ffffff"}}>
      <header><div className="store-pos-logo">MW</div><div className="store-pos-brand"><small>MyWorkStation · KAT TEST</small><b>{layout.title||"OPERATOR POS"}</b></div><input placeholder="Barcode ή αναζήτηση προϊόντος"/><button>Αναζήτηση</button><div className="store-pos-user"><b>{session.user?.fullName}</b><small>Ταμείο ανοικτό</small></div></header>
      <aside className="store-pos-quick"><div><b>ΓΡΗΓΟΡΑ</b><small>{layout.quickKeys.filter(x=>x.visible).length} θέσεις</small></div>{layout.quickKeys.filter(x=>x.visible).slice(0,24).map((b,i)=><button key={b.id} style={{background:b.color}} onClick={()=>quick(b.productQuery||b.label)}><i>{i+1}</i>{b.label}</button>)}</aside>
      <main className="store-pos-main"><div className="store-pos-table-head"><span>ΠΟΣ.</span><span>ΕΙΔΟΣ</span><span>STOCK</span><span>ΤΙΜΗ</span><span>ΣΥΝΟΛΟ</span></div><div className="store-pos-sale-lines">{cart.length?cart.map(line=><article key={line.id}><span><button onClick={()=>changeQty(line.id,-1)}>−</button> {line.qty} <button onClick={()=>changeQty(line.id,1)}>+</button></span><b>{line.name}</b><span>{line.stock}</span><span>{money(line.price)}</span><strong>{money(line.qty*line.price)}</strong></article>):<div className="store-pos-empty"><b>Νέα συναλλαγή</b><span>Πάτησε προϊόν ή γρήγορη θέση</span></div>}</div><div className="store-pos-category-title"><b>ΚΑΤΗΓΟΡΙΕΣ</b><button className={!category?"active":""} onClick={()=>setCategory("")}>ΑΡΧΙΚΗ</button><span>{category||"ΒΑΣΙΚΗ ΟΘΟΝΗ"}</span></div><div className="store-pos-categories" style={{gridTemplateColumns:`repeat(${layout.productColumns||6},minmax(0,1fr))`}}>{layout.categories.filter(x=>x.visible).map((b,i)=><button className={category===(b.categoryName||b.label)?"active":""} key={b.id} style={{background:b.color}} onClick={()=>setCategory(b.categoryName||b.label)}><i>{i+1}</i>{b.label}</button>)}</div><div className="store-pos-products" style={{gridTemplateColumns:`repeat(${layout.productColumns||6},minmax(0,1fr))`}}>{visible.map(p=><button key={p.id} onClick={()=>add(p)}><b>{p.name}</b>{layout.showSku&&<small>{p.sku||p.categoryName||""}</small>}<strong>{money(p.salePrice)}</strong></button>)}</div></main>
      <aside className="store-pos-right"><label>ΠΕΛΑΤΗΣ — Πελάτης λιανικής</label><div className="store-pos-money"><span>ΣΥΝΟΛΟ<b>{money(total)}</b></span><span>ΕΙΔΗ<b>{cart.reduce((s,x)=>s+x.qty,0)}</b></span></div><div className="store-pos-keypad">{[7,8,9,4,5,6,1,2,3,0,",","⌫"].map(v=><button key={v}>{v}</button>)}</div><button className="store-pos-clear">ΚΑΘΑΡΙΣΜΟΣ ΠΟΣΟΥ</button><div className="store-pos-cart-tools"><button onClick={()=>cart[0]&&changeQty(cart[0].id,1)}>ΠΟΣ.</button><button>ΑΛΛΑΓΗ</button><button onClick={()=>setCart([])}>ΣΒΗΣΙΜΟ</button></div></aside>
      <footer>{layout.buttons.filter(b=>b.visible).map(b=><button key={b.id} style={{background:b.color,color:String(b.color).toLowerCase()==="#ffffff"?"#173f34":"#fff"}} onClick={()=>action(b.action)} disabled={busy||((b.action==="CASH"||b.action==="CARD")&&!cart.length)}>{b.label}</button>)}<div className="store-pos-total"><span>ΣΥΝΟΛΟ</span><b>{money(total)}</b></div></footer>
    </div>
  </div>;
}
