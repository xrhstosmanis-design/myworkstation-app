export const moduleCatalog=[
  {key:"CORE",name:"MyWorkStation Core",description:"Βασική πλατφόρμα, χρήστες, καταστήματα και audit.",category:"CORE",commercialReady:true},
  {key:"PERSONNEL",name:"Προσωπικό",description:"Εργαζόμενοι, ρόλοι και κανόνες.",category:"CORE",commercialReady:true},
  {key:"SHIFTS",name:"Βάρδιες",description:"Πρόγραμμα και κατανομή βαρδιών.",category:"CORE",commercialReady:true},
  {key:"LEAVES",name:"Άδειες προσωπικού",description:"Άδειες, ασθένειες, απουσίες και διαθεσιμότητα εργαζομένων.",category:"CORE",commercialReady:true},
  {key:"CASH_CONTROL",name:"Έλεγχος Ταμείου",description:"Άνοιγμα, κλείσιμο, διαφορές και έλεγχος βάρδιας.",category:"CONTROL",commercialReady:true},
  {key:"STORE_MODE",name:"Store Mode",description:"Προσωπική είσοδος εργαζομένων με PIN ή κάρτα.",category:"CONTROL",commercialReady:true},
  {key:"PILOT_REPORT",name:"Αναφορά Πιλότου",description:"Ημερήσια αναφορά λειτουργίας και audit.",category:"REPORTS",commercialReady:true},
  {key:"INVENTORY",name:"Αποθήκη & Συνταγές",description:"Προϊόντα, barcode, προμηθευτές, αγορές, αποθέματα, αναλώσεις και συνταγές.",category:"OPERATIONS",commercialReady:true},
  {key:"POS",name:"MyWorkStation POS",description:"Μη φορολογικές πωλήσεις pilot, προϊόντα, πελάτες και πληρωμές. Φορολογική έκδοση μόνο μέσω Connector RBS.",category:"POS",commercialReady:true},
  {key:"ADVANCED_ONLINE_PRODUCT_SEARCH",name:"Advanced Online Product Search",description:"Βαθιά online αναζήτηση barcode μετά από Master Catalog και OpenFoodFacts, με Google search provider, quota και καταγραφή χρήσης.",category:"POS",commercialReady:true,requiresTechnicalActivation:true},
  {key:"SALES_ANALYTICS",name:"Αναλυτική Πωλήσεων",description:"Τζίρος, προϊόντα, τρόποι πληρωμής και συγκρίσεις περιόδων.",category:"REPORTS",commercialReady:true},
  {key:"SHIFT_HANDOVER",name:"Παράδοση Βάρδιας",description:"Εκκρεμότητες, προτεραιότητες και επιβεβαίωση από την επόμενη βάρδια.",category:"CONTROL",commercialReady:true},
  {key:"AI_READER",name:"AI Reader Τιμολογίων",description:"Τοπικό OCR χωρίς αυτόματη AI χρέωση, confidence ανά γραμμή και προαιρετικός χειροκίνητος επανέλεγχος όταν συνδεθεί provider.",category:"AI",commercialReady:true},
  {key:"DOCUMENTS",name:"Έγγραφα & Τιμολόγια",description:"Θυρίδα τιμολογίων, αρχεία ανά κατάστημα/προμηθευτή, υπεύθυνος και κατάσταση επεξεργασίας.",category:"OPERATIONS",commercialReady:true},
  {key:"ATTENDANCE",name:"Παρουσία & Ώρες Εργασίας",description:"Προσωπική είσοδος/έξοδος, πραγματικές ώρες, μηνιαία σύνολα και ελεγχόμενες διορθώσεις.",category:"HR",commercialReady:true},
  {key:"CONNECTOR_RBS",name:"Connector RBS / CapDriver",description:"Τοπική διασύνδεση με CapDriver και φορολογική RBS.",category:"CONNECTORS",commercialReady:false,requiresTechnicalActivation:true},
  {key:"REMOTE_SUPPORT",name:"Remote Support",description:"Απομακρυσμένη υποστήριξη με audit και έγκριση χρήστη.",category:"SUPPORT",commercialReady:false,requiresTechnicalActivation:true}
];

export const moduleKeys=moduleCatalog.map(module=>module.key);

export const planDefaults={
  TRIAL:["CORE","PERSONNEL","SHIFTS","LEAVES"],
  PILOT:["CORE","PERSONNEL","SHIFTS","LEAVES","CASH_CONTROL","STORE_MODE","PILOT_REPORT"],
  BASIC:["CORE","PERSONNEL","SHIFTS","LEAVES","CASH_CONTROL"],
  PRO:["CORE","PERSONNEL","SHIFTS","LEAVES","CASH_CONTROL","STORE_MODE","PILOT_REPORT","ATTENDANCE"],
  ENTERPRISE:["CORE","PERSONNEL","SHIFTS","LEAVES","CASH_CONTROL","STORE_MODE","PILOT_REPORT","ATTENDANCE"]
};

export function catalogView(entitlements=[]){
  const byKey=new Map(entitlements.map(row=>[row.moduleKey,row]));
  return moduleCatalog.map(module=>{
    const entitlement=byKey.get(module.key);
    return {
      ...module,
      active:Boolean(entitlement?.active),
      startsAt:entitlement?.startsAt||null,
      endsAt:entitlement?.endsAt||null,
      notes:entitlement?.notes||null
    };
  });
}
