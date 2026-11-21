import {finalPassiveStoreActions,finalPassiveStoreRequest} from './backoffice-staff-final-passive.mjs';
import {storeReportCapabilities,storeReportNames,storeReportLabels,storeReportRequestCapability} from './backoffice-staff-reports.mjs';
import {expectedReceiptAction} from './supplier-expected-receipts.mjs';
// Profiles are starting suggestions, never authorization ceilings or an
// implicit grant. Only the explicit persisted store capabilities authorize.
export const staffProfiles=Object.freeze({
  MANAGER:{label:'Υπεύθυνος',capabilities:['inventory.read','inventory.count','cash.read']},
  STOCKTAKER:{label:'Απογραφέας',capabilities:['inventory.read','inventory.count']},
  AUDITOR:{label:'Ελεγκτής',capabilities:['cash.read']}
});
export const staffCapabilities=Object.freeze(['inventory.read','inventory.history.read','inventory.expected.read','inventory.count','inventory.create','inventory.finalize','inventory.clear','inventory.bulk-zero','inventory.delete','cash.read','products.read','products.edit','products.create','products.opening-stock','sales.read','invoices.read','invoices.edit','invoices.approve','invoices.reopen','invoices.cancel','payments.read','payments.supplier','payments.expense','payments.cash','sales.cancel','shifts.read','shifts.close','supplier-price-comparison.read','low-value-products.read','order-suggestions.read','analytics.read','handover.read','employees.read','schedule.read','attendance.read','leaves.read','leaves.approve','leaves.reject','stock.read','payroll.read','pending.read','promotions.read','baking.read','monthly-invoice-audit.read','online-orders.read','table-service.read','stock-transfers.read','invoice-ai.read','wholesale.read','video.read','printers.read','chat.read','radio.read','approvals.read','approvals.expense-confirm','monthly-inventory.read','workforce-roles.read','workforce-rules.read','workforce-rules.manage','shift-templates.read','shift-templates.manage','workforce-audit.read','unsold-products.read','sales-journal.read',...storeReportCapabilities,...finalPassiveStoreActions.map(action=>action.key)]);
export const staffPermissionSections=Object.freeze([
 {key:'final-passive',label:'Πρόσθετες παθητικές προβολές',actions:finalPassiveStoreActions.map(({modules,...action})=>action)},
 {key:'store-reports',label:'Αναφορές επιλεγμένου καταστήματος',actions:storeReportCapabilities.map((key,i)=>({key,label:storeReportLabels[i]+' καταστήματος',description:storeReportNames[i]==='payroll-expenses'?'Βλέπει ονόματα υπαλλήλων και συνδεδεμένες καταγεγραμμένες πληρωμές μόνο του επιλεγμένου καταστήματος, χωρίς απόδειξη εξόφλησης ή δεδουλευμένων.':'Βλέπει την αναφορά και τις διαθέσιμες οικονομικές αξίες μόνο του επιλεγμένου καταστήματος, χωρίς αλλαγές ή εξαγωγή.'}))},
 {key:'sales-extra',label:'Πρόσθετες προβολές πωλήσεων',actions:[
  {key:'unsold-products.read',label:'Προβολή απούλητων ειδών καταστήματος',description:'Βλέπει τα ενεργά απούλητα είδη του καταστήματος στο επιλεγμένο διάστημα, χωρίς κόστη ή αλλαγές.'},
  {key:'sales-journal.read',label:'Προβολή ημερολογίου πωλήσεων και οικονομικών στοιχείων',description:'Βλέπει έως 500 κινήσεις με ποσά, πελάτες, ιστορικό χειριστή, πληρωμές και γραμμές, χωρίς ακύρωση ή επιστροφές.'}
 ]},
  {key:'workforce-settings',label:'Προσωπικό καταστήματος',actions:[
    {key:'workforce-roles.read',label:'Προβολή σχετικών ρόλων καταστήματος',description:'Βλέπει μόνο ρόλους εργαζομένων και προτύπων του επιλεγμένου καταστήματος, με τοπικά πλήθη.'},
    {key:'workforce-rules.read',label:'Προβολή κανόνων προσωπικού καταστήματος',description:'Βλέπει κανόνες των ορατών εργαζομένων του καταστήματος, χωρίς αλλαγές.'},
    {key:'workforce-rules.manage',label:'Διαχείριση κανόνων προσωπικού',description:'Δημιουργεί, ενημερώνει και αλλάζει κατάσταση κανόνων εργαζομένων που ανήκουν αποκλειστικά στο επιλεγμένο κατάστημα.',requires:['workforce-rules.read']},
    {key:'shift-templates.read',label:'Προβολή προτύπων βαρδιών καταστήματος',description:'Βλέπει πρότυπα και πλήθη αναθέσεων μόνο του επιλεγμένου καταστήματος.'},
    {key:'shift-templates.manage',label:'Διαχείριση προτύπων βαρδιών',description:'Δημιουργεί, ενημερώνει και ενεργοποιεί ή απενεργοποιεί πρότυπα του επιλεγμένου καταστήματος.',requires:['shift-templates.read']},
    {key:'workforce-audit.read',label:'Προβολή ιστορικού προσωπικού καταστήματος',description:'Βλέπει έως 100 πρόσφατες περιγραφικές ενέργειες του καταστήματος, χωρίς εσωτερικά JSON ή στοιχεία πρόσβασης.'}
  ]},
  {key:'chat',label:'Chat καταστήματος',actions:[
    {key:'chat.read',label:'Προβολή μηνυμάτων Chat',description:'Βλέπει μηνύματα, θέματα, αναζήτηση και προεπισκόπηση συνημμένων του επιλεγμένου καταστήματος, χωρίς αποστολή, λήψη αρχείων ή αλλαγή κατάστασης.'}
  ]},
  {key:'radio',label:'Online Ράδιο',actions:[
    {key:'radio.read',label:'Προβολή κατάστασης ραδιοφώνου',description:'Βλέπει την κατάσταση και τα ονόματα επιτρεπόμενων σταθμών του επιλεγμένου καταστήματος, χωρίς αναπαραγωγή ή ρυθμίσεις.'}
  ]},
  {key:'approvals',label:'Εκκρεμείς επιβεβαιώσεις',actions:[
    {key:'approvals.expense-confirm',label:'Επιβεβαίωση λοιπών εξόδων',requires:['approvals.read']},
    {key:'approvals.read',label:'Προβολή εκκρεμών επιβεβαιώσεων',description:'Βλέπει εκκρεμείς πληρωμές προμηθευτών, έξοδα και τραπεζικές κινήσεις μόνο του επιλεγμένου καταστήματος, χωρίς έγκριση ή αλλαγή.'}
  ]},
  {key:'wholesale',label:'Χονδρική',actions:[
    {key:'wholesale.read',label:'Προβολή παραγγελιών χονδρικής',description:'Βλέπει τις καταχωρισμένες παραγγελίες χονδρικής και την ανάλυσή τους στο επιλεγμένο κατάστημα.'}
  ]},
  {key:'video',label:'Κάμερες',actions:[
    {key:'video.read',label:'Προβολή κατάστασης καμερών',description:'Βλέπει την κατάσταση σύνδεσης και τα ονόματα/ζώνες καμερών του επιλεγμένου καταστήματος, χωρίς σύνδεση ή αναπαραγωγή βίντεο.'}
  ]},
  {key:'printers',label:'Εκτυπώσεις παραγωγής',actions:[
    {key:'printers.read',label:'Προβολή κατάστασης εκτυπώσεων',description:'Βλέπει τις πρόσφατες εργασίες εκτύπωσης του επιλεγμένου καταστήματος, χωρίς ρυθμίσεις σύνδεσης ή νέα εκτύπωση.'}
  ]},
  {key:'stock-transfers',label:'Μεταφορές αποθήκης',actions:[
    {key:'stock-transfers.read',label:'Προβολή μεταφορών και υπολοίπων',description:'Βλέπει τα υπόλοιπα μεταφορών, τις εκκρεμείς εισπράξεις και το ιστορικό εξωτερικών μεταφορών του επιλεγμένου καταστήματος.'}
  ]},
  {key:'invoice-ai',label:'Αναγνώσεις τιμολογίων',actions:[
    {key:'invoice-ai.read',label:'Προβολή αποθηκευμένων αναγνώσεων',description:'Βλέπει τις αποθηκευμένες αναγνώσεις και τα εμφανιζόμενα διαγνωστικά του επιλεγμένου καταστήματος, χωρίς νέα ανάγνωση ή καταχώριση.'}
  ]},
  {key:'online-orders',label:'Online παραγγελίες',actions:[
    {key:'online-orders.read',label:'Προβολή Online παραγγελιών',description:'Βλέπει τις Online παραγγελίες και τις συνδεδεμένες πωλήσεις, πληρωμές και κινήσεις του επιλεγμένου καταστήματος.'}
  ]},
  {key:'table-service',label:'Τραπέζια',actions:[
    {key:'table-service.read',label:'Προβολή τραπεζιών και παρασκευής',description:'Βλέπει τραπέζια, παραγγελίες, ιστορικό και ουρές παρασκευής του επιλεγμένου καταστήματος.'}
  ]},
  {key:'baking',label:'Ψησίματα',actions:[
    {key:'baking.read',label:'Προβολή ψησιμάτων',description:'Βλέπει διαθέσιμα ψημένα/άψητα είδη και το πρόσφατο ιστορικό ψησιμάτων του επιλεγμένου καταστήματος.'}
  ]},
  {key:'monthly-inventory',label:'Μηνιαία απογραφή',actions:[
    {key:'monthly-inventory.read',label:'Προβολή κατάστασης μηνιαίας απογραφής',description:'Βλέπει την καταχωρισμένη κατάσταση εξουσιοδότησης του επιλεγμένου καταστήματος, χωρίς προσωπική ενεργοποίηση ή λήψη απογραφής.'}
  ]},
  {key:'monthly-invoice-audit',label:'Μηνιαίος έλεγχος',actions:[
    {key:'monthly-invoice-audit.read',label:'Προβολή μηνιαίου ελέγχου τιμολογίων',description:'Βλέπει τον έλεγχο τιμολογίων μήνα και τα εκκρεμή πρωτότυπα του επιλεγμένου καταστήματος.'}
  ]},
  {key:'pending',label:'Εκκρεμότητες Chat',actions:[
    {key:'pending.read',label:'Προβολή εκκρεμοτήτων Chat',description:'Βλέπει τις εκκρεμότητες Chat και την κατάστασή τους στο επιλεγμένο κατάστημα.'}
  ]},
  {key:'promotions',label:'Προσφορές',actions:[
    {key:'promotions.read',label:'Προβολή προσφορών και απόδοσης',description:'Βλέπει τις προσφορές και τις πωλήσεις προσφορών του επιλεγμένου καταστήματος.'}
  ]},
  {key:'employees',label:'Προσωπικό',actions:[
    {key:'payroll.read',label:'Προβολή μισθοδοσίας',description:'Βλέπει προεπισκόπηση μισθοδοσίας, περιόδους, ποσά πληρωμών και υπόλοιπα του επιλεγμένου καταστήματος.'},
    {key:'schedule.read',label:'Προβολή προγράμματος',description:'Βλέπει το πρόγραμμα και τις αναθέσεις του επιλεγμένου καταστήματος.'},
    {key:'attendance.read',label:'Προβολή παρουσιών',description:'Βλέπει τις ώρες παρουσίας του επιλεγμένου καταστήματος.'},
    {key:'leaves.approve',label:'Έγκριση άδειας ή ρεπό',requires:['leaves.read']},
    {key:'leaves.reject',label:'Απόρριψη άδειας ή ρεπό',requires:['leaves.read']},
    {key:'leaves.read',label:'Προβολή αδειών και ρεπό',description:'Βλέπει τις αιτήσεις αδειών και ρεπό του επιλεγμένου καταστήματος.'},
    {key:'employees.read',label:'Προβολή εργαζομένων',description:'Βλέπει τα στοιχεία επικοινωνίας, τους ρόλους και τη διαθεσιμότητα εργαζομένων του επιλεγμένου καταστήματος.'}
  ]},
  {key:'handover',label:'Παράδοση βάρδιας',actions:[
    {key:'handover.read',label:'Προβολή παραδόσεων βάρδιας',description:'Βλέπει τα μηνύματα παράδοσης και τα συνημμένα του επιλεγμένου καταστήματος.'}
  ]},
  {key:'invoices',label:'Τιμολόγια',actions:[
    {key:'invoices.read',label:'Προβολή και εξαγωγή παραστατικών',description:'Βλέπει τη θυρίδα, τα πρωτότυπα και τις αγορές του καταστήματος.'},
    {key:'invoices.edit',label:'Επεξεργασία πρόχειρου τιμολογίου',description:'Διορθώνει στοιχεία και γραμμές ανοικτού πρόχειρου, με υπάρχοντα είδη. Δεν αλλάζει καταχωρισμένη αγορά ή καρτέλα προϊόντος.',requires:['invoices.read']},
    {key:'invoices.approve',label:'Έγκριση και καταχώριση τιμολογίου',description:'Οριστικοποιεί ελεγμένη αγορά και ενημερώνει απόθεμα με τους υπάρχοντες ελέγχους. Δεν παρακάμπτει διαφορά συνόλων.',requires:['invoices.read']},
    {key:'invoices.reopen',label:'Επαναφορά οριστικοποιημένου τιμολογίου',description:'Επαναφέρει το ίδιο τιμολόγιο για διόρθωση με αιτιολογία, προεπισκόπηση και αντιστροφή των σχετικών κινήσεων αποθήκης.',requires:['invoices.read']},
    {key:'invoices.cancel',label:'Ακύρωση καταχωρισμένου τιμολογίου',description:'Ακυρώνει οριστικά το τιμολόγιο του επιλεγμένου καταστήματος, με αιτιολογία, προεπισκόπηση και αντιστροφή αποθέματος.',requires:['invoices.read']}
  ]},
  {key:'sales',label:'Πωλήσεις και βάρδιες',actions:[
    {key:'analytics.read',label:'Ανάλυση πωλήσεων και βαρδιών',description:'Βλέπει πωλήσεις, κέρδος, προϊόντα και χειριστές ανά βάρδια του επιλεγμένου καταστήματος.',requires:['shifts.read','sales.read']},
    {key:'sales.read',label:'Προβολή πωλήσεων και ταμείων',description:'Βλέπει πωλήσεις, κινήσεις και υπόλοιπα βαρδιών του καταστήματος.'},
    {key:'sales.cancel',label:'Ακύρωση πώλησης τρέχουσας βάρδιας',description:'Ακυρώνει μη φορολογική πώληση στην ίδια ανοικτή βάρδια, με αιτιολογία και αντίστροφη εγγραφή. Δεν επιτρέπει επιστροφή ή ακύρωση φορολογικής απόδειξης.',requires:['sales.read']},
    {key:'shifts.read',label:'Συγκεντρωτική προβολή βαρδιών',description:'Βλέπει τις πρόσφατες βάρδιες όλων των ταμείων του καταστήματος, τα σύνολα και τις κινήσεις τους.'},
    {key:'shifts.close',label:'Κλείσιμο βάρδιας με καταμέτρηση',description:'Κλείνει βάρδια του επιλεγμένου ταμείου με πραγματική καταμέτρηση, EFTPOS και καταγραφή διαφορών. Δεν επιτρέπει διοικητικό κλείσιμο χωρίς καταμέτρηση.'}
  ]},
  {key:'payments',label:'Πληρωμές',actions:[
    {key:'payments.read',label:'Προβολή στοιχείων πληρωμών',description:'Βλέπει ιστορικό τραπεζικών μεταφορών, προμηθευτές και διαθέσιμα παραστατικά του επιλεγμένου καταστήματος.'},
    {key:'payments.supplier',label:'Καταχώριση πληρωμής προμηθευτή',description:'Πληρωμή ανοικτών τιμολογίων ή έναντι με αποδεικτικό ή ρητή δήλωση. Παραμένει προς έλεγχο ιδιοκτήτη.',requires:['payments.read','sales.read']},
    {key:'payments.expense',label:'Καταχώριση εξόδου',description:'Καταχωρίζει θετικό έξοδο με αιτιολογία και παραστατικό ή δήλωση. Παραμένει προς έλεγχο ιδιοκτήτη.',requires:['payments.read','sales.read']},
    {key:'payments.cash',label:'Πληρωμή από μετρητά βάρδιας',description:'Επιτρέπει αφαίρεση της πληρωμής από την ανοικτή βάρδια του επιλεγμένου ταμείου.',requires:['payments.read','sales.read']}
  ]},
  {key:'orders',label:'Παραγγελίες',actions:[
    {key:'order-suggestions.read',label:'Προτάσεις παραγγελίας',description:'Βλέπει τις προτάσεις ειδών και την ομαδοποίησή τους ανά προμηθευτή στο επιλεγμένο κατάστημα.'}
  ]},
  {key:'performance',label:'Απόδοση προϊόντων',actions:[
    {key:'low-value-products.read',label:'Προϊόντα Χαμηλής Απόδοσης',description:'Βλέπει την αναφορά προϊόντων χαμηλής απόδοσης του επιλεγμένου καταστήματος.'}
  ]},
  {key:'suppliers',label:'Προμηθευτές',actions:[
    {key:'supplier-price-comparison.read',label:'Σύγκριση τιμών προμηθευτών',description:'Βλέπει τις τιμές και τις αγορές του ίδιου είδους από διαφορετικούς προμηθευτές στο επιλεγμένο κατάστημα.'}
  ]},
  {key:'products',label:'Είδη και αποθήκη',actions:[
    {key:'stock.read',label:'Προβολή κινήσεων αποθήκης',description:'Βλέπει τις κινήσεις, τις ποσότητες και το απόθεμα είδους στο επιλεγμένο κατάστημα.',requires:['products.read']},
    {key:'products.read',label:'Προβολή ειδών',description:'Βλέπει είδη, τιμές, κόστος και απόθεμα του καταστήματος.'},
    {key:'products.edit',label:'Επεξεργασία καρτέλας είδους',description:'Επεξεργάζεται την πλήρη καρτέλα είδους. Τα κοινά στοιχεία προϊόντος ισχύουν σε όλα τα καταστήματα που το διαθέτουν.',requires:['products.read']},
    {key:'products.create',label:'Νέο είδος',description:'Δημιουργεί πλήρη καρτέλα στο επιλεγμένο κατάστημα.',requires:['products.read']},
    {key:'products.opening-stock',label:'Αρχικό απόθεμα νέου είδους',description:'Καταχωρίζει αρχικό απόθεμα κατά τη δημιουργία είδους.',requires:['products.read','products.create']}
  ]},
  {key:'inventory',label:'Απογραφή',actions:[
    {key:'inventory.read',label:'Προβολή',description:'Βλέπει τις ανοιχτές απογραφές του καταστήματος.'},
    {key:'inventory.history.read',label:'Προβολή ολοκληρωμένων απογραφών',description:'Βλέπει τις ολοκληρωμένες απογραφές και τις καταμετρημένες ποσότητες του καταστήματος. Δεν επιτρέπει αλλαγές, κόστος ή εξαγωγές.',requires:['inventory.read']},
    {key:'inventory.expected.read',label:'Προβολή θεωρητικού αποθέματος και διαφοράς',description:'Βλέπει τη θεωρητική ποσότητα και τη διαφορά καταμέτρησης. Δεν επιτρέπει οριστικοποίηση ή προβολή κόστους.',requires:['inventory.read']},
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
 const passive=finalPassiveStoreRequest(method,path);if(passive)return passive.capability;
 const report=storeReportRequestCapability(method,path);if(report)return report;
 if(method==='GET'&&path==='/api/commerce/sales/unsold-products')return 'unsold-products.read';
 if(method==='GET'&&path==='/api/store-pos/sales/journal')return 'sales-journal.read';
  if(method==='GET'&&/^\/api\/store-chat\/stores\/[^/]+\/messages(?:\/search|\/[^/]+\/attachment)?$/.test(path))return 'chat.read';
  if(method==='GET'&&/^\/api\/store-pos\/stores\/[^/]+\/online-radio$/.test(path))return 'radio.read';
  if(method==='POST'&&body?.status==='CONFIRMED'&&/^\/api\/transactions\/other-expenses\/[^/]+\/review$/.test(path))return 'approvals.expense-confirm';
  if(method==='GET'&&['/api/transactions/supplier-settlements/review','/api/transactions/other-expenses/review','/api/transactions/bank-ledger/review'].includes(path))return 'approvals.read';
  if(method==='GET'&&/^\/api\/wholesale\/orders(?:\/[^/]+)?$/.test(path))return 'wholesale.read';
  if(method==='GET'&&/^\/api\/video-admin\/stores\/[^/]+$/.test(path))return 'video.read';
  if(method==='GET'&&/^\/api\/production-printers\/stores\/[^/]+$/.test(path))return 'printers.read';
  if(method==='GET'&&/^\/api\/store-pos\/stores\/[^/]+\/internal-transfers\/(?:credit|pending-cash-receipts|external-history)$/.test(path))return 'stock-transfers.read';
  if(method==='GET'&&path==='/api/commerce/ai-reader/jobs')return 'invoice-ai.read';
  if(method==='GET'&&/^\/api\/public\/kat\/backoffice-managed\/stores\/[^/]+\/orders$/.test(path))return 'online-orders.read';
  if(method==='GET'&&/^\/api\/store-pos\/stores\/[^/]+\/table-service(?:\/(?:history|preparation-queue))?$/.test(path))return 'table-service.read';
  if(method==='GET'&&/^\/api\/store-pos\/stores\/[^/]+\/baking$/.test(path))return 'baking.read';
  if(method==='GET'&&path==='/api/monthly-inventory-capture/status')return 'monthly-inventory.read';
  if(method==='GET'&&path==='/api/reports/invoice-month-audit')return 'monthly-invoice-audit.read';
  if(method==='GET'&&path==='/api/pending-center/chat-tasks')return 'pending.read';
  if(method==='GET'&&['/api/price-catalog/promotions/scoped','/api/price-catalog/promotions/analysis'].includes(path))return 'promotions.read';
  if(method==='GET'&&/^\/api\/platform\/store-modules\/companies\/[^/]+\/stores\/[^/]+\/workforce-v2\/payroll\/(?:preview|periods(?:\/[^/]+)?)$/.test(path))return 'payroll.read';
  if(method==='GET'&&/^\/api\/inventory-ledger\/[^/]+\/movements$/.test(path))return 'stock.read';
  if(method==='POST'&&/^\/api\/platform\/store-modules\/companies\/[^/]+\/stores\/[^/]+\/workforce-v2\/leaves\/[^/]+\/decision$/.test(path)){
    if(body?.status==='APPROVED')return 'leaves.approve';
    if(body?.status==='REJECTED')return 'leaves.reject';
  }
  const workforceAction=path.match(/^\/api\/platform\/store-modules\/companies\/[^/]+\/stores\/[^/]+\/workforce-v2\/(shift-templates|rules)(?:\/([^/]+)(\/status)?)?$/);
  if(workforceAction&&((method==='POST'&&!workforceAction[2])||(method==='PUT'&&workforceAction[2]&&!workforceAction[3])||(method==='PATCH'&&workforceAction[3])))return workforceAction[1]==='rules'?'workforce-rules.manage':'shift-templates.manage';
  const workforceSettings=method==='GET'&&path.match(/^\/api\/platform\/store-modules\/companies\/[^/]+\/stores\/[^/]+\/workforce-v2\/(roles|rules|shift-templates|audit)$/);
  if(workforceSettings)return {roles:'workforce-roles.read',rules:'workforce-rules.read','shift-templates':'shift-templates.read',audit:'workforce-audit.read'}[workforceSettings[1]];
  const workforceRead=method==='GET'&&path.match(/^\/api\/platform\/store-modules\/companies\/[^/]+\/stores\/[^/]+\/workforce-v2\/(schedules|attendance|leaves)$/);
  if(workforceRead)return {schedules:'schedule.read',attendance:'attendance.read',leaves:'leaves.read'}[workforceRead[1]];
  if(method==='GET'&&/^\/api\/platform\/store-modules\/companies\/[^/]+\/stores\/[^/]+\/workforce-v2\/employees(?:\/[^/]+)?$/.test(path))return 'employees.read';
  if(method==='GET'&&(path==='/api/commerce/handover'||/^\/api\/commerce\/handover\/[^/]+\/attachment$/.test(path)))return 'handover.read';
  if(method==='GET'&&path==='/api/commerce/sales/advanced-report')return 'analytics.read';
  if(method==='GET'&&['/api/commerce/order-suggestions','/api/commerce/order-suggestions/by-supplier'].includes(path))return 'order-suggestions.read';
  if(method==='GET'&&['/api/commerce/low-value-products/access','/api/commerce/low-value-products'].includes(path))return 'low-value-products.read';
  if(method==='GET'&&path==='/api/commerce/supplier-price-comparison')return 'supplier-price-comparison.read';
  const receiptAction=expectedReceiptAction(method,path);
  if(receiptAction)return receiptAction==='read'?'invoices.read':'invoices.approve';
  if((method==='GET'&&/^\/api\/purchase-orders\/[^/]+\/cancel-preview$/.test(path))||
     (method==='POST'&&/^\/api\/purchase-orders\/[^/]+\/cancel$/.test(path)))return 'invoices.cancel';
  if ((method==='GET'&&/^\/api\/purchase-orders\/[^/]+\/reopen-preview$/.test(path))||
      (method==='POST'&&/^\/api\/purchase-orders\/[^/]+\/reopen$/.test(path)))return 'invoices.reopen';
  if(method==='GET'&&/^\/api\/(?:cash|cash-control)\/stores\/[^/]+\/reporting-overview$/.test(path))return 'shifts.read';
  if(method==='GET'&&(/^(?:\/api\/backoffice-staff\/shifts\/stores\/[^/]+\/terminals|\/api\/cash\/stores\/[^/]+\/close-context)$/.test(path)))return 'shifts.close';
  if(method==='GET'&&/^\/api\/backoffice-staff\/sales\/stores\/[^/]+\/terminals$/.test(path))return 'sales.read';
  if(method==='GET'&&/^\/api\/backoffice-staff\/payments\/stores\/[^/]+$/.test(path))return 'payments.read';
  if(method==='GET'&&/^\/api\/transactions\/stores\/[^/]+\/supplier-open-invoices$/.test(path))return 'payments.supplier';
  if(method==='POST'&&/^\/api\/transactions\/stores\/[^/]+\/supplier-settlements$/.test(path))return 'payments.supplier';
  if(method==='POST'&&/^\/api\/transactions\/stores\/[^/]+$/.test(path)&&body.type==='OTHER_EXPENSE'&&!body.deferredInvoice&&Number(body.amount)>0&&['DOCUMENT','NO_DOCUMENT'].includes(body.evidenceMode))return 'payments.expense';
  if(method==='POST'&&/^\/api\/store-pos\/stores\/[^/]+\/sales\/[^/]+\/reverse$/.test(path)&&body.kind==='CANCEL')return 'sales.cancel';
  if(method==='POST'&&/^\/api\/cash\/sessions\/[^/]+\/close$/.test(path))return 'shifts.close';
  if(method==='GET'&&(path==='/api/purchase-orders/report'||/^\/api\/purchase-orders\/[^/]+\/detail$/.test(path)))return 'invoices.read';
  if(method==='GET'&&/^\/api\/commerce\/purchase-orders\/[^/]+\/ocr-lines\/[^/]+\/catalog-matches$/.test(path))return 'invoices.edit';
  if(method==='PATCH'&&/^\/api\/purchase-orders\/[^/]+$/.test(path))return (['FINAL','INVOICED'].includes(body.status)||body.status==='NEW'&&body.returnForCorrection===true)?'invoices.approve':body.status===undefined?'invoices.edit':null;
  if(method==='POST'&&/^\/api\/purchase-orders\/[^/]+\/assistant-line-transfer$/.test(path))return 'invoices.edit';
  if(method==='POST'&&/^\/api\/purchase-orders\/[^/]+\/lines$/.test(path)&&typeof body.productId==='string'&&body.productId.trim())return 'invoices.edit';
  if(method==='GET'&&/^\/api\/commerce\/purchase-orders\/[^/]+\/catalog-matches$/.test(path))return 'invoices.edit';
  if(['PATCH','DELETE'].includes(method)&&/^\/api\/purchase-orders\/[^/]+\/lines\/[^/]+$/.test(path))return 'invoices.edit';
  if(method==='DELETE'&&/^\/api\/inventory-v2\/stocktakes\/[^/]+\/count\/[^/]+$/.test(path))return 'inventory.clear';
  if(method==='POST'&&/^\/api\/inventory-v2\/stocktakes\/[^/]+\/count\/bulk-zero$/.test(path))return 'inventory.bulk-zero';
  if(method==='DELETE'&&/^\/api\/inventory-v2\/stocktakes\/[^/]+$/.test(path))return 'inventory.delete';
  if(method==='POST'&&path==='/api/inventory-v2/stocktakes')return 'inventory.create';
  if(method==='POST'&&/^\/api\/inventory-v2\/stocktakes\/[^/]+\/finalize$/.test(path))return 'inventory.finalize';
  if(method==='GET'&&(path==='/api/commerce/documents/inbox/archive'||/^\/api\/commerce\/documents\/inbox\/[^/]+\/file$/.test(path)))return 'invoices.read';
  if(method==='GET'&&/^\/api\/(?:transactions|cash)\/stores\/[^/]+\/overview$/.test(path))return 'sales.read';
  if(method==='GET'&&/^\/api\/store-pos\/stores\/[^/]+\/sales\/recent$/.test(path))return 'sales.read';
  if((method==='GET'&&path==='/api/inventory-archive')||(method==='POST'&&path==='/api/inventory-archive/export-xlsx'))return 'products.read';
  if((method==='GET'&&path==='/api/owner-products/catalog')||
    (method==='GET'&&/^\/api\/owner-products\/[^/]+\/(?:details|composition)$/.test(path))||
    (method==='PATCH'&&/^\/api\/owner-products\/[^/]+\/card$/.test(path))||
    (method==='POST'&&/^\/api\/owner-products\/[^/]+\/(?:set-items|recipe-items|stock-adjustment)$/.test(path))||
    (method==='DELETE'&&/^\/api\/owner-products\/[^/]+\/(?:set-items|recipe-items)\/[^/]+$/.test(path)))return 'products.edit';
  if(method==='GET'&&path==='/api/owner-products/new-card/options')return 'products.create';
  if(method==='POST'&&path==='/api/owner-products/new-card')return 'products.create';
  if(method==='GET'&&path==='/api/backoffice-staff/me')return 'SESSION';
  if(method==='POST'&&['/api/auth/logout','/api/auth/renew','/api/auth/change-password'].includes(path))return 'SESSION';
  if(method==='GET'&&/^\/api\/lifecycle\/stores\/[^/]+$/.test(path))return 'LIFECYCLE';
  if(method==='GET'&&/^\/api\/backoffice-staff\/cash\/stores\/[^/]+$/.test(path))return 'cash.read';
  if(method==='GET'&&/^\/api\/backoffice-staff\/inventory\/stores\/[^/]+\/stocktakes(?:\/[^/]+)?$/.test(path))return 'inventory.read';
  if(method==='POST'&&/^\/api\/inventory-v2\/stocktakes\/[^/]+\/count$/.test(path))return 'inventory.count';
  if(method==='POST'&&/^\/api\/inventory-v2\/stocktakes\/[^/]+\/lines$/.test(path))return 'inventory.count';
  return null;
}
