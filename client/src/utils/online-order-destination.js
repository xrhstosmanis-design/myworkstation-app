export function onlineOrderDestination(order){
 return [order.building&&`Κτίριο / Πτέρυγα: ${order.building}`,order.floor&&`Όροφος: ${order.floor}`,order.department&&`Κλινική / Τμήμα: ${order.department}`,order.room&&`Δωμάτιο / Γραφείο: ${order.room}`].filter(Boolean).join(' · ')||String(order.location||'');
}
export function renderOnlineOrderPrint(doc,order){
 const money=v=>Number(v||0).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
 doc.title=String(order.orderNumber||'');
 const style=doc.createElement('style');style.textContent='body{font-family:Arial;padding:16px}p{white-space:pre-wrap;overflow-wrap:anywhere}.total{text-align:right}';doc.head.append(style);
 const nodes=[];const add=(tag,text)=>{const el=doc.createElement(tag);el.textContent=text;nodes.push(el);return el};
 add('h2',order.title||'MYWORKSTATION · ONLINE');add('h1',`#${order.orderNumber}`);
 add('p',`${order.customerName||''} · ${order.customerPhone||''}`);
 const destination=onlineOrderDestination(order);if(destination)add('p',destination);
 if(order.deliveryNotes)add('p',`Παρατηρήσεις: ${order.deliveryNotes}`);
 for(const item of order.items||[])add('p',`${item.quantity}× ${item.productName} · ${money(item.lineTotal)}`);
 add('h2',money(order.total)).className='total';doc.body.replaceChildren(...nodes);
}
