export const moduleCatalog=[
  {key:"CORE",name:"MyWorkStation Core",description:"Βασική πλατφόρμα, χρήστες, καταστήματα και audit.",category:"CORE",commercialReady:true},
  {key:"PERSONNEL",name:"Προσωπικό",description:"Εργαζόμενοι, ρόλοι και κανόνες.",category:"CORE",commercialReady:true},
  {key:"SHIFTS",name:"Βάρδιες",description:"Πρόγραμμα και κατανομή βαρδιών.",category:"CORE",commercialReady:true},
  {key:"LEAVES",name:"Άδειες",description:"Άδειες και διαθεσιμότητα προσωπικού.",category:"CORE",commercialReady:true},
  {key:"CASH_CONTROL",name:"Έλεγχος Ταμείου",description:"Άνοιγμα, κλείσιμο, διαφορές και παράδοση βάρδιας.",category:"CONTROL",commercialReady:true},
  {key:"STORE_MODE",name:"Store Mode",description:"Προσωπική είσοδος εργαζομένων με PIN ή κάρτα.",category:"CONTROL",commercialReady:true},
  {key:"PILOT_REPORT",name:"Αναφορά Πιλότου",description:"Ημερήσια αναφορά λειτουργίας και audit.",category:"REPORTS",commercialReady:true},
  {key:"INVENTORY",name:"Αποθήκη & Συνταγές",description:"Αγορές, αποθέματα, αναλώσεις και συνταγές.",category:"OPERATIONS",commercialReady:false},
  {key:"AI_READER",name:"AI Reader Τιμολογίων",description:"Ανάγνωση τιμολογίων από φωτογραφία ή PDF.",category:"AI",commercialReady:false},
  {key:"POS",name:"MyWorkStation POS",description:"Πωλήσεις, προϊόντα, πληρωμές και αποδείξεις.",category:"POS",commercialReady:false},
  {key:"CONNECTOR_RBS",name:"Connector RBS / CapDriver",description:"Τοπική διασύνδεση με CapDriver και φορολογική RBS.",category:"CONNECTORS",commercialReady:false,requiresTechnicalActivation:true},
  {key:"REMOTE_SUPPORT",name:"Remote Support",description:"Απομακρυσμένη υποστήριξη με audit και έγκριση χρήστη.",category:"SUPPORT",commercialReady:false}
];

export const moduleKeys=moduleCatalog.map(module=>module.key);

export const planDefaults={
  TRIAL:["CORE","PERSONNEL","SHIFTS","LEAVES"],
  PILOT:["CORE","PERSONNEL","SHIFTS","LEAVES","CASH_CONTROL","STORE_MODE","PILOT_REPORT"],
  BASIC:["CORE","PERSONNEL","SHIFTS","LEAVES","CASH_CONTROL"],
  PRO:["CORE","PERSONNEL","SHIFTS","LEAVES","CASH_CONTROL","STORE_MODE","PILOT_REPORT"],
  ENTERPRISE:["CORE","PERSONNEL","SHIFTS","LEAVES","CASH_CONTROL","STORE_MODE","PILOT_REPORT"]
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
