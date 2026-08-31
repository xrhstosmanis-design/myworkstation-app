export const moduleCatalog=[
  {key:"CORE",name:"MyWorkStation Core",description:"Βασική πλατφόρμα, χρήστες, καταστήματα και audit.",category:"CORE",commercialReady:true},
  {key:"PERSONNEL",name:"Προσωπικό",description:"Εργαζόμενοι, ρόλοι και κανόνες.",category:"CORE",commercialReady:true},
  {key:"SHIFTS",name:"Βάρδιες",description:"Πρόγραμμα και κατανομή βαρδιών.",category:"CORE",commercialReady:true},
  {key:"AI_STAFF_SCHEDULER",name:"Πρόγραμμα Εργαζομένων με AI",description:"Αυτόματη δημιουργία προγράμματος ανά κατάστημα, PDF και αποστολή email στους εργαζομένους. Χρεώνεται ξεχωριστά ανά κατάστημα.",category:"AI",commercialReady:true,monthlyPriceEur:14.9},
  {key:"LEAVES",name:"Άδειες προσωπικού",description:"Άδειες, ασθένειες, απουσίες και διαθεσιμότητα εργαζομένων.",category:"CORE",commercialReady:true},
  {key:"CASH_CONTROL",name:"Αυτόματος Έλεγχος Ταμείων",description:"Αυτόματη διασταύρωση βαρδιών, μετρητών, POS–EFTPOS, εξόδων, παραστατικών, ακυρώσεων και επιστροφών.",category:"CONTROL",commercialReady:true,monthlyPriceEur:75},
  {key:"STORE_MODE",name:"Λειτουργία καταστήματος",description:"Προσωπική είσοδος εργαζομένων με PIN ή κάρτα.",category:"CONTROL",commercialReady:true},
  {key:"PILOT_REPORT",name:"Αναφορά Πιλότου",description:"Ημερήσια αναφορά λειτουργίας και audit.",category:"REPORTS",commercialReady:true},
  {key:"INVENTORY",name:"Αποθήκη, Απογραφή & Συνταγές",description:"Προϊόντα, barcode, προμηθευτές, αγορές, αποθέματα, ολική/μερική απογραφή, αναλώσεις και συνταγές.",category:"OPERATIONS",commercialReady:true,monthlyPriceEur:14.9},
  {key:"POS",name:"MyWorkStation POS",description:"Μη φορολογικές πωλήσεις pilot, προϊόντα, πελάτες και πληρωμές. Φορολογική έκδοση μόνο μέσω Connector RBS.",category:"POS",commercialReady:true},
  {key:"ONLINE_ORDERING",name:"Ηλεκτρονικό κατάστημα / Παραγγελίες",description:"Προαιρετικό online κατάστημα ανά πελάτη και κατάστημα, με Delivery/Pickup, online τιμές, σύνδεση POS, stock και audit.",category:"OPERATIONS",commercialReady:true},
  {key:"TABLE_SERVICE",name:"Ασύρματη Παραγγελιοληψία & Τραπέζια",description:"Σερβιτόροι, τραπέζια, παρασκευή, πληρωμή, φύρα χωρίς απόδειξη, αποθήκη και πλήρες BackOffice audit ανά κατάστημα.",category:"OPERATIONS",commercialReady:true},
  {key:"ADVANCED_ONLINE_PRODUCT_SEARCH",name:"Προηγμένη αναζήτηση προϊόντων στο διαδίκτυο",description:"Βαθιά online αναζήτηση barcode μετά από Master Catalog και OpenFoodFacts, με Google search provider, quota και καταγραφή χρήσης.",category:"POS",commercialReady:true,requiresTechnicalActivation:true},
  {key:"SALES_ANALYTICS",name:"Αναλυτική Πωλήσεων",description:"Τζίρος, προϊόντα, τρόποι πληρωμής και συγκρίσεις περιόδων.",category:"REPORTS",commercialReady:true},
  {key:"SHIFT_HANDOVER",name:"Παράδοση Βάρδιας",description:"Εκκρεμότητες, προτεραιότητες και επιβεβαίωση από την επόμενη βάρδια.",category:"CONTROL",commercialReady:true},
  {key:"AI_READER",name:"Ανάγνωση τιμολογίων με AI",description:"Τοπικό OCR χωρίς αυτόματη AI χρέωση, βεβαιότητα ανά γραμμή και προαιρετικός χειροκίνητος επανέλεγχος όταν συνδεθεί provider.",category:"AI",commercialReady:true},
  {key:"DOCUMENTS",name:"Έγγραφα & Τιμολόγια",description:"Θυρίδα τιμολογίων, αρχεία ανά κατάστημα/προμηθευτή, υπεύθυνος και κατάσταση επεξεργασίας.",category:"OPERATIONS",commercialReady:true},
  {key:"ATTENDANCE",name:"Παρουσία & Ώρες Εργασίας",description:"Προσωπική είσοδος/έξοδος, πραγματικές ώρες, μηνιαία σύνολα και ελεγχόμενες διορθώσεις.",category:"HR",commercialReady:true},
  {key:"VIDEO_EVENTS",name:"Συμβάντα βίντεο / Κάμερες",description:"Σύνδεση συμβάντων Audit με το NVR/DVR ή τις IP κάμερες κάθε καταστήματος, με περιορισμένη πρόσβαση και καταγραφή προβολών.",category:"SECURITY",commercialReady:false,requiresTechnicalActivation:true},
  {key:"NETLINK_PREPAID",name:"Netlink Prepaid",description:"Προπληρωμένες κάρτες μέσω Netlink με ξεχωριστή αξία κάρτας, χρέωση υπηρεσίας, προμήθεια και πλήρες transaction audit.",category:"CONNECTORS",commercialReady:false,requiresTechnicalActivation:true},
  {key:"CONNECTOR_RBS",name:"Connector RBS / CapDriver",description:"Τοπική διασύνδεση με CapDriver και φορολογική RBS.",category:"CONNECTORS",commercialReady:false,requiresTechnicalActivation:true},
  {key:"REMOTE_SUPPORT",name:"Απομακρυσμένη υποστήριξη",description:"Απομακρυσμένη υποστήριξη με audit και έγκριση χρήστη.",category:"SUPPORT",commercialReady:false,requiresTechnicalActivation:true}
];

