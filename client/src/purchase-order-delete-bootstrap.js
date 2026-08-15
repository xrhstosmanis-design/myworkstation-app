const token=()=>localStorage.getItem("token");
async function removeOrder(id){
  const response=await fetch(`/api/purchase-orders/${encodeURIComponent(id)}`,{method:"DELETE",headers:{"Content-Type":"application/json",...(token()?{Authorization:`Bearer ${token()}`}:{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);
  return data;
}
function decorate(){
  document.querySelectorAll(".po-orders-table .row:not(.head)").forEach(row=>{
    const open=row.querySelector("[data-po-open]");
    if(!open||row.querySelector("[data-po-delete-order]"))return;
    const status=row.querySelector(".status")?.textContent?.trim()||"";
    if(status!=="Νέα παραγγελία")return;
    const button=document.createElement("button");
    button.type="button";
    button.className="icon danger";
    button.dataset.poDeleteOrder=open.dataset.poOpen;
    button.title="Διαγραφή πρόχειρης παραγγελίας";
    button.textContent="🗑";
    button.style.marginLeft="6px";
    open.after(button);
    button.addEventListener("click",async event=>{
      event.preventDefault();event.stopPropagation();
      const invoice=row.children?.[2]?.textContent?.trim()||"την παραγγελία";
      if(!confirm(`Διαγραφή της πρόχειρης παραγγελίας ${invoice};\n\nΗ διαγραφή επιτρέπεται μόνο αν δεν έχει οριστικοποιηθεί.`))return;
      button.disabled=true;
      try{
        await removeOrder(button.dataset.poDeleteOrder);
        row.remove();
        document.querySelector("[data-po-refresh]")?.click();
      }catch(error){alert(error.message);button.disabled=false}
    });
  });
}
const observer=new MutationObserver(decorate);
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener("load",decorate);
setTimeout(decorate,500);
