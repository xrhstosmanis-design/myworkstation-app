import {printInventoryRows} from "./inventory-export.js";
import {greeceDateInput,greeceDateTimeToIso} from "../../../../shared/greece-time.mjs";
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=value=>`${Number(value||0).toFixed(2)} €`;
const date=value=>value?new Date(value).toLocaleString('el-GR',{timeZone:"Europe/Athens",hour12:false}):'—';
let menu=null,modal=null,longTimer=null,longStart=null;

const registeredRows = new WeakMap();
export function registerInventoryMenuRow(element, context) {
  registeredRows.set(element, context);
}

function rowData(element) {
  const context = registeredRows.get(element);
  if (!context) return null;
  const {row,storeId} = context;
  const isCurrent = () => element.isConnected && context.isCurrent()
    && registeredRows.get(element)?.storeId === storeId
    && registeredRows.get(element)?.row.productId === row.productId
    && registeredRows.get(element)?.readOnly === context.readOnly
    && registeredRows.get(element)?.staffCardEdit === context.staffCardEdit;
  return {
    ...context, ...row, element, isCurrent,
    onRefresh: message => registeredRows.get(element)?.onRefresh?.(message),
    async api(path, options) {
      if (!isCurrent()) throw new Error('Άνοιξε ξανά το είδος στο ενεργό κατάστημα.');
      const result = await context.api(path, options);
      if (!isCurrent()) throw new Error('Η προβολή της αποθήκης άλλαξε.');
      return result;
    },
    stock: Number(row.currentStock ?? 0),
    lastPurchase: Number(row.lastPurchasePrice ?? 0),
    salePrice: Number(row.salePrice ?? 0),
    vat: Number(row.vatRate ?? 0),
    category: row.categoryName, subcategory: row.subcategoryName, supplier: row.supplierName,
  };
}
function selectedRows(d) {
  return [...d.element.closest('.ia-shell').querySelectorAll('.ia-row.data')]
    .map(rowData).filter(item=>item?.selected && item.storeId===d.storeId);
}
function ensureStyle(){if(document.getElementById('mws-inv-actions-style'))return;const s=document.createElement('style');s.id='mws-inv-actions-style';s.textContent=`
#mws-inv-menu{position:fixed;z-index:2147483640;width:330px;max-width:94vw;max-height:calc(100dvh - 12px);overflow:auto;background:#fff;border:1px solid #94a9bc;border-radius:9px;box-shadow:0 20px 60px rgba(0,0,0,.32);padding:5px;font-family:inherit;color:#17324b}#mws-inv-menu[hidden]{display:none!important}#mws-inv-menu .title{padding:9px 10px;font-weight:950;color:#123b5d;border-bottom:1px solid #d8e1e9}#mws-inv-menu button{border:0;background:#fff;width:100%;padding:8px 9px;text-align:left;border-radius:6px;font:inherit;font-weight:760;color:#17324b;cursor:pointer;display:flex;justify-content:space-between;gap:8px}#mws-inv-menu button:hover{background:#eaf3fb}#mws-inv-menu .sep{height:1px;background:#dbe4ec;margin:4px}#mws-inv-menu .sub{position:relative}#mws-inv-menu .submenu{display:none;position:absolute;left:100%;top:-5px;width:340px;background:#fff;border:1px solid #94a9bc;border-radius:8px;box-shadow:0 16px 45px rgba(0,0,0,.25);padding:5px}#mws-inv-menu .sub.open>.submenu{display:block;position:static;width:auto;box-shadow:none;margin:0 6px 4px}.mws-inv-modal-bg{position:fixed;inset:0;z-index:2147483645;background:rgba(9,24,39,.58);display:flex;align-items:center;justify-content:center;padding:18px}.mws-inv-modal{width:min(1100px,97vw);max-height:94vh;background:#fff;border-radius:12px;box-shadow:0 25px 90px rgba(0,0,0,.38);overflow:hidden;display:flex;flex-direction:column}.mws-inv-modal header{background:#1769aa;color:#fff;padding:12px 15px;display:flex;justify-content:space-between;align-items:center}.mws-inv-modal header b{font-size:19px}.mws-inv-modal header button{border:0;background:transparent;color:#fff;font-size:24px;cursor:pointer}.mws-inv-body{padding:15px;overflow:auto}.mws-inv-actions{padding:11px 15px;border-top:1px solid #d6e0e8;display:flex;justify-content:space-between;gap:10px}.mws-inv-actions button,.mws-inv-body button{border:1px solid #b6c7d5;border-radius:7px;background:#fff;padding:8px 12px;font-weight:850;cursor:pointer}.mws-inv-actions .primary{background:#0f766e;color:#fff;border-color:#0f766e}.mws-inv-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mws-inv-form label{display:grid;gap:5px;font-weight:800;font-size:12px}.mws-inv-form input,.mws-inv-form select,.mws-inv-form textarea{border:1px solid #b8c8d6;border-radius:7px;padding:9px;font:inherit}.mws-inv-table{overflow:auto;border:1px solid #c9d6e1}.mws-inv-table table{border-collapse:collapse;width:100%;min-width:900px;font-size:12px}.mws-inv-table th{background:#1769aa;color:#fff;position:sticky;top:0}.mws-inv-table th,.mws-inv-table td{padding:7px;border:1px solid #d5dee7;text-align:left}.mws-inv-summary{display:flex;gap:18px;flex-wrap:wrap;padding:10px;margin-bottom:10px;background:#eef5fb;border-radius:8px;font-weight:850}@media(max-width:800px){.mws-inv-form{grid-template-columns:1fr}#mws-inv-menu .submenu{left:0;top:100%;width:100%}}`;
document.head.appendChild(s)}
function closeMenu(){if(menu)menu.hidden=true}
function ensureMenu(){ensureStyle();if(menu)return menu;menu=document.createElement('div');menu.id='mws-inv-menu';menu.hidden=true;document.body.appendChild(menu);return menu}
function closeModal(){modal?.remove();modal=null}
function showModal(title,body,onSave=null,saveLabel='Καταχώρηση'){closeModal();ensureStyle();modal=document.createElement('div');modal.className='mws-inv-modal-bg';modal.innerHTML=`<section class="mws-inv-modal"><header><b>${esc(title)}</b><button data-close>×</button></header><div class="mws-inv-body">${body}</div><div class="mws-inv-actions"><button data-close>Επιστροφή</button>${onSave?`<button class="primary" data-save>${esc(saveLabel)}</button>`:''}</div></section>`;document.body.appendChild(modal);modal.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeModal);if(onSave){
  const root=modal,save=root.querySelector('[data-save]');
  save.onclick=async()=>{
    save.disabled=true;
    try{await onSave(root);if(modal===root)closeModal()}
    catch(error){if(modal===root)alert(error.message)}
    finally{save.disabled=false}
  };
}return modal}
function priceModal(d, focusMarkup = false) {
  const taxFactor = 1 + d.vat / 100;
  const cost = d.lastPurchase || Number(d.costPrice ?? 0);
  const root = showModal(`Αλλαγή λιανικής · ${d.name}`, `
    <div class="mws-inv-summary"><span>ΦΠΑ: ${d.vat}%</span><span>Καθαρό κόστος: ${money(cost)}</span></div>
    <div class="mws-inv-form">
      <label>Λιανική<input data-price type="number" min="0" step="0.01" required value="${d.salePrice}"></label>
      <label>Markup (%)<input data-markup type="number" step="0.01" ${cost > 0 ? '' : 'disabled'}></label>
      <label>Margin λιανικής<input data-margin readonly></label>
    </div>`, async () => {
      const field = root.querySelector('[data-price]');
      if (!field.reportValidity()) throw new Error('Συμπλήρωσε έγκυρη λιανική τιμή.');
      await d.api(`/api/price-catalog/products/${d.productId}/price`,{
        method:'PATCH',body:JSON.stringify({storeId:d.storeId,salePrice:field.valueAsNumber})
      });
      await d.onRefresh('Η λιανική τιμή του καταστήματος αποθηκεύτηκε.');
    });
  const price = root.querySelector('[data-price]');
  const markup = root.querySelector('[data-markup]');
  const margin = root.querySelector('[data-margin]');
  const sync = () => {
    const net = (price.valueAsNumber || 0) / taxFactor;
    markup.value = cost > 0 ? (((net - cost) / cost) * 100).toFixed(2) : '';
    margin.value = net > 0 ? `${(((net - cost) / net) * 100).toFixed(2)}%` : '—';
  };
  price.oninput = sync;
  markup.onchange = () => {
    if (Number.isFinite(markup.valueAsNumber)) price.value = (cost * (1 + markup.valueAsNumber / 100) * taxFactor).toFixed(2);
    sync();
  };
  sync();
  (focusMarkup && cost > 0 ? markup : price).focus();
}