export const moduleKeys=moduleCatalog.map(module=>module.key);

export const planDefaults={
  TRIAL:["CORE","PERSONNEL","SHIFTS","LEAVES"],
  PILOT:["CORE","PERSONNEL","SHIFTS","LEAVES","STORE_MODE","PILOT_REPORT"],
  BASIC:["CORE","PERSONNEL","SHIFTS","LEAVES"],
  PRO:["CORE","PERSONNEL","SHIFTS","LEAVES","STORE_MODE","PILOT_REPORT","ATTENDANCE"],
  ENTERPRISE:["CORE","PERSONNEL","SHIFTS","LEAVES","STORE_MODE","PILOT_REPORT","ATTENDANCE"]
};

export function catalogView(entitlements=[],commercialTerms=[]){
  const byKey=new Map(entitlements.map(row=>[row.moduleKey,row]));
  const termsByKey=new Map(commercialTerms.map(row=>[row.moduleKey,row]));
  return moduleCatalog.map(module=>{
    const entitlement=byKey.get(module.key),terms=termsByKey.get(module.key);
    return {
      ...module,
      active:Boolean(entitlement?.active),
      startsAt:entitlement?.startsAt||null,
      endsAt:entitlement?.endsAt||null,
      notes:entitlement?.notes||null,
      monthlyPrice:Number(terms?terms.monthlyPrice:(module.monthlyPriceEur||0)),setupFee:Number(terms?.setupFee||0),billingCycle:terms?.billingCycle||"MONTHLY",currency:terms?.currency||"EUR"
    };
  });
}
