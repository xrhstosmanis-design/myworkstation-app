const allowed=()=>{try{return ["SUPER_ADMIN","OWNER","ADMIN","MANAGER"].includes(JSON.parse(localStorage.getItem("user")||"{}").role)}catch{return false}};
let supplierId="",installed=false;
async function api(path,options={}){const token=localStorage.getItem("token");const r=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Σφάλμα ${r.status}`);return d}
function remember(event){const edit=event.target?.closest?.("[data-sc-edit]");if(edit?.dataset?.scEdit)supplierId=edit.dataset.scEdit;const row=event.target?.closest?.("[data-supplier-row]");if(row?.dataset?.supplierRow)supplierId=row.dataset.supplierRow}
async function enhance(form){
  if(form.dataset.supplierBasicExtras==="1"||!supplierId)return;
  form.dataset.supplierBasicExtras="1";
  const id=supplierId;
  let data;
  try{data=await api(`/api/supplier-control/${encodeURIComponent(id)}/basic-extra`)}catch(error){form.dataset.supplierBasicExtras="";console.error("Supplier basic extras:",error);return}
  if(!form.isConnected||id!==supplierId)return;
  const tax=document.createElement("label");tax.className="sbe-tax-office";tax.innerHTML=`Δ.Ο.Υ.<input data-sbe-tax-office value="${String(data.taxOffice||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;")}" placeholder="Δ.Ο.Υ. προμηθευτή">`;
  const myf=document.createElement("label");myf.className="check sbe-myf";myf.innerHTML=`<input type="checkbox" data-sbe-myf ${data.myfEnabled?"checked":""}> Υποβολή ΜΥΦ`;
  const anchor=form.querySelector('[name="chargeAddress"]')?.closest("label")||form.querySelector("button.primary");
  if(anchor){form.insertBefore(tax,anchor);form.insertBefore(myf,anchor)}else{form.append(tax,myf)}
  const original=form.onsubmit;
  form.onsubmit=async event=>{
    event.preventDefault();
    const taxOffice=form.querySelector("[data-sbe-tax-office]")?.value?.trim()||null;
    const myfEnabled=!!form.querySelector("[data-sbe-myf]")?.checked;
    try{
      await api(`/api/supplier-control/${encodeURIComponent(id)}/basic-extra`,{method:"PATCH",body:JSON.stringify({taxOffice,myfEnabled})});
    }catch(error){alert(`Δεν αποθηκεύτηκαν Δ.Ο.Υ./ΜΥΦ: ${error.message}`);return false}
    if(typeof original==="function")return original.call(form,event);
    return false;
  };
}
function scan(){document.querySelectorAll('.sc-modal form[data-basic]').forEach(enhance)}
export function installSupplierBasicExtras(){
  if(installed||!allowed())return;installed=true;
  document.addEventListener("click",remember,true);
  document.addEventListener("contextmenu",remember,true);
  document.addEventListener("pointerdown",event=>{if(event.pointerType==="touch")remember(event)},true);
  scan();
  const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});
}
