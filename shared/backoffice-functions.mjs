// Function families under review for the requested complete coverage, not an authorization allowlist.
// Native audit/adapter coverage must exist before an action becomes grantable.
// STORE rights cannot authorize COMPANY operations. Existing persisted rights
// stay unchanged; adding a catalogue entry never grants access automatically.
export const backofficeFunctionCatalogue=Object.freeze([
  {
    "key": "access",
    "label": "Χειριστές και δικαιώματα",
    "scope": "COMPANY",
    "actions": [
      "read",
      "create",
      "edit",
      "disable",
      "grant",
      "revoke"
    ]
  },
  {
    "key": "stores",
    "label": "Καταστήματα",
    "scope": "COMPANY",
    "actions": [
      "read",
      "create",
      "edit",
      "configure",
      "archive"
    ]
  },
  {
    "key": "employees",
    "label": "Εργαζόμενοι και κάρτες",
    "scope": "STORE",
    "actions": [
      "read",
      "create",
      "edit",
      "disable",
      "issue-card",
      "export",
      "print"
    ]
  },
  {
    "key": "schedule",
    "label": "Πρόγραμμα βαρδιών",
    "scope": "STORE",
    "actions": [
      "read",
      "create",
      "edit",
      "publish",
      "delete",
      "export",
      "print"
    ]
  },
  {
    "key": "leaves",
    "label": "Άδειες και ρεπό",
    "scope": "STORE",
    "actions": [
      "read",
      "create",
      "edit",
      "approve",
      "reject",
      "delete"
    ]
  },
  {
    "key": "attendance",
    "label": "Παρουσίες και ώρες",
    "scope": "STORE",
    "actions": [
      "read",
      "correct",
      "approve",
      "export",
      "print"
    ]
  },
  {
    "key": "chat",
    "label": "Chat καταστήματος",
    "scope": "STORE",
    "actions": [
      "read",
      "send",
      "attach",
      "forward",
      "delete",
      "manage"
    ]
  },
  {
    "key": "products",
    "label": "Είδη καταστήματος",
    "scope": "STORE",
    "actions": [
      "read",
      "create",
      "edit",
      "delete",
      "opening-stock",
      "import",
      "export",
      "print"
    ]
  },
  {
    "key": "product-master",
    "label": "Κεντρικές καρτέλες προϊόντων",
    "scope": "COMPANY",
    "actions": [
      "read",
      "create",
      "edit",
      "delete",
      "merge",
      "import",
      "export"
    ]
  },
  {
    "key": "product-taxonomy",
    "label": "Κατηγορίες, ΦΠΑ και ταξινομήσεις",
    "scope": "COMPANY",
    "actions": [
      "read",
      "create",
      "edit",
      "delete",
      "import",
      "export"
    ]
  },
  {
    "key": "prices",
    "label": "Τιμές και τιμοκατάλογοι",
    "scope": "STORE",
    "actions": [
      "read",
      "edit",
      "bulk-edit",
      "import",
      "export",
      "print"
    ]
  },
  {
    "key": "promotions",
    "label": "Προσφορές",
    "scope": "STORE",
    "actions": [
      "read",
      "create",
      "edit",
      "activate",
      "delete"
    ]
  },
  {
    "key": "stock",
    "label": "Αποθήκη και κινήσεις",
    "scope": "STORE",
    "actions": [
      "read",
      "receive",
      "adjust",
      "waste",
      "reverse",
      "import",
      "export",
      "print"
    ]
  },
  {
    "key": "inventory",
    "label": "Απογραφή",
    "scope": "STORE",
    "actions": [
      "read",
      "count",
      "create",
      "finalize",
      "reopen",
      "delete",
      "import",
      "export",
      "print"
    ]
  },
  {
    "key": "stock-transfers",
    "label": "Μεταφορές αποθήκης",
    "scope": "STORE",
    "actions": [
      "read",
      "create",
      "approve",
      "dispatch",
      "receive",
      "cancel",
      "export",
      "print"
    ]
  },
  {
    "key": "recipes",
    "label": "Συνταγές",
    "scope": "COMPANY",
    "actions": [
      "read",
      "create",
      "edit",
      "delete",
      "produce",
      "export"
    ]
  },
  {
    "key": "baking",
    "label": "Ψησίματα και παραγωγή",
    "scope": "STORE",
    "actions": [
      "read",
      "create",
      "finalize",
      "cancel",
      "configure",
      "export"
    ]
  },
  {
    "key": "suppliers",
    "label": "Προμηθευτές",
    "scope": "COMPANY",
    "actions": [
      "read",
      "create",
      "edit",
      "disable",
      "import",
      "export"
    ]
  },
  {
    "key": "supplier-comparison",
    "label": "Σύγκριση προμηθευτών",
    "scope": "STORE",
    "actions": [
      "read",
      "compare",
      "export",
      "print"
    ]
  },
  {
    "key": "order-suggestions",
    "label": "Προτάσεις παραγγελίας",
    "scope": "STORE",
    "actions": [
      "read",
      "calculate",
      "edit",
      "approve",
      "send",
      "export",
      "print"
    ]
  },
  {
    "key": "purchase-orders",
    "label": "Παραγγελίες αγορών",
    "scope": "STORE",
    "actions": [
      "read",
      "create",
      "edit",
      "approve",
      "send",
      "cancel",
      "export",
      "print"
    ]
  },
  {
    "key": "invoices",
    "label": "Αγορές και τιμολόγια",
    "scope": "STORE",
    "actions": [
      "read",
      "create",
      "edit",
      "approve",
      "reopen",
      "delete",
      "credit",
      "export",
      "print"
    ]
  },
  {
    "key": "invoice-inbox",
    "label": "Θυρίδα και πρωτότυπα",
    "scope": "STORE",
    "actions": [
      "read",
      "upload",
      "download",
      "sync",
      "review",
      "delete",
      "export",
      "print"
    ]
  },
  {
    "key": "invoice-ai",
    "label": "Ανάγνωση και βοηθός τιμολογίων",
    "scope": "STORE",
    "actions": [
      "read",
      "submit",
      "recheck",
      "correct",
      "link",
      "approve"
    ]
  },
  {
    "key": "monthly-invoice-audit",
    "label": "Μηνιαίος έλεγχος τιμολογίων",
    "scope": "STORE",
    "actions": [
      "read",
      "calculate",
      "approve",
      "export",
      "print",
      "email"
    ]
  },
  {
    "key": "monthly-inventory",
    "label": "Μηνιαία απογραφή και εξουσιοδότηση",
    "scope": "STORE",
    "actions": [
      "read",
      "grant",
      "revoke",
      "trigger",
      "finalize",
      "export"
    ]
  },
  {
    "key": "sales",
    "label": "Πωλήσεις",
    "scope": "STORE",
    "actions": [
      "read",
      "cancel",
      "return",
      "reverse",
      "export",
      "print"
    ]
  },
  {
    "key": "shifts",
    "label": "Βάρδιες και ταμεία",
    "scope": "STORE",
    "actions": [
      "read",
      "open",
      "close",
      "force-close",
      "export",
      "print"
    ]
  },
  {
    "key": "payments",
    "label": "Πληρωμές",
    "scope": "STORE",
    "actions": [
      "read",
      "supplier",
      "expense",
      "cash",
      "correct",
      "cancel",
      "export",
      "print"
    ]
  },
  {
    "key": "cash",
    "label": "Έλεγχος ταμείων",
    "scope": "STORE",
    "actions": [
      "read",
      "investigate",
      "review",
      "explain",
      "confirm-shortage",
      "reopen",
      "export",
      "print"
    ]
  },
  {
    "key": "cash-transfers",
    "label": "Μεταφορές μετρητών",
    "scope": "STORE",
    "actions": [
      "read",
      "create",
      "confirm",
      "cancel",
      "export",
      "print"
    ]
  },
  {
    "key": "banking",
    "label": "Τράπεζες και συμφωνίες",
    "scope": "COMPANY",
    "actions": [
      "read",
      "create",
      "edit",
      "import",
      "match",
      "approve",
      "reverse",
      "export"
    ]
  },
  {
    "key": "approvals",
    "label": "Εκκρεμείς επιβεβαιώσεις",
    "scope": "STORE",
    "actions": [
      "read",
      "approve",
      "reject",
      "request-proof",
      "reverse"
    ]
  },
  {
    "key": "customers",
    "label": "Πελάτες και οφειλές",
    "scope": "COMPANY",
    "actions": [
      "read",
      "create",
      "edit",
      "disable",
      "receive",
      "adjust",
      "import",
      "export",
      "print"
    ]
  },
  {
    "key": "audience",
    "label": "Κάρτες κοινού και επιβράβευση",
    "scope": "STORE",
    "actions": [
      "read",
      "create",
      "edit",
      "issue",
      "disable",
      "configure",
      "export",
      "print"
    ]
  },
  {
    "key": "online-orders",
    "label": "Online παραγγελίες",
    "scope": "STORE",
    "actions": [
      "read",
      "accept",
      "edit",
      "reject",
      "dispatch",
      "complete",
      "configure",
      "export"
    ]
  },
  {
    "key": "table-service",
    "label": "Τραπέζια και σερβιτόροι",
    "scope": "STORE",
    "actions": [
      "read",
      "create",
      "edit",
      "transfer",
      "close",
      "configure",
      "export",
      "print"
    ]
  },
  {
    "key": "wholesale",
    "label": "Χονδρική B2B",
    "scope": "STORE",
    "actions": [
      "read",
      "create",
      "edit",
      "approve",
      "send",
      "cancel",
      "configure",
      "export",
      "print"
    ]
  },
  {
    "key": "handover",
    "label": "Παράδοση βάρδιας",
    "scope": "STORE",
    "actions": [
      "read",
      "create",
      "acknowledge",
      "edit",
      "delete",
      "export"
    ]
  },
  {
    "key": "pending",
    "label": "Κέντρο εκκρεμοτήτων",
    "scope": "STORE",
    "actions": [
      "read",
      "create",
      "assign",
      "edit",
      "resolve",
      "delete",
      "export"
    ]
  },
  {
    "key": "analytics",
    "label": "Πωλήσεις, κέρδος και margin",
    "scope": "STORE",
    "actions": [
      "read",
      "calculate",
      "export",
      "print",
      "email"
    ]
  },
  {
    "key": "reports",
    "label": "Αναφορές",
    "scope": "STORE",
    "actions": [
      "read",
      "generate",
      "export",
      "print",
      "email"
    ]
  },
  {
    "key": "automatic-reports",
    "label": "Αυτόματες αναφορές",
    "scope": "STORE",
    "actions": [
      "read",
      "configure",
      "recipients",
      "send",
      "disable"
    ]
  },
  {
    "key": "video",
    "label": "Κάμερες και Video Audit",
    "scope": "STORE",
    "actions": [
      "read",
      "playback",
      "export",
      "annotate",
      "configure"
    ]
  },
  {
    "key": "devices",
    "label": "Συσκευές και διασυνδέσεις",
    "scope": "STORE",
    "actions": [
      "read",
      "pair",
      "configure",
      "disconnect",
      "diagnose"
    ]
  },
  {
    "key": "scanner",
    "label": "Σάρωση παραστατικών",
    "scope": "STORE",
    "actions": [
      "read",
      "scan",
      "install",
      "configure"
    ]
  },
  {
    "key": "printers",
    "label": "Εκτυπώσεις και ετικέτες",
    "scope": "STORE",
    "actions": [
      "read",
      "print",
      "install",
      "configure"
    ]
  },
  {
    "key": "parameters",
    "label": "Παράμετροι επιχείρησης",
    "scope": "COMPANY",
    "actions": [
      "read",
      "edit",
      "configure"
    ]
  },
  {
    "key": "backups",
    "label": "Αντίγραφα ασφαλείας",
    "scope": "COMPANY",
    "actions": [
      "read",
      "create",
      "download",
      "restore",
      "configure"
    ]
  },
  {
    "key": "assistant",
    "label": "Βοηθός ιδιοκτήτη",
    "scope": "STORE",
    "actions": [
      "read",
      "ask",
      "export"
    ]
  },
  {
    "key": "wallet",
    "label": "Πιστώσεις και χρεώσεις AI",
    "scope": "COMPANY",
    "actions": [
      "read",
      "fund",
      "settle",
      "configure",
      "export"
    ]
  },
  {
    "key": "support",
    "label": "Υποστήριξη και συντήρηση",
    "scope": "STORE",
    "actions": [
      "read",
      "create",
      "attach",
      "diagnose",
      "resolve"
    ]
  },
  {
    "key": "recording",
    "label": "Καταγραφή οθόνης",
    "scope": "STORE",
    "actions": [
      "read",
      "record",
      "export",
      "delete"
    ]
  },
  {
    "key": "radio",
    "label": "Online ραδιόφωνο",
    "scope": "STORE",
    "actions": [
      "read",
      "play",
      "configure"
    ]
  },
  {
    "key": "lifecycle",
    "label": "Αρχειοθέτηση και κύκλος καταστήματος",
    "scope": "COMPANY",
    "actions": [
      "read",
      "preview",
      "archive",
      "restore",
      "reset",
      "delete"
    ]
  }
].map(entry=>Object.freeze({...entry,actions:Object.freeze(entry.actions)})));
export const backofficePermissionKey=(functionKey,action)=>`${functionKey}.${action}`;
export function functionDefinition(key){return backofficeFunctionCatalogue.find(entry=>entry.key===key)||null}
