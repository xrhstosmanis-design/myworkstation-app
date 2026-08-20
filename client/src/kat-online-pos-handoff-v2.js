const HANDOFF_STYLE_ID="mws-online-pos-handoff-v2-style";
let handoffBusy=false;

const session=()=>{try{return JSON.parse(sessionStorage.getItem("storeOperatorSession")||"null")}catch{return null}};
const token=()=>sessionStorage.getItem("storeOperatorToken")||"";
const euro=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
async function api(path,options={}){const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token()?{Authorization:`Bearer ${token()}`}:{}) ,...(options.headers||{})}});const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!response.ok){const error=new Error(data.error||`Σφάλμα ${response.status}`);error.status=response.status;error.data=data;throw error}return data}

function ensureStyle(){if(document.getElementById(HANDOFF_STYLE_ID))return;const style=document.createElement("style");style.id=HANDOFF_STYLE_ID;style.textContent=`
.mws-pos-pay-overlay{position:fixed;inset:0;background:#06100de8;z-index:100100;display:grid;place-items:start center;padding:70px 18px;overflow:auto}.mws-pos-pay-card{width:min(760px,100%);background:#fff;border-radius:18px;box-shadow:0 30px 100px #0009;overflow:hidden}.mws-pos-pay-head{background:#073f31;color:#fff;padding:18px 22px;display:flex;justify-content:space-between;align-items:center}.mws-pos-pay-head h2{margin:0;font-size:25px}.mws-pos-pay-head button{width:44px;height:44px;border:0;border-radius:10px;background:#ffffff20;color:#fff;font-size:25px}.mws-pos-pay-body{padding:22px}.mws-pos-pay-order{font-size:22px;font-weight:1000;color:#7c171b}.mws-pos-pay-total{font-size:32px;font-weight:1000;text-align:right;margin:16px 0}.mws-pos-pay-items{border:1px solid #dce7e3;border-radius:11px;overflow:hidden;margin:14px 0}.mws-pos-pay-line{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid #edf2f0}.mws-pos-pay-line:last-child{border-bottom:0}.mws-pos-pay-actions{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.mws-pos-pay-actions button{min-height:74px;border:0;border-radius:13px;font-size:20px;font-weight:1000;cursor:pointer}.mws-pos-pay-cash{background:#9bd5c1;color:#063a2d}.mws-pos-pay-cardbtn{background:#a9c8ef;color:#082e59}.mws-pos-pay-note{background:#fff4ce;border-radius:10px;padding:10px;margin-top:12px}.mws-pos-pay-error{background:#ffe8e8;color:#9b1515;border-radius:10px;padding:11px;font-weight:800;margin-top:12px}
`;document.head.appendChild(style)}

async function fetchOrder(storeId,orderId){const data=await api(`/api/public/kat/pos/stores/${encodeURIComponent(storeId)}/orders`,{cache:"no-store"});const order=(data.rows||[]).find(row=>String(row.id)===String(orderId));if(!order)throw new Error("Η Online παραγγελία δεν βρέθηκε στις ενεργές παραγγελίες.");return order}

async function preparationInfo(storeId,item){try{return await api(`/api/store-pos/stores/${encodeURIComponent(storeId)}/modifiers?productId=${encodeURIComponent(item.productId)}`,{cache:"no-store"})}catch{return null}}

async function createPreparationBatch(storeId,order){
  const checked=await Promise.all((order.items||[]).map(async item=>({item,info:await preparationInfo(storeId,item)})));
  const prep=checked.filter(x=>Boolean(x.info?.settings?.preparationEnabled)).map(({item})=>({productId:item.productId,quantity:Number(item.quantity||0),modifiers:(item.modifiers||[]).filter(m=>m?.id).map(m=>({id:String(m.id),description:String(m.description||m.name||""),price:Number(m.price||0)}))}));
  if(!prep.length)return{batchId:null,prepIds:new Set()};
  const result=await api(`/api/store-pos/stores/${encodeURIComponent(storeId)}/preparation`,{method:"POST",body:JSON.stringify({items:prep,note:`ONLINE ${order.orderNumber}`,priority:"NORMAL",productionStation:"ΠΑΡΑΓΩΓΗ"})});
  return{batchId:result.batchId||result.id,prepIds:new Set(prep.map(x=>x.productId))};
}

function transactionId(orderId){const key=`mws-online-pos-tx:${orderId}`;let value=sessionStorage.getItem(key);if(!value){value=crypto.randomUUID();sessionStorage.setItem(key,value)}return value}

