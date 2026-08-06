export const moduleCatalog=[
  {key:"CORE",name:"MyWorkStation Core",description:"Βασική πλατφόρμα, χρήστες, καταστήματα και audit.",category:"CORE",surface:"PLATFORM",developmentStatus:"READY",commercialReady:true},
  {key:"PERSONNEL",name:"Προσωπικό",description:"Εργαζόμενοι, ρόλοι και κανόνες.",category:"HR",surface:"BACKOFFICE",developmentStatus:"READY",commercialReady:true},
  {key:"SHIFTS",name:"Βάρδιες",description:"Πρόγραμμα και κατανομή βαρδιών.",category:"HR",surface:"BACKOFFICE",developmentStatus:"READY",commercialReady:true},
  {key:"LEAVES",name:"Άδειες προσωπικού",description:"Άδειες, ασθένειες, απουσίες και διαθεσιμότητα εργαζομένων.",category:"HR",surface:"BACKOFFICE",developmentStatus:"READY",commercialReady:true},
  {key:"CASH_CONTROL",name:"Έλεγχος Ταμείου",description:"Άνοιγμα, κλείσιμο, συρτάρι, φύλαξη, κέρματα, χρηματοκιβώτιο και διαφορές.",category:"STORE",surface:"STORE_APP",developmentStatus:"READY",commercialReady:true},
  {key:"STORE_MODE",name:"Store App / Store Mode",description:"Προσωπική είσοδος εργαζομένων με PIN ή κάρτα και καθημερινή λειτουργία καταστήματος.",category:"STORE",surface:"STORE_APP",developmentStatus:"READY",commercialReady:true},
  {key:"PILOT_REPORT",name:"Αναφορά Πιλότου",description:"Ημερήσια αναφορά λειτουργίας και audit.",category:"REPORTS",surface:"BACKOFFICE",developmentStatus:"READY",commercialReady:true},

  {key:"PRODUCT_CATALOG",name:"Κατάλογος Προϊόντων",description:"Προϊόντα, κατηγορίες, barcode, μονάδες, ΦΠΑ, τιμές και ενεργό/ανενεργό.",category:"COMMERCE",surface:"BACKOFFICE",developmentStatus:"IN_DEVELOPMENT",commercialReady:false},
  {key:"INVENTORY",name:"Αποθήκη & Συνταγές",description:"Αποθέματα, κινήσεις, αναλώσεις, παραλαβές και συνταγές/BOM.",category:"COMMERCE",surface:"BACKOFFICE",developmentStatus:"IN_DEVELOPMENT",commercialReady:false},
  {key:"SUPPLIERS",name:"Προμηθευτές",description:"Καρτέλες προμηθευτών, στοιχεία, υπόλοιπα και ιστορικό συνεργασίας.",category:"COMMERCE",surface:"BACKOFFICE",developmentStatus:"IN_DEVELOPMENT",commercialReady:false},
  {key:"DOCUMENTS",name:"Θυρίδα Τιμολογίων & Παραστατικών",description:"Φωτογραφίες/PDF, κατάσταση επεξεργασίας, υπεύθυνος και ιστορικό ανά κατάστημα και προμηθευτή.",category:"COMMERCE",surface:"BACKOFFICE",developmentStatus:"IN_DEVELOPMENT",commercialReady:false},
  {key:"PURCHASE_RECEIVING",name:"Πρόχειρα Παραστατικά & Παραλαβές",description:"Έλεγχος παραστατικού, κιβώτια→τεμάχια, αντιστοίχιση προϊόντων και καταχώριση αποθήκης.",category:"COMMERCE",surface:"BACKOFFICE",developmentStatus:"FUTURE",commercialReady:false},
  {key:"CUSTOMERS_CREDIT",name:"Πελάτες & Πίστωση",description:"Πελάτες, όρια πίστωσης, υπόλοιπα και καρτέλα κινήσεων.",category:"COMMERCE",surface:"BACKOFFICE",developmentStatus:"FUTURE",commercialReady:false},

  {key:"POS",name:"MyWorkStation POS",description:"Πραγματική πώληση μόνο στο Store App: scan/search, καλάθι, ποσότητες, μετρητά/κάρτα/πίστωση, ακυρώσεις και επιστροφές.",category:"STORE",surface:"STORE_APP",developmentStatus:"IN_DEVELOPMENT",commercialReady:false},
  {key:"STORE_PAYMENTS",name:"Πληρωμές & Έξοδα Καταστήματος",description:"Στο Store App: Πληρωμή προμηθευτή, Μεταφορά ποσού, Λοιπά έξοδα, φωτογραφία τιμολογίου/παραστατικού και Οι πληρωμές μου.",category:"STORE",surface:"STORE_APP",developmentStatus:"IN_DEVELOPMENT",commercialReady:false},
  {key:"SHIFT_HANDOVER",name:"Παράδοση Βάρδιας",description:"Μήνυμα προς επόμενη βάρδια, εκκρεμότητες, υπεύθυνος, συνημμένα και επιβεβαίωση.",category:"STORE",surface:"STORE_APP",developmentStatus:"IN_DEVELOPMENT",commercialReady:false},
  {key:"TABLES",name:"Τραπέζια",description:"Διαχείριση τραπεζιών, ανοικτές παραγγελίες και μεταφορά τραπεζιού.",category:"STORE",surface:"STORE_APP",developmentStatus:"FUTURE",commercialReady:false},
  {key:"MOBILE_ORDERING",name:"Mobile Ordering",description:"Παραγγελιοληψία από κινητή συσκευή προσωπικού.",category:"STORE",surface:"STORE_APP",developmentStatus:"FUTURE",commercialReady:false},
  {key:"QR_SELF_ORDER",name:"QR Self-Order",description:"Αυτοπαραγγελία πελάτη με QR και αποστολή στο Store App.",category:"STORE",surface:"STORE_APP",developmentStatus:"FUTURE",commercialReady:false},

  {key:"AI_READER",name:"AI Reader Τιμολογίων",description:"Πρόχειρη ανάγνωση χωρίς AI με confidence και προαιρετικός χειροκίνητος επανέλεγχος με AI.",category:"AI",surface:"BACKOFFICE",developmentStatus:"TECHNICAL_ACTIVATION",commercialReady:false,requiresTechnicalActivation:true},
  {key:"SALES_ANALYTICS",name:"Αναλυτική Πωλήσεων Pro",description:"Ανά προϊόν, κατηγορία, ώρα, ημέρα, βάρδια, υπάλληλο, κατάστημα, τρόπο πληρωμής, εκπτώσεις, ακυρώσεις, επιστροφές και συγκρίσεις.",category:"REPORTS",surface:"BACKOFFICE",developmentStatus:"IN_DEVELOPMENT",commercialReady:false},
  {key:"ATTENDANCE",name:"Παρουσία & Ωρομέτρηση",description:"Είσοδος/έξοδος εργαζομένων, πραγματικές ώρες εργασίας και μηνιαία σύνολα.",category:"HR",surface:"STORE_APP",developmentStatus:"FUTURE",commercialReady:false},
  {key:"PAYROLL",name:"Μισθοδοσία",description:"Περίοδοι μισθοδοσίας, ώρες, σύνολα και εξαγωγές.",category:"HR",surface:"BACKOFFICE",developmentStatus:"FUTURE",commercialReady:false},

  {key:"E_INVOICING",name:"Ηλεκτρονική Τιμολόγηση / myDATA",description:"Πάροχος, REST API, myDATA, MARK, PDF, webhooks και ηλεκτρονικά παραστατικά.",category:"FISCAL",surface:"CLOUD",developmentStatus:"TECHNICAL_ACTIVATION",commercialReady:false,requiresTechnicalActivation:true},
  {key:"DIGITAL_DISPATCH",name:"Ψηφιακό Δελτίο Αποστολής",description:"Έκδοση και διαβίβαση Ψηφιακού Δελτίου Αποστολής μέσω παρόχου.",category:"FISCAL",surface:"CLOUD",developmentStatus:"TECHNICAL_ACTIVATION",commercialReady:false,requiresTechnicalActivation:true},
  {key:"CONNECTOR_RBS",name:"Connector RBS / CapDriver",description:"Τοπική διασύνδεση Store App → Connector → CapDriver → RBS για πραγματική φορολογική απόδειξη.",category:"FISCAL",surface:"CONNECTOR",developmentStatus:"TECHNICAL_ACTIVATION",commercialReady:false,requiresTechnicalActivation:true},

  {key:"POS_VIDEO_AUDIT",name:"POS Video Audit",description:"Συσχέτιση γεγονότων POS με χρονικά σημεία βίντεο για audit.",category:"AUDIT",surface:"CLOUD",developmentStatus:"FUTURE",commercialReady:false},
  {key:"REMOTE_MANAGEMENT",name:"Cloud / Remote Management",description:"Συσκευές, κατάσταση, ενημερώσεις και απομακρυσμένη διαχείριση εγκαταστάσεων.",category:"CLOUD",surface:"PLATFORM",developmentStatus:"FUTURE",commercialReady:false},
  {key:"CLOUD_BACKUP",name:"Cloud Backup",description:"Πολιτικές backup, ιστορικό και έλεγχος επαναφοράς δεδομένων.",category:"CLOUD",surface:"PLATFORM",developmentStatus:"IN_DEVELOPMENT",commercialReady:false},
  {key:"REMOTE_SUPPORT",name:"Remote Support",description:"Απομακρυσμένη υποστήριξη με αποδοχή χρήστη, προσωρινό κωδικό, audit και 2FA.",category:"SUPPORT",surface:"REMOTE_AGENT",developmentStatus:"TECHNICAL_ACTIVATION",commercialReady:false,requiresTechnicalActivation:true},
  {key:"NETLINK_AIRTIME",name:"Netlink Airtime",description:"Διασύνδεση και πραγματική δοκιμή υπηρεσίας Netlink Airtime.",category:"INTEGRATIONS",surface:"STORE_APP",developmentStatus:"TECHNICAL_ACTIVATION",commercialReady:false,requiresTechnicalActivation:true},

  {key:"SAFE_MODE",name:"Safe Mode",description:"Κεντρική προστασία κρίσιμων αλλαγών, audit, backup πριν από επικίνδυνες ενέργειες, anomaly blocking και emergency lock.",category:"SECURITY",surface:"PLATFORM",developmentStatus:"FUTURE",commercialReady:false}
];

export const moduleKeys=moduleCatalog.map(module=>module.key);

export const developmentStatusLabels={
  READY:"ΕΤΟΙΜΟ",
  IN_DEVELOPMENT:"ΥΠΟ ΑΝΑΠΤΥΞΗ",
  TECHNICAL_ACTIVATION:"ΤΕΧΝΙΚΗ ΕΝΕΡΓΟΠΟΙΗΣΗ",
  FUTURE:"ΜΕΛΛΟΝΤΙΚΟ"
};

export const surfaceLabels={
  PLATFORM:"Platform",
  BACKOFFICE:"Backoffice",
  STORE_APP:"Store App",
  CONNECTOR:"Connector",
  CLOUD:"Cloud",
  REMOTE_AGENT:"Remote Agent"
};

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