async function wholesaleModal(d) {
  const [{customers}, {items}] = await Promise.all([
    d.api('/api/price-catalog/lookups'),
    d.api(`/api/price-catalog/wholesale?q=${encodeURIComponent(d.sku || d.name)}`),
  ]);
  if (!customers.length) throw new Error('Δεν υπάρχουν ενεργοί πελάτες χονδρικής.');
  const existing = new Map(items.filter(item => item.productId === d.productId)
    .map(item => [item.customerId, item.wholesalePrice]));
  const root = showModal(`Τιμή χονδρικής · ${d.name}`, `<div class="mws-inv-form">
    <label>Πελάτης<select data-customer required><option value="">Επίλεξε πελάτη</option>${customers.map(customer => `<option value="${esc(customer.id)}">${esc(customer.name)}${customer.taxId ? ' · ' + esc(customer.taxId) : ''}</option>`).join('')}</select></label>
    <label>Τιμή πελάτη<input data-price type="number" min="0" step="0.01" required></label>
  </div>`, async () => {
    if (!customer.reportValidity() || !price.reportValidity()) throw new Error('Συμπλήρωσε πελάτη και τιμή χονδρικής.');
    await d.api('/api/price-catalog/wholesale',{
      method:'POST',body:JSON.stringify({productId:d.productId,customerId:customer.value,wholesalePrice:price.valueAsNumber})
    });
    await d.onRefresh('Η τιμή χονδρικής του πελάτη αποθηκεύτηκε.');
  });
  const customer = root.querySelector('[data-customer]');
  const price = root.querySelector('[data-price]');
  customer.onchange = () => {price.value = existing.get(customer.value) ?? ''};
}
function stockModal(d){showModal(`Διόρθωση Stock · ${d.name}`,`<div class="mws-inv-summary"><span>Τρέχον stock: ${d.stock}</span></div><div class="mws-inv-form"><label>Τρόπος<select data-mode><option value="SET">(=) Ακριβώς την ποσότητα</option><option value="ADD">(+) Αύξηση κατά</option><option value="SUBTRACT">(-) Μείωση κατά</option></select></label><label>Ποσότητα<input data-qty type="number" min="0" step="0.001"></label><label style="display:flex;align-items:center;gap:8px"><input data-log type="checkbox" checked> Καταχώρηση στο ημερολόγιο κινήσεων</label></div>`,async root=>{const sid=d.storeId;const quantity=root.querySelector('[data-qty]');if(quantity.value===''||!quantity.reportValidity())throw new Error('Συμπλήρωσε έγκυρη ποσότητα.');await d.api(`/api/owner-products/${d.productId}/stock-adjustment`,{method:'POST',body:JSON.stringify({storeId:sid,mode:root.querySelector('[data-mode]').value,quantity:quantity.valueAsNumber,logMovement:root.querySelector('[data-log]').checked})});d.onRefresh('Η διόρθωση αποθέματος καταχωρίστηκε.')})}
function destructionModal(d){showModal(`Καταστροφή ποσότητας · ${d.name}`,`<div class="mws-inv-summary"><span>Τρέχον stock: ${d.stock}</span></div><div class="mws-inv-form"><label>Ποσότητα<input data-qty type="number" min="0.001" step="0.001"></label><label>Αιτιολογία<input data-reason value="Καταστροφή / φύρα"></label></div>`,async root=>{const sid=d.storeId;if(!sid)throw new Error('Δεν βρέθηκε το ενεργό κατάστημα.');await d.api(`/api/owner-products/${d.productId}/destruction`,{method:'POST',body:JSON.stringify({storeId:sid,quantity:Number(root.querySelector('[data-qty]').value),reason:root.querySelector('[data-reason]').value})});d.onRefresh('Η καταστροφή ποσότητας καταχωρίστηκε.')})}
async function supplierReturnModal(d){const suppliers=(await d.api('/api/commerce/suppliers')).filter(x=>x.active!==false);if(!suppliers.length)throw new Error('Δεν υπάρχουν ενεργοί προμηθευτές.');showModal(`Δελτίο Αποστολής Επιστροφής · ${d.name}`,`<div class="mws-inv-summary"><span>Τρέχον stock: ${d.stock}</span><span>Το stock αλλάζει μόνο μετά από επιτυχημένη έκδοση μέσω myDATA.</span></div><div class="mws-inv-form"><label>Προμηθευτής<select data-supplier><option value="">Επίλεξε προμηθευτή</option>${suppliers.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label><label>Ποσότητα<input data-qty type="number" min="0.001" max="${d.stock}" step="0.001"></label><label>Αριθμός δελτίου<input data-document required></label><label>Ημερομηνία διακίνησης<input data-dispatched lang="en-GB" type="datetime-local"></label><label style="grid-column:1/-1">Διεύθυνση προορισμού<input data-address required></label><label style="grid-column:1/-1">Αιτιολογία<textarea data-reason rows="3" placeholder="π.χ. ληγμένο προϊόν"></textarea></label><div style="grid-column:1/-1;background:#fff7dc;border:1px solid #e3c35a;border-radius:7px;padding:10px">Αποθηκεύεται ως πρόχειρο δελτίο. Χωρίς επιβεβαίωση myDATA/MARK δεν αφαιρείται ποσότητα από την αποθήκη.</div></div>`,async root=>{const sid=d.storeId,supplierId=root.querySelector('[data-supplier]').value,quantity=Number(root.querySelector('[data-qty]').value),reason=root.querySelector('[data-reason]').value.trim(),documentNumber=root.querySelector('[data-document]').value.trim(),destinationAddress=root.querySelector('[data-address]').value.trim(),rawDate=root.querySelector('[data-dispatched]').value;if(!sid)throw new Error('Δεν βρέθηκε το ενεργό κατάστημα.');if(!supplierId)throw new Error('Επίλεξε προμηθευτή.');if(!(quantity>0))throw new Error('Συμπλήρωσε έγκυρη ποσότητα.');if(!documentNumber)throw new Error('Συμπλήρωσε αριθμό δελτίου.');if(destinationAddress.length<3)throw new Error('Συμπλήρωσε διεύθυνση προορισμού.');if(reason.length<3)throw new Error('Συμπλήρωσε αιτιολογία.');const result=await d.api(`/api/owner-products/${d.productId}/supplier-return`,{method:'POST',body:JSON.stringify({storeId:sid,supplierId,quantity,reason,documentNumber,destinationAddress,dispatchedAt:rawDate?greeceDateTimeToIso(rawDate):null})});d.onRefresh(result.message||'Το δελτίο αποθηκεύτηκε ως πρόχειρο χωρίς αλλαγή stock.')},'Αποθήκευση πρόχειρου')}
function ranges(days=30){const to=new Date(),from=new Date(Date.now()-days*86400000);return {from:greeceDateInput(from),to:greeceDateInput(to)}}
function csvDownload(filename,headers,rows){const csv=[headers,...rows].map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function movementLabel(type) {
  const labels = {PURCHASE_REOPEN:'ΕΠΑΝΑΦΟΡΑ ΑΓΟΡΑΣ',RETURN:'ΕΠΙΣΤΡΟΦΗ',CANCEL:'ΑΚΥΡΩΣΗ',SALE:'ΠΩΛΗΣΗ'};
  return labels[type] ?? type;
}

async function movementModal(d, exportOnly=false) {
  const query = new URLSearchParams({storeId:d.storeId,...ranges(30)});
  const data = await d.api(`/api/inventory-ledger/${encodeURIComponent(d.productId)}/movements?${query}`);
  const rows = data.movements || [];
  const headers = ['Ημερομηνία','Κίνηση','Χειριστής','Κόστος','Τιμή πώλησης','Είσοδος','Έξοδος','Απόθεμα','Σημείωση'];
  const values = rows.map(row => [
    date(row.createdAt), movementLabel(row.movementType), row.actorName,
    row.movementType === 'PURCHASE' ? row.unitCost : '', row.salePrice,
    row.inQty ?? 0, row.outQty ?? 0, row.stockAfter, row.note
  ]);
  const download = () => csvDownload(`kiniseis-${d.sku || d.productId}.csv`,headers,values);
  if(exportOnly) return download();

  const rec = data.reconciliation;
  const agrees = rec?.status === 'AGREEMENT';
  const reconciliation = data.reconciliationAccess?.allowed === true && rec
    ? `<div class="mws-inv-summary"><b>${agrees ? 'ΣΥΜΦΩΝΙΑ STOCK' : 'ΧΡΕΙΑΖΕΤΑΙ ΕΛΕΓΧΟΣ'}</b>
       <span>Τρέχον: ${esc(rec.currentStock)}</span><span>Καταγεγραμμένες κινήσεις: ${esc(rec.ledgerStock)}</span>
       <span>Διαφορά: ${esc(rec.difference)}</span><span>Κινήσεις: ${esc(rec.movementCount)}</span>
       <span>Πιθανές διπλές: ${rec.duplicateCandidates?.length ?? 0}</span></div>`
    : '<div class="mws-inv-summary"><span>Διαθέσιμο στο επί πληρωμή module «Έλεγχος Απωλειών».</span></div>';
  const root = showModal(`Κινήσεις είδους · ${d.name}`,`
    <div class="mws-inv-summary"><span>Από ${query.get('from')}</span><span>Έως ${query.get('to')}</span>
      <span>Τρέχον stock ${esc(data.product?.currentStock)}</span><button type="button" data-export>CSV</button></div>
    ${reconciliation}<div class="mws-inv-table"><table>
      <thead><tr>${headers.map(label=>`<th>${label}</th>`).join('')}</tr></thead>
      <tbody>${values.length ? values.map(row=>`<tr>${row.map(value=>`<td>${esc(value ?? '—')}</td>`).join('')}</tr>`).join('') :
        '<tr><td colspan="9">Δεν βρέθηκαν κινήσεις στο επιλεγμένο διάστημα.</td></tr>'}</tbody>
    </table></div>`);
  root.querySelector('[data-export]').onclick = download;
}
async function purchasesModal(d, exportOnly=false){const sid=d.storeId,r=ranges(365),data=await d.api(`/api/owner-products/${d.productId}/purchases?storeId=${encodeURIComponent(sid)}&from=${r.from}&to=${r.to}`),rows=data.purchases||[];const download=()=>csvDownload(`agores-${d.sku||d.productId}.csv`,['Προμηθευτής','Ημερομηνία','Ποσότητα','Καθαρή αγορά','Αρχική αγορά','Έκπτωση1','Έκπτωση2','Έκπτωση3','ΦΠΑ','Σύνολο','Τιμολόγιο'],rows.map(x=>[x.supplierName,date(x.invoicedAt||x.createdAt),x.quantity,x.unitCost,x.initialUnitCost,x.discount1,x.discount2,x.discount3,x.vatRate,x.grossAmount,x.invoiceNumber||'']));if(exportOnly)return download();showModal(`Ιστορικό αγορών · ${d.name}`,`<div class="mws-inv-summary"><span>${rows.length} εγγραφές</span><button data-export>Excel / CSV</button></div><div class="mws-inv-table"><table><thead><tr><th>Προμηθευτής</th><th>Ημερομηνία</th><th>Ποσότητα</th><th>Καθαρή αγορά</th><th>Αρχική αγορά</th><th>Έκπ.1</th><th>Έκπ.2</th><th>Έκπ.3</th><th>ΦΠΑ</th><th>Σύνολο</th><th>Τιμολόγιο</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.supplierName)}</td><td>${date(x.invoicedAt||x.createdAt)}</td><td>${x.quantity}</td><td>${money(x.unitCost)}</td><td>${money(x.initialUnitCost)}</td><td>${x.discount1}%</td><td>${x.discount2}%</td><td>${x.discount3}%</td><td>${x.vatRate}%</td><td>${money(x.grossAmount)}</td><td>${esc(x.invoiceNumber||'—')}</td></tr>`).join('')}</tbody></table></div>`);modal.querySelector('[data-export]').onclick=download}
// Shared entry: Sales uses the same purchase history and export as Warehouse.
export async function openInventoryPurchases(context){
  await purchasesModal(context);
  return modal;
}
async function priceHistoryModal(d, exportOnly=false){const rows=await d.api(`/api/owner-products/${d.productId}/price-history?storeId=${encodeURIComponent(d.storeId)}`);const download=()=>csvDownload(`times-${d.sku||d.productId}.csv`,['Ημερομηνία','Κατάστημα','Παλιά λιανική','Νέα λιανική','Τύπος'],rows.map(x=>[date(x.createdAt),x.storeName||'',x.oldPrice,x.newPrice,x.changeType]));if(exportOnly)return download();showModal(`Ιστορικό αλλαγών τιμής · ${d.name}`,`<div class="mws-inv-summary"><span>${rows.length} αλλαγές</span><button data-export>Excel / CSV</button></div><div class="mws-inv-table"><table><thead><tr><th>Ημερομηνία</th><th>Κατάστημα</th><th>Παλιά λιανική</th><th>Νέα λιανική</th><th>Τύπος</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${date(x.createdAt)}</td><td>${esc(x.storeName||'Όλα/Βασική')}</td><td>${money(x.oldPrice)}</td><td>${money(x.newPrice)}</td><td>${esc(x.changeType)}</td></tr>`).join('')}</tbody></table></div>`);modal.querySelector('[data-export]').onclick=download}
async function ordersModal(d) {
  const query = new URLSearchParams({storeId:d.storeId,...ranges(365)});
  const {purchases=[]} = await d.api(`/api/owner-products/${encodeURIComponent(d.productId)}/purchases?${query}`);
  const orders = [...new Map(purchases.filter(row=>row.orderId).map(row=>[row.orderId,row])).values()];
  const labels = {NEW:'Νέα',FINAL:'Οριστική',INVOICED:'Τιμολογημένη'};
  const root = showModal(`Παραγγελίες / Αγορές · ${d.name}`,`
    <div class="mws-inv-summary"><span>Από ${query.get('from')} έως ${query.get('to')}</span></div>
    ${orders.length ? `<div class="mws-inv-table"><table><thead><tr><th>Ημερομηνία</th><th>Προμηθευτής</th><th>Κατάσταση</th><th>Τιμολόγιο</th><th></th></tr></thead><tbody>
      ${orders.map((order,index)=>`<tr><td>${date(order.createdAt)}</td><td>${esc(order.supplierName)}</td>
        <td>${esc(labels[order.status] || order.status)}</td><td>${esc(order.invoiceNumber || '—')}</td>
        <td><button type="button" data-order-index="${index}">Άνοιγμα</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p>Δεν βρέθηκαν παραγγελίες για το είδος στο επιλεγμένο διάστημα.</p>'}`);
  root.querySelectorAll('[data-order-index]').forEach(button=>button.onclick=()=>{
    if(!d.isCurrent())return;
    closeModal();
    d.onOrders(orders[Number(button.dataset.orderIndex)].orderId);
  });
}
function openMenu(d,x,y){const m=ensureMenu();m.innerHTML=`<div class="title">${esc(d.name)}</div><button data-a="edit">✎ Διόρθωση είδους</button><div class="sub"><button>▤ Εκτυπώσεις <span>▶</span></button><div class="submenu"><button data-a="barcode">Ετικέτα barcode</button><button data-a="barcodes">Ετικέτες barcode (επιλεγμένα)</button><button data-a="comment">Ετικέτα σχολίων</button><button data-a="comments">Ετικέτες σχολίων (επιλεγμένα)</button><button data-a="a4">Φυλλάδιο A4</button><button data-a="a5">Φυλλάδιο A5</button><button data-a="a6">Φυλλάδιο A6</button></div></div><div class="sub"><button>⚙ Διαχείριση είδους <span>▶</span></button><div class="submenu"><button data-a="edit-barcodes">Εναλλακτικοί κωδικοί Barcode</button><button data-a="edit-suppliers">Κωδικοί τιμολογίων / προμηθευτών</button><button data-a="markup">Επαναϋπολογισμός Markup</button><button data-a="edit-active">Ενεργοποίηση / απενεργοποίηση</button></div></div><button data-a="price">€ Αλλαγή λιανικής</button><button data-a="wholesale">€ Τιμή χονδρικής ανά πελάτη</button><button data-a="stock">▣ Διόρθωση αποθήκης (απογραφή)</button><button data-a="destroy">⊘ Καταστροφή ποσότητας</button><button data-a="supplier-return">↩ Δελτίο Αποστολής Επιστροφής</button><button data-a="movements">☷ Κινήσεις είδους</button><button data-a="purchases">⌕ Ιστορικό αγορών είδους</button><button data-a="history">↕ Ιστορικό αλλαγών τιμής</button><button data-a="delivery">▣ e‑Delivery</button><button data-a="orders">🛒 Παραγγελία / Αγορές</button><div class="sub"><button>▼ Εξαγωγή εγγραφών <span>▶</span></button><div class="submenu"><button data-a="exportrow">Τρέχον είδος CSV</button><button data-a="export-movements">Κινήσεις είδους</button><button data-a="export-purchases">Αγορές είδους</button><button data-a="export-history">Αλλαγές τιμών</button></div></div>`;
m.querySelectorAll('.sub > button').forEach(button=>{
  button.setAttribute('aria-expanded','false');
  button.onclick=()=>{
    const isOpen=button.parentElement.classList.contains('open');
    m.querySelectorAll('.sub.open').forEach(item=>{
      item.classList.remove('open');
      item.firstElementChild.setAttribute('aria-expanded','false');
    });
    if(!isOpen){
      button.parentElement.classList.add('open');
      button.setAttribute('aria-expanded','true');
    }
    m.style.top=`${Math.max(6,Math.min(y,innerHeight-m.offsetHeight-6))}px`;
  };
});
m.querySelectorAll('[data-a]').forEach(b=>{
  const edits = ['edit','edit-barcodes','edit-suppliers','edit-active'];
  const writes = ['price','wholesale','markup','stock','destroy','supplier-return','delivery','orders'];
  b.disabled = d.readOnly && (writes.includes(b.dataset.a) || (edits.includes(b.dataset.a) && !d.staffCardEdit));
  b.onclick=async e=>{e.stopPropagation();closeMenu();const a=b.dataset.a;try{if(!d.isCurrent())return;if(a==='edit'||a==='edit-active')d.onEdit('basic');else if(a==='edit-barcodes')d.onEdit('barcodes');else if(a==='edit-suppliers')d.onEdit('suppliers');else if(a==='price'||a==='markup')priceModal(d,a==='markup');else if(a==='wholesale')await wholesaleModal(d);else if(a==='stock')stockModal(d);else if(a==='destroy')destructionModal(d);else if(a==='supplier-return')await supplierReturnModal(d);else if(a==='movements'||a==='export-movements')await movementModal(d,a==='export-movements');else if(a==='purchases'||a==='export-purchases')await purchasesModal(d,a==='export-purchases');else if(a==='history'||a==='export-history')await priceHistoryModal(d,a==='export-history');else if(a==='delivery')d.onDelivery();else if(a==='orders')await ordersModal(d);else if(a==='barcode'||a==='comment')printInventoryRows([d],{comments:a==='comment'});else if(a==='a4'||a==='a5'||a==='a6')printInventoryRows([d],{size:a.toUpperCase(),labels:false});else if(a==='barcodes'||a==='comments'){const rows=selectedRows(d);printInventoryRows(rows.length?rows:[d],{comments:a==='comments'})}else if(a==='exportrow')csvDownload(`eidos-${d.sku||d.productId}.csv`,['Κωδικός','Barcode','Περιγραφή','Κατηγορία','Υποκατηγορία','ΦΠΑ','Λιανική','Απόθεμα','Τελ. αγορά','Προμηθευτής'],[[d.sku,d.barcode,d.name,d.category,d.subcategory,d.vat,d.salePrice,d.stock,d.lastPurchase,d.supplier]])}catch(err){alert(err.message)}}});m.hidden=false;const r=m.getBoundingClientRect();m.style.left=`${Math.max(6,Math.min(x,innerWidth-r.width-6))}px`;m.style.top=`${Math.max(6,Math.min(y,innerHeight-r.height-6))}px`}
function mount(){ensureStyle();document.addEventListener('contextmenu',e=>{const row=e.target.closest?.('.ia-row.data');const data=rowData(row);if(!data)return;e.preventDefault();e.stopImmediatePropagation();if(data.isCurrent()){row.click();openMenu(data,e.clientX,e.clientY)}},true);document.addEventListener('pointerdown',e=>{const row=e.target.closest?.('.ia-row.data');const data=rowData(row);if(!data||e.pointerType==='mouse')return;longStart={x:e.clientX,y:e.clientY,row};clearTimeout(longTimer);longTimer=setTimeout(()=>{if(data.isCurrent()){row.click();openMenu(data,e.clientX,e.clientY)}},650)},true);document.addEventListener('pointermove',e=>{if(longStart&&Math.hypot(e.clientX-longStart.x,e.clientY-longStart.y)>12){clearTimeout(longTimer);longStart=null}},true);document.addEventListener('pointerup',()=>{clearTimeout(longTimer);longStart=null},true);document.addEventListener('pointercancel',()=>{clearTimeout(longTimer);longStart=null},true);document.addEventListener('pointerdown',e=>{if(menu&&!menu.hidden&&!menu.contains(e.target))closeMenu()},true);document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();closeModal()}});window.addEventListener('scroll',event=>{if(!menu?.contains(event.target))closeMenu()},true)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
