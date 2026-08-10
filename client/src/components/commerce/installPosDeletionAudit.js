const token=()=>localStorage.getItem("token")||"";
const n=v=>Number(String(v??"").replace(",","."))||0;
const storeId=()=>{const m=window.location.pathname.match(/^\/pos\/([^/]+)\/?$/);return m?decodeURIComponent(m[1]):null};

function lineFromArticle(article){
  if(!article)return null;
  const qtyCell=article.querySelector("span:first-child");
  const copy=qtyCell?.cloneNode(true);copy?.querySelectorAll("button").forEach(x=>x.remove());
  const quantity=Math.max(0,n(copy?.textContent));
  const name=article.querySelector("b")?.textContent?.trim()||"";
  const priceCells=article.querySelectorAll("span");
  const unitPrice=n(priceCells[3]?.textContent?.replace(/[^0-9,.-]/g,""));
  if(!name||quantity<=0)return null;
  return {name,quantity,unitPrice};
}

function currentLines(runtime){return [...runtime.querySelectorAll(".store-pos-sale-lines article")].map(lineFromArticle).filter(Boolean)}

function send(action,items){
  const sid=storeId();if(!sid||!items.length||!token())return;
  fetch("/api/reports/sale-list-deletions",{method:"POST",keepalive:true,headers:{"Content-Type":"application/json",Authorization:`Bearer ${token()}`},body:JSON.stringify({storeId:sid,action,items})}).catch(()=>{});
}

export function installPosDeletionAudit(){
  if(!/^\/pos\//.test(window.location.pathname)||window.__mwsPosDeletionAuditInstalled)return;
  window.__mwsPosDeletionAuditInstalled=true;
  document.addEventListener("click",event=>{
    const button=event.target.closest("button");if(!button)return;
    const runtime=button.closest(".commercial-pos-runtime");if(!runtime)return;
    const label=String(button.textContent||"").trim().toLocaleUpperCase("el-GR");
    if(label==="ΣΒΗΣΙΜΟ"){
      const item=lineFromArticle(runtime.querySelector(".store-pos-sale-lines article.selected"));if(item)send("ITEM_REMOVE",[item]);return;
    }
    if(label==="−"){
      const article=button.closest(".store-pos-sale-lines article"),item=lineFromArticle(article);if(item&&item.quantity<=1)send("ITEM_REMOVE",[item]);return;
    }
    if(button.closest("footer")&&(label.includes("ΚΑΘΑΡΙΣΜΟΣ ΣΥΝΑΛΛΑΓΗΣ")||label.includes("ΑΚΥΡΩΣΗ ΣΥΝΑΛΛΑΓΗΣ"))){
      const items=currentLines(runtime);if(items.length)send("CLEAR_CART",items);
    }
  },true);
}