async function payOrder(order,method,setError){
  if(handoffBusy)return;handoffBusy=true;setError("");
  const s=session(),storeId=s?.store?.id;if(!storeId){handoffBusy=false;setError("Δεν βρέθηκε ενεργό κατάστημα POS.");return}
  try{
    const {batchId,prepIds}=await createPreparationBatch(storeId,order);
    const rows=(order.items||[]);if(!rows.length)throw new Error("Η Online παραγγελία δεν έχει προϊόντα.");
    const delivery=Number(order.deliveryFee||0);
    const checkoutItems=rows.map((item,index)=>{
      const quantity=Math.max(1,Number(item.quantity||1));
      const base=Number(item.onlineUnitPrice||0);
      const deliveryPart=index===0?delivery/quantity:0;
      const isPrep=Boolean(batchId&&prepIds.has(item.productId));
      return{productId:item.productId,quantity,unitPriceOverride:Number((base+deliveryPart).toFixed(4)),overrideReason:isPrep?`PREPARATION:${batchId}`:`ONLINE:${order.orderNumber}`};
    });
    let sale;
    try{
      sale=await api(`/api/store-pos/stores/${encodeURIComponent(storeId)}/checkout`,{method:"POST",body:JSON.stringify({paymentMethod:method,clientTransactionId:transactionId(order.id),items:checkoutItems})});
    }catch(error){
      if(error?.data?.code==="DUPLICATE_SIMILAR_SALE"){
        sale=await api(`/api/store-pos/stores/${encodeURIComponent(storeId)}/checkout`,{method:"POST",body:JSON.stringify({paymentMethod:method,clientTransactionId:transactionId(order.id),confirmDuplicate:true,items:checkoutItems})});
      }else throw error;
    }
    if(!sale?.saleId)throw new Error("Το POS δεν επέστρεψε αριθμό πώλησης.");
    await api(`/api/public/kat/pos-handoff/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(order.id)}/complete-from-pos`,{method:"POST",body:JSON.stringify({saleId:sale.saleId,paymentMethod:method})});
    sessionStorage.removeItem(`mws-online-pos-tx:${order.id}`);
    document.querySelector(".mws-pos-pay-overlay")?.remove();
    document.querySelector(".mws-online-overlay")?.remove();
    window.dispatchEvent(new CustomEvent("mws:online-pos-completed",{detail:{orderId:order.id,orderNumber:order.orderNumber,saleId:sale.saleId,total:sale.total,paymentMethod:method}}));
    alert(`Η ${order.orderNumber} ολοκληρώθηκε από το POS.\n${method==="CASH"?"Μετρητά":"Κάρτα"} · ${euro(order.total)}\nΠώληση: ${sale.saleId}`);
    location.reload();
  }catch(error){setError(error.message||"Η πληρωμή POS απέτυχε.")}
  finally{handoffBusy=false}
}

function showPayment(order){ensureStyle();document.querySelector(".mws-pos-pay-overlay")?.remove();const overlay=document.createElement("div");overlay.className="mws-pos-pay-overlay";const items=(order.items||[]).map(item=>`<div class="mws-pos-pay-line"><span><b>${esc(item.quantity)}× ${esc(item.productName)}</b>${(item.modifiers||[]).length?`<br><small>${esc((item.modifiers||[]).map(m=>m?.description||m?.name||String(m)).join(" · "))}</small>`:""}</span><b>${euro(item.lineTotal)}</b></div>`).join("");overlay.innerHTML=`<section class="mws-pos-pay-card"><header class="mws-pos-pay-head"><div><small>MYWORKSTATION · ONLINE → POS</small><h2>Πληρωμή στο POS</h2></div><button type="button" data-close>×</button></header><div class="mws-pos-pay-body"><div class="mws-pos-pay-order">#${esc(order.orderNumber)}</div><div>${esc(order.customerName||"")} · ${order.fulfillmentType==="DELIVERY"?"Delivery":"Παραλαβή"}</div><div class="mws-pos-pay-items">${items}</div>${Number(order.deliveryFee||0)>0?`<div class="mws-pos-pay-note">Delivery: <b>${euro(order.deliveryFee)}</b> · θα περιληφθεί στο τελικό ποσό της απόδειξης POS.</div>`:""}<div class="mws-pos-pay-total">ΣΥΝΟΛΟ ${euro(order.total)}</div><div class="mws-pos-pay-error" data-error style="display:none"></div><div class="mws-pos-pay-actions"><button type="button" class="mws-pos-pay-cash" data-pay="CASH">ΜΕΤΡΗΤΑ</button><button type="button" class="mws-pos-pay-cardbtn" data-pay="CARD">ΚΑΡΤΑ / POS</button></div></div></section>`;const setError=message=>{const box=overlay.querySelector("[data-error]");box.textContent=message;box.style.display=message?"block":"none"};overlay.querySelector("[data-close]").onclick=()=>overlay.remove();overlay.querySelectorAll("[data-pay]").forEach(button=>button.onclick=()=>payOrder(order,button.dataset.pay,setError));document.body.appendChild(overlay)}

async function interceptFinal(event){const button=event.target?.closest?.('[data-status="DELIVERED"]');if(!button)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();const s=session();if(!s?.store?.id)return;try{const order=await fetchOrder(s.store.id,button.dataset.id);showPayment(order)}catch(error){alert(error.message)}}

function relabel(){document.querySelectorAll('[data-status="DELIVERED"]').forEach(button=>{button.textContent="ΣΤΟ POS / ΠΛΗΡΩΜΗ";button.title="Η τελική πώληση, απόδειξη και stock θα ολοκληρωθούν από το κανονικό POS."})}

ensureStyle();document.addEventListener("click",interceptFinal,true);const observer=new MutationObserver(relabel);observer.observe(document.documentElement,{childList:true,subtree:true});relabel();
