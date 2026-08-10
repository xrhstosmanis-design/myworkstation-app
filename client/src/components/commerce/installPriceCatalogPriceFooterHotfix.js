let installed=false;
function exportVisiblePriceTable(){
  const root=document.querySelector(".price-catalog-suite:not([hidden])");
  const rows=[...root?.querySelectorAll(".pc-table.prices .row")||[]];
  if(rows.length<2)return alert("Δεν υπάρχουν δεδομένα για εξαγωγή.");
  const csv="\ufeff"+rows.map(row=>[...row.children].slice(1).map(cell=>`"${String(cell.innerText||cell.textContent||"").trim().replace(/"/g,'""')}"`).join(";")).join("\r\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download="timokatalogos-times.csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function closePriceCatalog(){
  const strip=document.querySelector(".commerce-hub .commerce-module-strip");
  const fallback=[...strip?.querySelectorAll("button")||[]].find(b=>!b.matches("[data-price-catalog-launch]"));
  fallback?.click();
}
function handler(event){
  const priceFooter=event.target.closest(".pcv2-price-footer");
  if(!priceFooter)return;
  if(event.target.closest("[data-pcv2-close]")){event.preventDefault();event.stopImmediatePropagation();closePriceCatalog();return}
  if(event.target.closest("[data-pcv2-export-price]")){event.preventDefault();event.stopImmediatePropagation();exportVisiblePriceTable()}
}
export function installPriceCatalogPriceFooterHotfix(){if(installed)return;installed=true;document.addEventListener("click",handler,true)}
