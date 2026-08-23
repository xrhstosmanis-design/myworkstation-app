const previousFetch=window.fetch.bind(window);
const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").replace(/[^A-ZΑ-Ω0-9]/g,"");
const tax=v=>String(v||"").replace(/\D/g,"");
const authHeaders=()=>{const token=localStorage.getItem("token")||sessionStorage.getItem("storeOperatorToken");return {"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})}};
const activeModal=()=>[...document.querySelectorAll(".po-modal")].reverse().find(m=>m.querySelector('form[data-new-order]'))||null;
function setSelect(select,id){if(!select||!id)return;const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value")?.set;setter?.call(select,String(id));select.dispatchEvent(new Event("change",{bubbles:true}))}
function supplierMessage(modal,text,good=false){const el=modal?.querySelector("[data-supplier-message]");if(!el)return;el.textContent=text;el.style.color=good?"#06735f":"#9a5a00"}
async function resolveSupplier(data){
  const modal=activeModal();if(!modal)return;
  const candidate=data?.supplier||data?.result?.supplier||data?.supplierCandidate||null;
  if(!candidate?.name&&!candidate?.taxId){supplierMessage(modal,"Το Invoice Learning δεν επέστρεψε στοιχεία προμηθευτή.");return}
  const response=await previousFetch("/api/commerce/suppliers",{headers:authHeaders()});
  const rows=response.ok?await response.json().catch(()=>[]):[];
  const candidateTax=tax(candidate.taxId),candidateName=norm(candidate.name);
  let match=rows.find(r=>candidateTax&&tax(r.taxId)===candidateTax)||null;
  if(!match&&candidateName.length>=4)match=rows.find(r=>norm(r.name)===candidateName)||rows.find(r=>{const n=norm(r.name);return n.length>=4&&(n.includes(candidateName)||candidateName.includes(n))})||null;
  if(match){
    const select=modal.querySelector('form[data-new-order] [name="supplierId"]');
    if(select&&!([...select.options].some(o=>o.value===String(match.id)))){const option=document.createElement("option");option.value=match.id;option.textContent=match.name;select.appendChild(option)}
    setSelect(select,match.id);
    supplierMessage(modal,`✓ Αναγνωρίστηκε προμηθευτής: ${match.name}${match.taxId?` · ΑΦΜ ${match.taxId}`:""} (Invoice Learning).`,true);
    return;
  }
  supplierMessage(modal,`Αναγνωρίστηκε προμηθευτής${candidate.name?`: ${candidate.name}`:""}${candidate.taxId?` · ΑΦΜ ${candidate.taxId}`:""}, αλλά δεν υπάρχει ακόμη στο BackOffice.`);
  const box=modal.querySelector("[data-invoice-supplier-box]");
  const area=box?.querySelector("[data-new-supplier]");if(area)area.hidden=false;
  const values={name:candidate.name||"",tax:candidate.taxId||"",email:candidate.email||"",phone:candidate.phone||"",address:candidate.address||"",city:candidate.city||""};
  for(const [key,value] of Object.entries(values)){const input=box?.querySelector(`[data-sup-${key}]`);if(input&&!input.value)input.value=value}
}
window.fetch=async function(input,init={}){
  const url=typeof input==="string"?input:input?.url||"";
  const response=await previousFetch(input,init);
  if(/\/api\/platform\/invoice-learning\/ai-recheck(?:\?|$)/.test(url)&&response.ok){
    response.clone().json().then(resolveSupplier).catch(()=>{});
  }
  return response;
};
