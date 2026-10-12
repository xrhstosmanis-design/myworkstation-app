const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

export async function openCustomerOperatorCard(root,customer,api){
  const hub=root.closest(".commerce-hub"),storeId=hub?.dataset.reportStoreId||"";
  if(!storeId)throw new Error("Επίλεξε πρώτα κατάστημα.");
  if(!customer?.id)throw new Error("Αποθήκευσε πρώτα τον πελάτη.");
  const canLink=customer.active!==false&&customer.discountAudience==="STAFF";
  const wrapper=document.createElement("div");wrapper.className="cc-modal-overlay";
  wrapper.innerHTML=`<section class="cc-modal"><div class="cc-modal-title"><h2>Κάρτα χειριστή για έκπτωση · ${esc(customer.name)}</h2><button type="button" data-work-card-close>×</button></div><div style="padding:18px"><p>Κατάστημα: <b>${esc(hub.dataset.reportStoreName)}</b></p><p>Η ίδια κάρτα εργασίας αναγνωρίζει αυτόν τον πελάτη στο POS. Δεν αλλάζουν η κάρτα, τα δικαιώματα, η παρουσία ή το πιστωτικό όριο.</p><div data-work-card-content>Φόρτωση…</div><p role="status" data-work-card-status></p></div></section>`;
  document.body.appendChild(wrapper);
  const close=()=>wrapper.remove();wrapper.querySelector("[data-work-card-close]").onclick=close;
  wrapper.addEventListener("click",e=>{if(e.target===wrapper)close()});
  const current=()=>wrapper.isConnected&&hub.isConnected&&hub.dataset.reportStoreId===storeId;
  const status=wrapper.querySelector("[data-work-card-status]");
  const load=async()=>{
    const [options,existing]=await Promise.all([api(`/api/customer-control/stores/${encodeURIComponent(storeId)}/operator-card-options`),api(`/api/customer-control/${encodeURIComponent(customer.id)}/operator-card?storeId=${encodeURIComponent(storeId)}`)]);
    if(!current())return close();
    if(options.storeId!==storeId||existing.storeId!==storeId)throw new Error("Η απάντηση δεν αντιστοιχεί στο επιλεγμένο κατάστημα.");
    const link=existing.link;
    wrapper.querySelector("[data-work-card-content]").innerHTML=`<p>Τρέχουσα σύνδεση: <b>${link?`${esc(link.displayName)} · …${esc(link.cardCodeLast4||"")}${link.active&&link.employeeActive?"":" · ανενεργή"}`:"Χωρίς σύνδεση"}</b></p><form class="cc-form" data-work-card-form><label class="wide">Χειριστής με ενεργή κάρτα<select name="credentialId" required><option value="">Επίλεξε χειριστή</option>${options.items.map(item=>`<option value="${esc(item.credentialId)}" ${item.credentialId===link?.credentialId?"selected":""} ${item.linkedCustomerId&&item.linkedCustomerId!==customer.id?"disabled":""}>${esc(item.displayName)} · …${esc(item.cardCodeLast4||"")}${item.linkedCustomerId&&item.linkedCustomerId!==customer.id?" · συνδεδεμένος με άλλον πελάτη":""}</option>`).join("")}</select></label><button class="primary" ${options.items.length&&canLink?"":"disabled"}>Σύνδεση κάρτας χειριστή</button>${link?'<button type="button" data-work-card-unlink>Αποσύνδεση κάρτας</button>':""}</form>${canLink?"":'<p>Για νέα σύνδεση αποθήκευσε πρώτα ενεργό πελάτη με κατηγορία Προσωπικό.</p>'}<small>Χρησιμοποιείς την υπάρχουσα κάρτα εργασίας. Η χωριστή κάρτα μέλους του πελάτη παραμένει διαθέσιμη.</small>`;
    const form=wrapper.querySelector("[data-work-card-form]");let busy=false;
    const save=async credentialId=>{
      if(busy)return;
      if(!current()){close();return}
      busy=true;form.querySelectorAll("button,select").forEach(el=>el.disabled=true);status.textContent="Αποθήκευση…";
      try{
        await api(`/api/customer-control/${encodeURIComponent(customer.id)}/operator-card`,{method:"PUT",body:JSON.stringify({storeId,credentialId})});
        if(!current())return close();
        await load();status.textContent=credentialId?"Η κάρτα συνδέθηκε. Η έκπτωση χρησιμοποιεί την αποθηκευμένη καρτέλα αυτού του πελάτη.":"Η κάρτα αποσυνδέθηκε από τον πελάτη. Η κάρτα εργασίας δεν άλλαξε.";
      }catch(error){if(current()){status.textContent=error.message;await load().catch(()=>{})}}
      finally{busy=false}
    };
    form.onsubmit=e=>{e.preventDefault();const value=form.elements.namedItem("credentialId").value;if(value&&canLink)void save(value)};
    wrapper.querySelector("[data-work-card-unlink]")?.addEventListener("click",()=>void save(null));
  };
  try{await load()}catch(error){if(current())status.textContent=error.message}
}
