// Profiles are starting suggestions, never authorization ceilings or an
// implicit grant. Only the explicit persisted store capabilities authorize.
export const staffProfiles=Object.freeze({
  MANAGER:{label:'Υπεύθυνος',capabilities:['inventory.read','inventory.count','cash.read']},
  STOCKTAKER:{label:'Απογραφέας',capabilities:['inventory.read','inventory.count']},
  AUDITOR:{label:'Ελεγκτής',capabilities:['cash.read']}
});
export const staffCapabilities=Object.freeze(['inventory.read','inventory.count','inventory.create','inventory.finalize','inventory.clear','inventory.bulk-zero','inventory.delete','cash.read','products.read','products.create','products.opening-stock','sales.read','invoices.read','invoices.edit','invoices.approve','payments.read','payments.supplier','payments.expense','payments.cash','sales.cancel','shifts.close']);
export const staffPermissionSections=Object.freeze([
  {key:'invoices',label:'Τιμολόγια',actions:[
    {key:'invoices.read',label:'Προβολή και εξαγωγή παραστατικών',description:'Βλέπει τη θυρίδα, τα πρωτότυπα και τις αγορές του καταστήματος.'},
    {key:'invoices.edit',label:'Επεξεργασία πρόχειρου τιμολογίου',description:'Διορθώνει στοιχεία και γραμμές ανοικτού πρόχειρου, με υπάρχοντα είδη. Δεν αλλάζει καταχωρισμένη αγορά ή καρτέλα προϊόντος.',requires:['invoices.read']},
    {key:'invoices.approve',label:'Έγκριση και καταχώριση τιμολογίου',description:'Οριστικοποιεί ελεγμένη αγορά και ενημερώνει απόθεμα με τους υπάρχοντες ελέγχους. Δεν παρακάμπτει διαφορά συνόλων.',requires:['invoices.read']}
  ]},
  {key:'sales',label:'Πωλήσεις και βάρδιες',actions:[
    {key:'sales.read',label:'Προβολή πωλήσεων και ταμείων',description:'Βλέπει πωλήσεις, κινήσεις και υπόλοιπα βαρδιών του καταστήματος.'},
    {key:'sales.cancel',label:'Ακύρωση πώλησης τρέχουσας βάρδιας',description:'Ακυρώνει μη φορολογική πώληση στην ίδια ανοικτή βάρδια, με αιτιολογία και αντίστροφη εγγραφή. Δεν επιτρέπει επιστροφή ή ακύρωση φορολογικής απόδειξης.',requires:['sales.read']},
    {key:'shifts.close',label:'Κλείσιμο βάρδιας με καταμέτρηση',description:'Κλείνει βάρδια του επιλεγμένου ταμείου με πραγματική καταμέτρηση, EFTPOS και καταγραφή διαφορών. Δεν επιτρέπει διοικητικό κλείσιμο χωρίς καταμέτρηση.',requires:['sales.read']}
  ]},
  {key:'payments',label:'Πληρωμές',actions:[
    {key:'payments.read',label:'Προβολή στοιχείων πληρωμών',description:'Βλέπει προμηθευτές και διαθέσιμα παραστατικά του επιλεγμένου καταστήματος.',requires:['sales.read']},
    {key:'payments.supplier',label:'Καταχώριση πληρωμής προμηθευτή',description:'Πληρωμή ανοικτών τιμολογίων ή έναντι με αποδεικτικό ή ρητή δήλωση. Παραμένει προς έλεγχο ιδιοκτήτη.',requires:['payments.read','sales.read']},
    {key:'payments.expense',label:'Καταχώριση εξόδου',description:'Καταχωρίζει θετικό έξοδο με αιτιολογία και παραστατικό ή δήλωση. Παραμένει προς έλεγχο ιδιοκτήτη.',requires:['payments.read','sales.read']},
    {key:'payments.cash',label:'Πληρωμή από μετρητά βάρδιας',description:'Επιτρέπει αφαίρεση της πληρωμής από την ανοικτή βάρδια του επιλεγμένου ταμείου.',requires:['payments.read','sales.read']}
  ]},
  {key:'products',label:'Είδη και αποθήκη',actions:[
    {key:'products.read',label:'Προβολή ειδών',description:'Βλέπει είδη, τιμές, κόστος και απόθεμα του καταστήματος.'},
    {key:'products.create',label:'Νέο είδος',description:'Δημιουργεί πλήρη καρτέλα στο επιλεγμένο κατάστημα.',requires:['products.read']},
    {key:'products.opening-stock',label:'Αρχικό απόθεμα νέου είδους',description:'Καταχωρίζει αρχικό απόθεμα κατά τη δημιουργία είδους.',requires:['products.read','products.create']}
  ]},
  {key:'inventory',label:'Απογραφή',actions:[
    {key:'inventory.read',label:'Προβολή',description:'Βλέπει τις ανοιχτές απογραφές του καταστήματος.'},
    {key:'inventory.count',label:'Καταμέτρηση',description:'Καταχωρίζει ποσότητες σε ανοιχτή απογραφή.',requires:['inventory.read']},
    {key:'inventory.clear',label:'Διαγραφή μέτρησης',description:'Αφαιρεί καταμέτρηση γραμμής ανοικτής απογραφής, χωρίς αλλαγή αποθέματος.',requires:['inventory.read']},
    {key:'inventory.bulk-zero',label:'Μηδενισμός επιλεγμένων μετρήσεων',description:'Καταχωρίζει ποσότητα μηδέν μόνο στις επιλεγμένες γραμμές ανοικτής απογραφής.',requires:['inventory.read']},
    {key:'inventory.delete',label:'Διαγραφή πρόχειρης απογραφής',description:'Διαγράφει μη οριστικοποιημένη απογραφή μετά από επιβεβαίωση.',requires:['inventory.read']},
    {key:'inventory.create',label:'Νέα απογραφή',description:'Ανοίγει νέα απογραφή στο κατάστημα.',requires:['inventory.read']},
    {key:'inventory.finalize',label:'Οριστικοποίηση και ενημέρωση αποθέματος',description:'Ολοκληρώνει ελεγμένη απογραφή και ενημερώνει τα αποθέματα. Απαιτεί αιτιολογία και επιβεβαίωση.',requires:['inventory.read']}
  ]},
  {key:'cash',label:'Έλεγχος ταμείων',actions:[
    {key:'cash.read',label:'Προβολή αναφοράς',description:'Βλέπει την αναφορά ελέγχου του καταστήματος.'}
  ]}
]);
export function validStaffCapabilities(capabilities){
  return Array.isArray(capabilities)&&new Set(capabilities).size===capabilities.length&&
    capabilities.every(c=>staffCapabilities.includes(c))&&
    staffPermissionSections.every(section=>section.actions.every(action=>!capabilities.includes(action.key)||(action.requires||[]).every(c=>capabilities.includes(c))));
}
export function changeStaffCapability(capabilities,key,enabled){
  if(!staffCapabilities.includes(key))return [...capabilities];
  const next=new Set(capabilities);enabled?next.add(key):next.delete(key);
  const actions=staffPermissionSections.flatMap(section=>section.actions);
  let changed=true;
  while(changed){changed=false;for(const action of actions){
    if(!next.has(action.key))continue;
    for(const dependency of action.requires||[])if(!next.has(dependency)){
      enabled?next.add(dependency):next.delete(action.key);changed=true;
    }
  }}
  return [...next];
}
export function staffRequestCapability(method,path,body={}){
  if(method==='GET'&&/^\/api\/backoffice-staff\/sales\/stores\/[^/]+\/terminals$/.test(path))return 'sales.read';
  if(method==='GET'&&/^\/api\/backoffice-staff\/payments\/stores\/[^/]+$/.test(path))return 'payments.read';
  if(method==='GET'&&/^\/api\/transactions\/stores\/[^/]+\/supplier-open-invoices$/.test(path))return 'payments.supplier';
  if(method==='POST'&&/^\/api\/transactions\/stores\/[^/]+\/supplier-settlements$/.test(path))return 'payments.supplier';
  if(method==='POST'&&/^\/api\/transactions\/stores\/[^/]+$/.test(path)&&body.type==='OTHER_EXPENSE'&&!body.deferredInvoice&&Number(body.amount)>0&&['DOCUMENT','NO_DOCUMENT'].includes(body.evidenceMode))return 'payments.expense';
  if(method==='POST'&&/^\/api\/store-pos\/stores\/[^/]+\/sales\/[^/]+\/reverse$/.test(path)&&body.kind==='CANCEL')return 'sales.cancel';
  if(method==='POST'&&/^\/api\/cash\/sessions\/[^/]+\/close$/.test(path))return 'shifts.close';
  if(method==='GET'&&(path==='/api/purchase-orders/report'||/^\/api\/purchase-orders\/[^/]+\/detail$/.test(path)))return 'invoices.read';
  if(method==='GET'&&/^\/api\/commerce\/purchase-orders\/[^/]+\/ocr-lines\/[^/]+\/catalog-matches$/.test(path))return 'invoices.edit';
  if(method==='PATCH'&&/^\/api\/purchase-orders\/[^/]+$/.test(path))return ['FINAL','INVOICED'].includes(body.status)?'invoices.approve':body.status===undefined?'invoices.edit':null;
  if(['PATCH','DELETE'].includes(method)&&/^\/api\/purchase-orders\/[^/]+\/lines\/[^/]+$/.test(path))return 'invoices.edit';
  if(method==='DELETE'&&/^\/api\/inventory-v2\/stocktakes\/[^/]+\/count\/[^/]+$/.test(path))return 'inventory.clear';
  if(method==='POST'&&/^\/api\/inventory-v2\/stocktakes\/[^/]+\/count\/bulk-zero$/.test(path))return 'inventory.bulk-zero';
  if(method==='DELETE'&&/^\/api\/inventory-v2\/stocktakes\/[^/]+$/.test(path))return 'inventory.delete';
  if(method==='POST'&&path==='/api/inventory-v2/stocktakes')return 'inventory.create';
  if(method==='POST'&&/^\/api\/inventory-v2\/stocktakes\/[^/]+\/finalize$/.test(path))return 'inventory.finalize';
  if(method==='GET'&&(path==='/api/commerce/documents/inbox/archive'||/^\/api\/commerce\/documents\/inbox\/[^/]+\/file$/.test(path)))return 'invoices.read';
  if(method==='GET'&&/^\/api\/(?:transactions|cash)\/stores\/[^/]+\/overview$/.test(path))return 'sales.read';
  if(method==='GET'&&/^\/api\/store-pos\/stores\/[^/]+\/sales\/recent$/.test(path))return 'sales.read';
  if(method==='GET'&&path==='/api/inventory-archive')return 'products.read';
  if(method==='GET'&&path==='/api/owner-products/new-card/options')return 'products.create';
  if(method==='POST'&&path==='/api/owner-products/new-card')return 'products.create';
  if(method==='GET'&&path==='/api/backoffice-staff/me')return 'SESSION';
  if(method==='POST'&&['/api/auth/logout','/api/auth/renew','/api/auth/change-password'].includes(path))return 'SESSION';
  if(method==='GET'&&/^\/api\/lifecycle\/stores\/[^/]+$/.test(path))return 'LIFECYCLE';
  if(method==='GET'&&/^\/api\/backoffice-staff\/cash\/stores\/[^/]+$/.test(path))return 'cash.read';
  if(method==='GET'&&/^\/api\/backoffice-staff\/inventory\/stores\/[^/]+\/stocktakes(?:\/[^/]+)?$/.test(path))return 'inventory.read';
  if(method==='POST'&&/^\/api\/inventory-v2\/stocktakes\/[^/]+\/count$/.test(path))return 'inventory.count';
  return null;
}
