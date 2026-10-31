// Profiles are starting suggestions, never authorization ceilings or an
// implicit grant. Only the explicit persisted store capabilities authorize.
export const staffProfiles=Object.freeze({
  MANAGER:{label:'Υπεύθυνος',capabilities:['inventory.read','inventory.count','cash.read']},
  STOCKTAKER:{label:'Απογραφέας',capabilities:['inventory.read','inventory.count']},
  AUDITOR:{label:'Ελεγκτής',capabilities:['cash.read']}
});
export const staffCapabilities=Object.freeze(['inventory.read','inventory.count','inventory.create','inventory.finalize','cash.read','products.read','products.create','products.opening-stock','sales.read','invoices.read']);
export const staffPermissionSections=Object.freeze([
  {key:'invoices',label:'Τιμολόγια',actions:[
    {key:'invoices.read',label:'Προβολή και εξαγωγή παραστατικών',description:'Βλέπει τη θυρίδα και τα πρωτότυπα του καταστήματος και εξάγει αναφορές. Δεν αλλάζει, διαγράφει ή εγκρίνει παραστατικά.'}
  ]},
  {key:'sales',label:'Πωλήσεις και βάρδιες',actions:[
    {key:'sales.read',label:'Προβολή πωλήσεων και ταμείων',description:'Βλέπει τις πωλήσεις, κινήσεις και τα υπόλοιπα βαρδιών του καταστήματος. Δεν καταχωρίζει πληρωμές ή κλείσιμο.'}
  ]},
  {key:'products',label:'Είδη και αποθήκη',actions:[
    {key:'products.read',label:'Προβολή ειδών',description:'Βλέπει είδη, τιμές, κόστος και απόθεμα του καταστήματος.'},
    {key:'products.create',label:'Νέο είδος',description:'Δημιουργεί πλήρη καρτέλα στο επιλεγμένο κατάστημα.',requires:['products.read']},
    {key:'products.opening-stock',label:'Αρχικό απόθεμα νέου είδους',description:'Καταχωρίζει αρχικό απόθεμα κατά τη δημιουργία είδους.',requires:['products.read','products.create']}
  ]},
  {key:'inventory',label:'Απογραφή',actions:[
    {key:'inventory.read',label:'Προβολή',description:'Βλέπει τις ανοιχτές απογραφές του καταστήματος.'},
    {key:'inventory.count',label:'Καταμέτρηση',description:'Καταχωρίζει ποσότητες σε ανοιχτή απογραφή.',requires:['inventory.read']},
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
export function staffRequestCapability(method,path){
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
