'use strict';
// This console exists only in the isolated runtime. Every business operation
// still goes through the actual server authorization and explicit store scope.
const $ = id => document.getElementById(id);
const names = {INVOICE:'Εικονικό τιμολόγιο',DELIVERY_NOTE:'Εικονικό δελτίο αποστολής',INVOICE_DELIVERY:'Εικονικό τιμολόγιο – δελτίο',CREDIT_NOTE:'Εικονικό πιστωτικό',RETURN_NOTE:'Εικονικό επιστροφή',CASH:'Εικονικά μετρητά',BANK:'Εικονική τράπεζα',CARD:'Εικονική κάρτα'};
const state = {meta:null,storeId:'',owner:null,token:null,products:[],customers:[],orders:[],ledger:null,cart:[],quote:null,pending:null,last:null,busy:false,generation:0};
const euro = value => {const number=Number(value);return Number.isFinite(number)?number.toLocaleString('el-GR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €':'—'};
const timestamp = value => {const date=new Date(value);return Number.isNaN(date.valueOf())?'—':date.toLocaleString('el-GR')};
const el = (tag,text,className) => {const node=document.createElement(tag);if(text!=null)node.textContent=String(text);if(className)node.className=className;return node};
const currentToken = () => localStorage.getItem('token');
const uuid = () => crypto.randomUUID();
const message = (text,error=false) => {$('message').textContent=text;$('message').classList.toggle('error',error)};
const tell = error => message(error?.message||'Η ενέργεια δεν ολοκληρώθηκε.',true);
function assertIdentity(token=state.token) {
  let user,support;try{user=JSON.parse(localStorage.getItem('user')||'null');support=JSON.parse(localStorage.getItem('supportContext')||'null')}catch{}
  if(!token||currentToken()!==token||!state.owner||user?.id!==state.owner.id||user?.role!=='OWNER'||support||sessionStorage.getItem('platformToken'))throw Object.assign(Error('Η σύνδεση άλλαξε. Επέστρεψε στον αρχικό δοκιμαστικό διαχειριστή.'),{status:401,identityChanged:true});
}
async function request(path,{body,method='GET',auth=true,binary=false,token=state.token}={}) {
  if(auth)assertIdentity(token);
  const headers={};if(auth)headers.Authorization='Bearer '+token;if(body!==undefined)headers['Content-Type']='application/json';
  let response;try{response=await fetch(path,{method,headers,body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body),cache:'no-store',credentials:'same-origin'})}catch{throw Error('Η σύνδεση διακόπηκε. Η έκβαση χρειάζεται επιβεβαίωση.')}
  if(auth)assertIdentity(token);
  if(binary&&response.ok)return response.blob();
  let data;try{data=await response.json()}catch{throw Object.assign(Error('Η απάντηση του εργαστηρίου δεν επιβεβαιώθηκε.'),{status:response.ok?502:response.status})}
  if(!response.ok)throw Object.assign(Error(data.error||data.message||'Σφάλμα '+response.status),{status:response.status,code:data.code});
  return data;
}
function empty(node,text='Δεν υπάρχουν καταχωρίσεις.') {node.replaceChildren(el('p',text,'empty'))}
function table(node,headers,rows) {
  if(!rows.length){empty(node);return}
  const root=el('table'),head=el('thead'),headRow=el('tr'),body=el('tbody');
  headers.forEach(name=>headRow.append(el('th',name)));head.append(headRow);root.append(head,body);
  for(const row of rows){const tr=el('tr');for(const value of row){const td=el('td');td.append(value instanceof Node?value:document.createTextNode(value==null?'—':String(value)));tr.append(td)}body.append(tr)}
  node.replaceChildren(root);
}
function optionList(node,rows,placeholder,selected='') {
  node.replaceChildren(new Option(placeholder,''));
  rows.forEach(row=>node.append(new Option(row.label??row.name??row.id,row.id)));
  node.value=rows.some(row=>row.id===selected)?selected:'';
}
function action(label,callback,{danger=false,testId}={}) {
  const button=el('button',label,'compact '+(danger?'danger':'secondary'));button.type='button';button.disabled=state.busy||Boolean(state.pending);if(testId)button.dataset.testid=testId;
  button.addEventListener('click',()=>Promise.resolve().then(callback).catch(tell));return button;
}
function applyLocks() {
  const locked=state.busy||Boolean(state.pending);
  document.querySelectorAll('button,input,select,textarea').forEach(node=>{node.disabled=locked});
  $('retry').disabled=state.busy||!state.pending||currentToken()!==state.pending.token;
  $('pending').hidden=!state.pending;
  $('pending-key').textContent=state.pending?'Κλειδί αιτήματος: '+state.pending.key:'';
  $('quote').disabled=locked||!state.cart.length||!$('customer').value;
  $('add-product').disabled=locked||!$('product').value;
  $('issue-document').disabled=locked||!$('document-order').value;
  $('replay').hidden=!state.last||Boolean(state.pending);
  $('replay').disabled=locked||Boolean(state.cart.length);
  for(const id of ['owner-app','actual-app'])$(id).setAttribute('aria-disabled',String(locked));
}
async function work(callback) {
  if(state.busy||state.pending)return;
  state.busy=true;applyLocks();
  try{return await callback()}catch(error){tell(error)}finally{state.busy=false;applyLocks()}
}
function clearQuote(){state.quote=null;$('quote-result').hidden=true;$('quote-result').replaceChildren()}
function renderCart() {
  const node=$('cart');node.replaceChildren();
  if(!state.cart.length){empty(node,'Πρόσθεσε τα είδη και όρισε τις ποσότητες.');applyLocks();return}
  state.cart.forEach(item=>{
    const row=el('div',null,'cart-row'),label=el('label','Ποσότητα'),input=el('input');input.value=item.quantity;input.inputMode='decimal';input.setAttribute('aria-label','Ποσότητα · '+item.name);input.dataset.productId=item.productId;
    input.addEventListener('input',()=>{item.quantity=input.value;clearQuote()});label.append(input);
    row.append(el('span',item.name+' · '+item.unit),label,action('Αφαίρεση',()=>{state.cart=state.cart.filter(other=>other!==item);clearQuote();renderCart()}));node.append(row);
  });applyLocks();
}
const validQuantity = value => /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value)&&Number(value)>0&&Number(value)<=1000000;
function quoteInput() {
  if(!state.storeId||!$('customer').value||!state.cart.length||state.cart.some(row=>!validQuantity(row.quantity)))throw Error('Επίλεξε κατάστημα και πελάτη και βάλε θετικές ποσότητες με τελεία και έως 4 δεκαδικά.');
  return {storeId:state.storeId,customerId:$('customer').value,items:state.cart.map(({productId,quantity})=>({productId,quantity}))};
}
function renderQuote(quote) {
  const node=$('quote-result'),box=el('div',null,'quote-summary'),grid=el('div',null,'table-scroll');
  box.append(el('h3','Υπολογισμός · '+quote.customerName));
  table(grid,['Είδος','Ποσότητα','Καθαρή αξία','ΦΠΑ','Σύνολο'],(quote.items||[]).map(item=>[item.name,item.quantity+' '+item.unit,euro(item.netTotal),euro(item.vatTotal),euro(item.grossTotal)]));
  const totals=el('div',null,'totals');totals.append(el('span','Καθαρή '+euro(quote.totals.net)),el('span','ΦΠΑ '+euro(quote.totals.vat)),el('strong','Σύνολο '+euro(quote.totals.gross)));
  const send=action('Υποβολή προς έγκριση',()=>work(async()=>{
    const body={...quoteInput(),quoteId:quote.quoteId,clientOrderId:uuid(),notes:$('notes').value};
    await mutate('/api/wholesale/orders',body,'Υποβολή παραγγελίας',data=>{
      if(data.status!=='SUBMITTED'||data.order?.clientOrderId!==body.clientOrderId||data.order?.storeId!==body.storeId||data.order?.customerId!==body.customerId)throw Error('Η παραγγελία χρειάζεται επιβεβαίωση.');
      state.cart=[];clearQuote();renderCart();$('notes').value='';return 'Υποβλήθηκε προς έγκριση: '+data.orderId;
    });
  }),{testId:'submit-order'});send.className='';box.append(grid,totals,el('p','Χωρίς δέσμευση αποθέματος, είσπραξη ή πραγματική τιμολόγηση.','muted'),send);node.replaceChildren(box);node.hidden=false;applyLocks();
}
async function readSnapshot(token=state.token,storeId=state.storeId) {
  const query=new URLSearchParams({storeId});
  const [ledger,orders]=await Promise.all([request('/api/lab/state?'+query,{token}),request('/api/wholesale/orders?'+query+'&pageSize=100',{token})]);
  if(ledger.testOnly!==true)throw Error('Δεν επιβεβαιώθηκε η απομόνωση του εικονικού καθολικού.');
  return {ledger,orders:orders.items||[],at:new Date().toISOString(),storeId};
}
function snapshotValues(snapshot) {
  const entries=[['Παραγγελίες',snapshot.orders.length],['Παραστατικά',(snapshot.ledger.documents||[]).length],['Πληρωμές',(snapshot.ledger.payments||[]).length],['Κινήσεις audit',(snapshot.ledger.events||[]).length]];
  (snapshot.ledger.stock||[]).forEach(row=>entries.push(['Απόθεμα · '+(row.name||productName(row.productId)),row.quantity]));
  (snapshot.ledger.receivables||[]).forEach(row=>entries.push(['Απαίτηση · '+(row.name||customerName(row.customerId)),row.balance]));
  return new Map(entries.map(([key,value])=>[key,String(value)]));
}
function renderComparison(before,after,label) {
  const old=snapshotValues(before),next=snapshotValues(after),keys=[...new Set([...old.keys(),...next.keys()])];
  table($('comparison'),['Μέτρηση','Πριν','Μετά'],keys.map(key=>[key,old.get(key)??'—',next.get(key)??'—']));
  $('comparison-note').textContent=label+' · '+timestamp(before.at)+' → '+timestamp(after.at)+' · κατάστημα '+after.storeId+'. Ποσά σε ευρώ, απόθεμα σε βασική μονάδα.';
}
async function mutate(path,body,label,accepted) {
  assertIdentity();const token=state.token,storeId=state.storeId;
  const before=await readSnapshot(token,storeId);
  state.pending={path,body:JSON.stringify(body),key:body.requestId||body.clientOrderId,label,accepted,before,token,storeId,uncertain:false};applyLocks();
  await sendPending();
}
async function sendPending() {
  const pending=state.pending;if(!pending)return;assertIdentity(pending.token);
  let data;
  try{data=await request(pending.path,{method:'POST',body:pending.body,token:pending.token});
    const detail=pending.accepted?.(data)||pending.label+' ολοκληρώθηκε.';
    // A malformed successful response remains uncertain: never release its key.
    state.last={...pending};state.pending=null;
    message(detail+(data.replayed?' · Ίδιο αίτημα: δεν δημιουργήθηκε δεύτερη κίνηση.':''));
  }catch(error){
    if(error.status>=400&&error.status<500&&!error.identityChanged&&!pending.uncertain){state.pending=null;clearQuote();message(error.message,true)}
    else {pending.uncertain=true;message('Η έκβαση δεν έχει επιβεβαιωθεί. Χρησιμοποίησε μόνο «Επιβεβαίωση ίδιου αιτήματος» με τον αρχικό λογαριασμό.',true)}
    return;
  }
  try{const after=await readSnapshot(pending.token,pending.storeId);if(state.storeId!==pending.storeId)return;renderSnapshot(after);renderComparison(pending.before,after,pending.label)}
  catch(error){message('Η ενέργεια επιβεβαιώθηκε, αλλά τα στοιχεία μετά την ενέργεια δεν ανανεώθηκαν: '+error.message,true)}
}
function productName(id){return state.products.find(row=>row.id===id)?.name||state.meta?.products?.find(row=>row.id===id)?.name||id}
function customerName(id){return state.customers.find(row=>row.id===id)?.name||id}
function renderReferences() {
  const type=$('document-type').value,orderId=$('document-order').value,needsReference=['CREDIT_NOTE','RETURN_NOTE'].includes(type),old=$('reference').value;
  $('reference-wrap').hidden=!needsReference;$('reference').required=needsReference;
  const allowed=type==='CREDIT_NOTE'?['INVOICE','INVOICE_DELIVERY']:['DELIVERY_NOTE','INVOICE_DELIVERY'];
  optionList($('reference'),(state.ledger?.documents||[]).filter(doc=>doc.orderId===orderId&&doc.status!=='CANCELLED'&&allowed.includes(doc.type)).map(doc=>({id:doc.id,label:doc.number||doc.id})),'Επίλεξε αρχικό παραστατικό',old);
}
async function downloadPdf(doc) {
  assertIdentity();const blob=await request('/api/lab/documents/'+encodeURIComponent(doc.id)+'/pdf?'+new URLSearchParams({storeId:state.storeId}),{binary:true});
  if(blob.type&&!blob.type.includes('pdf'))throw Error('Η απάντηση δεν είναι PDF.');
  const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download='TEST-'+String(doc.number||doc.id).replace(/[^A-Za-z0-9_-]/g,'_')+'.pdf';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function renderSnapshot(snapshot) {
  state.ledger=snapshot.ledger;state.orders=snapshot.orders;
  const ledger=state.ledger,docs=ledger.documents||[],payments=ledger.payments||[];
  const metrics=[['Παραγγελίες προς έγκριση',state.orders.length],['Εικονικά παραστατικά',docs.filter(doc=>doc.status!=='CANCELLED').length],['Εικονικές εισπράξεις',euro(payments.reduce((sum,row)=>sum+Number(row.amount||0),0))],['Εικονικές απαιτήσεις',euro((ledger.receivables||[]).reduce((sum,row)=>sum+Number(row.balance||0),0))]];
  $('metrics').replaceChildren(...metrics.map(([label,value])=>{const box=el('div',null,'metric');box.append(el('span',label),el('strong',value));return box}));
  const previousOrder=$('document-order').value;
  optionList($('document-order'),state.orders.filter(order=>order.status==='SUBMITTED').map(order=>({id:order.id,label:(order.snapshot?.customerName||customerName(order.customerId))+' · '+euro(order.grossTotal)+' · '+order.id.slice(0,8)})),'Επίλεξε υποβλημένη παραγγελία',previousOrder);
  optionList($('payment-invoice'),docs.filter(doc=>['INVOICE','INVOICE_DELIVERY'].includes(doc.type)&&doc.status!=='CANCELLED').map(doc=>({id:doc.id,label:(doc.number||doc.id)+' · '+euro(doc.grossTotal??doc.snapshot?.totals?.gross)})),'Επίλεξε τιμολόγιο',$('payment-invoice').value);
  table($('orders'),['Πελάτης','Κανάλι / κατάσταση','Σύνολο','Χρόνος','Αναγνωριστικό'],state.orders.map(order=>[order.snapshot?.customerName||customerName(order.customerId),(order.channel||'')+' / '+order.status,euro(order.grossTotal),timestamp(order.createdAt),el('code',order.id)]));
  table($('documents'),['Αριθμός / τύπος','Κατάσταση','Σύνολο','Παραγγελία','Ενέργειες'],docs.map(doc=>{
    const title=el('div');title.append(el('strong',doc.number||doc.id),el('div',names[doc.type]||doc.type,'small'));
    const actions=el('div',null,'actions');actions.append(action('PDF',()=>work(()=>downloadPdf(doc)),{testId:'pdf-'+doc.id}));
    if(doc.status!=='CANCELLED')actions.append(action('Ακύρωση',()=>work(()=>mutate('/api/lab/documents/'+encodeURIComponent(doc.id)+'/cancel',{storeId:state.storeId,requestId:uuid()},'Ακύρωση '+(doc.number||doc.id),data=>{if(data.document?.id!==doc.id||data.document?.status!=='CANCELLED')throw Error('Η ακύρωση δεν επιβεβαιώθηκε.');return 'Ακυρώθηκε το εικονικό '+(doc.number||doc.id)})),{danger:true,testId:'cancel-'+doc.id}));
    return [title,el('span',doc.status==='CANCELLED'?'Ακυρωμένο':doc.status||'Εκδόθηκε','status-tag '+(doc.status==='CANCELLED'?'cancelled':'')),euro(doc.grossTotal??doc.snapshot?.totals?.gross),el('code',doc.orderId),actions];
  }));
  table($('payments'),['Παραστατικό','Ποσό','Τρόπος'],payments.map(row=>[docs.find(doc=>doc.id===row.invoiceId)?.number||row.invoiceId,euro(row.amount),names[row.method]||row.method]));
  table($('stock'),['Προϊόν','Εικονική ποσότητα'],(ledger.stock||[]).map(row=>[row.name||productName(row.productId),row.quantity]));
  table($('receivables'),['Πελάτης','Εικονικό υπόλοιπο'],(ledger.receivables||[]).map(row=>[row.name||customerName(row.customerId),euro(row.balance)]));
  table($('events'),['Χρόνος','Ενέργεια','Αναφορά','Στοιχεία'],[...(ledger.events||[])].sort((a,b)=>new Date(b.createdAt||b.at)-new Date(a.createdAt||a.at)).slice(0,30).map(row=>[timestamp(row.createdAt||row.at),row.kind||row.type||row.action||row.eventType,el('code',row.documentId||row.entityId||row.id),typeof row.details==='string'?row.details:JSON.stringify(row.details||row.payload||{})]));
  renderReferences();applyLocks();
}
async function refresh() {
  if(!state.owner||!state.storeId)return;const generation=++state.generation,storeId=state.storeId,token=state.token;
  const scope=new URLSearchParams({storeId});
  const [workspace,customers,products,snapshot]=await Promise.all([
    request('/api/wholesale/workspace?'+scope,{token}),request('/api/wholesale/customers',{token}),request('/api/wholesale/products?'+scope+'&pageSize=100',{token}),readSnapshot(token,storeId)
  ]);
  if(generation!==state.generation||storeId!==state.storeId)return;
  if(workspace.storeId!==storeId||workspace.user?.id!==state.owner.id||workspace.company?.id!==state.meta.companyId)throw Error('Δεν επιβεβαιώθηκε η προβολή του επιλεγμένου καταστήματος.');
  state.products=products.items||[];state.customers=(customers.items||[]).filter(customer=>customer.active);
  optionList($('customer'),state.customers,'Επίλεξε πελάτη',$('customer').value);
  optionList($('product'),state.products.map(product=>({...product,label:product.name+' · '+product.sku})),'Επίλεξε προϊόν');
  renderSnapshot(snapshot);renderCart();
}
function resetOwner() {
  state.generation++;state.owner=null;state.products=[];state.customers=[];state.orders=[];state.ledger=null;state.cart=[];clearQuote();$('console').hidden=true;$('owner-app').hidden=true;
  for(const id of ['metrics','orders','documents','payments','stock','receivables','events','comparison','cart'])$(id).replaceChildren();
  for(const id of ['customer','product','document-order','payment-invoice','reference'])$(id).replaceChildren();
}
async function enter(role) {
  await work(async()=>{
    const data=await request('/api/lab/session',{method:'POST',body:{role},auth:false});
    if(role==='customer'){
      if(data.targetUrl!=='/b2b/wholesale-lab')throw Error('Μη έγκυρη διαδρομή δοκιμαστικού πελάτη.');
      localStorage.removeItem('token');localStorage.removeItem('user');localStorage.removeItem('supportContext');sessionStorage.removeItem('platformToken');location.assign(data.targetUrl);return;
    }
    if(!data.token||!data.user?.id||data.user.company?.id&&data.user.company.id!==state.meta.companyId)throw Error('Δεν δημιουργήθηκε δοκιμαστική σύνδεση.');
    localStorage.setItem('token',data.token);localStorage.setItem('user',JSON.stringify(data.user));localStorage.removeItem('supportContext');sessionStorage.removeItem('platformToken');state.token=data.token;
    if(role!=='owner'){
      if(data.targetUrl!=='/wholesale?storeId='+state.meta.storeId)throw Error('Μη έγκυρη διαδρομή δοκιμαστικού πωλητή.');location.assign(data.targetUrl);return;
    }
    resetOwner();state.owner=data.user;state.token=data.token;$('identity').textContent=data.user.fullName+' · Δοκιμαστικός διαχειριστής';$('console').hidden=false;$('owner-app').hidden=false;
    await refresh();message('Ο δοκιμαστικός διαχειριστής είναι έτοιμος. Πρόσθεσε είδη ή άνοιξε την πλήρη εφαρμογή.');
  });
}
async function initialize() {
  try{
    const meta=await request('/api/lab/meta',{auth:false});
    if(meta.lab!==true||meta.testOnly!==true||meta.virtualOnly!==true||!Array.isArray(meta.stores)||!meta.companyId)throw Error('Δεν επιβεβαιώθηκε απομονωμένο δοκιμαστικό περιβάλλον.');
    state.meta=meta;state.storeId=meta.defaultStoreId||meta.storeId;
    if(!meta.stores.some(store=>store.id===state.storeId))throw Error('Το δοκιμαστικό κατάστημα δεν είναι διαθέσιμο.');
    optionList($('store'),meta.stores,'Επίλεξε κατάστημα',state.storeId);$('runtime-status').textContent='Ενεργό · μόνο εικονικά δεδομένα';$('revision').textContent='Έκδοση '+(meta.revision||'τοπική δοκιμή');
    $('actual-app').href='/wholesale?storeId='+encodeURIComponent(state.storeId);$('owner-app').href=$('actual-app').href;
    document.querySelectorAll('[data-role]').forEach(button=>button.addEventListener('click',()=>enter(button.dataset.role)));
    const token=currentToken();let user;try{user=JSON.parse(localStorage.getItem('user')||'null')}catch{}
    if(token&&user?.role==='OWNER'){
      state.token=token;state.owner=user;
      try{await refresh();$('identity').textContent=user.fullName+' · Δοκιμαστικός διαχειριστής';$('console').hidden=false;$('owner-app').hidden=false}catch{resetOwner();message('Η προηγούμενη σύνδεση δεν είναι ενεργή. Επίλεξε έναν δοκιμαστικό ρόλο.')}
    }
    applyLocks();
  }catch(error){$('runtime-status').textContent='Το εργαστήριο δεν είναι διαθέσιμο';tell(error);document.querySelectorAll('button,input,select,textarea').forEach(node=>{node.disabled=true})}
}
$('add-product').addEventListener('click',()=>{const product=state.products.find(row=>row.id===$('product').value);if(!product||state.pending||state.busy)return;if(state.cart.some(item=>item.productId===product.id)){message('Το είδος είναι ήδη στο καλάθι. Άλλαξε την ποσότητα στη γραμμή του.');return}state.cart.push({productId:product.id,name:product.name,unit:product.unit,quantity:'1'});clearQuote();renderCart()});
$('product').addEventListener('change',applyLocks);
$('customer').addEventListener('change',()=>{clearQuote();applyLocks()});
$('notes').addEventListener('input',clearQuote);
$('order-form').addEventListener('submit',event=>{event.preventDefault();work(async()=>{const input=quoteInput(),quote=await request('/api/wholesale/quotes',{method:'POST',body:input});if(!quote.quoteId||quote.storeId!==state.storeId||quote.customerId!==input.customerId)throw Error('Ο υπολογισμός δεν αντιστοιχεί στην επιλογή.');state.quote=quote;renderQuote(quote);message('Οι τιμές υπολογίστηκαν. Έλεγξε τα σύνολα πριν υποβάλεις.')})});
$('document-form').addEventListener('submit',event=>{event.preventDefault();work(async()=>{const body={storeId:state.storeId,orderId:$('document-order').value,type:$('document-type').value,requestId:uuid()};if(['CREDIT_NOTE','RETURN_NOTE'].includes(body.type)){if(!$('reference').value)throw Error('Επίλεξε αρχικό παραστατικό.');body.referenceId=$('reference').value}await mutate('/api/lab/documents',body,'Έκδοση '+names[body.type],data=>{if(!data.document?.id||data.document?.orderId!==body.orderId||data.document?.type!==body.type)throw Error('Το εικονικό παραστατικό δεν επιβεβαιώθηκε.');return 'Εκδόθηκε χωρίς φορολογική ισχύ: '+(data.document.number||data.document.id)})})});
$('document-type').addEventListener('change',renderReferences);$('document-order').addEventListener('change',()=>{renderReferences();applyLocks()});
$('payment-form').addEventListener('submit',event=>{event.preventDefault();work(async()=>{const amount=$('payment-amount').value;if(!/^\d+(?:\.\d{1,2})?$/.test(amount)||Number(amount)<=0)throw Error('Βάλε θετικό ποσό με τελεία και έως δύο δεκαδικά.');const body={storeId:state.storeId,invoiceId:$('payment-invoice').value,amount:Number(amount).toFixed(2),method:$('payment-method').value,requestId:uuid()};await mutate('/api/lab/payments',body,'Εικονική είσπραξη',data=>{if(!data.payment?.id||data.payment.invoiceId!==body.invoiceId)throw Error('Η εικονική πληρωμή δεν επιβεβαιώθηκε.');$('payment-amount').value='';return 'Καταχωρίστηκε εικονική είσπραξη '+euro(body.amount)})})});
$('store').addEventListener('change',()=>work(async()=>{
  const selected=$('store').value;state.generation++;state.storeId=selected;state.cart=[];state.products=[];state.orders=[];state.ledger=null;state.last=null;clearQuote();renderCart();$('quote-result').hidden=true;
  for(const id of ['metrics','orders','documents','payments','stock','receivables','events','comparison'])$(id).replaceChildren();
  optionList($('customer'),[],'Επίλεξε πελάτη');optionList($('product'),[],'Επίλεξε προϊόν');optionList($('document-order'),[],'Επίλεξε παραγγελία');optionList($('payment-invoice'),[],'Επίλεξε τιμολόγιο');
  $('actual-app').href=selected?'/wholesale?storeId='+encodeURIComponent(selected):'/lab';
  if(!selected){message('Επίλεξε ρητά κατάστημα για να εμφανιστούν τα στοιχεία.');return}
  if(!state.meta.stores.some(store=>store.id===selected))throw Error('Το κατάστημα δεν είναι διαθέσιμο.');await refresh();message('Εμφανίζονται μόνο τα στοιχεία του επιλεγμένου καταστήματος.');
}));
$('refresh').addEventListener('click',()=>work(refresh));
$('retry').addEventListener('click',async()=>{if(state.busy||!state.pending)return;state.busy=true;applyLocks();try{await sendPending()}catch(error){tell(error)}finally{state.busy=false;applyLocks()}});
$('replay').addEventListener('click',()=>work(async()=>{if(!state.last||state.last.storeId!==state.storeId)return;assertIdentity(state.last.token);state.pending={...state.last,before:await readSnapshot()};applyLocks();await sendPending()}));
for(const id of ['owner-app','actual-app'])$(id).addEventListener('click',event=>{if(state.pending||state.busy){event.preventDefault();message('Ολοκλήρωσε την τρέχουσα ενέργεια πριν αλλάξεις οθόνη.',true)}});
window.addEventListener('storage',event=>{if(['token','user','supportContext',null].includes(event.key)){if(state.pending){message('Η σύνδεση άλλαξε. Το αρχικό αίτημα παραμένει κλειδωμένο μέχρι να επανέλθει ο ίδιος λογαριασμός.',true);applyLocks()}else{resetOwner();$('identity').textContent='Η σύνδεση άλλαξε. Επίλεξε δοκιμαστικό ρόλο.'}}});
window.addEventListener('beforeunload',event=>{if(state.pending){event.preventDefault();event.returnValue=''}});
initialize();
