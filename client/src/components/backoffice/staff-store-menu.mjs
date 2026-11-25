import {staffPermissionSections} from "../../../../shared/backoffice-staff.mjs";
import {finalPassiveStoreActions} from "../../../../shared/backoffice-staff-final-passive.mjs";

const groups = [
  ["cash","Ταμεία, πωλήσεις και βάρδιες"],
  ["stock","Είδη, τιμές και αποθήκη"],
  ["invoices","Τιμολόγια και προμηθευτές"],
  ["orders","Παραγγελίες και εξυπηρέτηση"],
  ["people","Προσωπικό και πρόγραμμα"],
  ["support","Επικοινωνία και υποστήριξη"],
  ["reports","Αναφορές καταστήματος"],
];

// Register each new dedicated store view here with its capability and group.
const views = [
  ["payments.import-kiosk","cash","kiosk-import","Εισαγωγή πληρωμών Kiosk"],
  ["staff-grants.manage-reads","people","delegated-reads","Παραχώρηση προβολών καταστήματος"],
  ["operator-profiles.manage-permissions","people","operator-permissions","Δικαιώματα χειριστών POS"],
  ["invoices.read", "invoices", "invoices", "Τιμολόγια"],
  ["shifts.read", "cash", "shift-report", "Αναφορά βαρδιών"],
  ["shifts.close", "cash", "close", "Κλείσιμο βάρδιας"],
  ["sales.read", "cash", "sales", "Πωλήσεις και βάρδιες"],
  ["payments.read", "cash", "payments", "Πληρωμές"],
  ["products.read", "stock", "products", "Είδη και αποθήκη"],
  ["inventory.duplicates.read", "stock", "inventory-duplicates", "Έλεγχος διπλοεγγραφών"],
  ["inventory.read", "stock", "inventory", "Απογραφή"],
  ["monthly-inventory.read", "stock", "monthly-inventory", "Μηνιαία παρατήρηση αποθήκης"],
  ["chat.read", "support", "chat", "Chat καταστήματος"],
  ["radio.read", "support", "radio", "Κατάσταση ραδιοφώνου"],
  ["approvals.read", "support", "approvals", "Εκκρεμείς επιβεβαιώσεις"],
  ["wholesale.read", "orders", "wholesale", "Παραγγελίες χονδρικής"],
  ["video.read", "support", "video", "Κάμερες / Video Audit"],
  ["printers.read", "support", "printers", "Κατάσταση εκτυπώσεων"],
  ["stock-transfers.read", "stock", "stock-transfers", "Διακινήσεις αποθήκης"],
  ["invoice-ai.read", "invoices", "invoice-ai", "Αναγνώσεις τιμολογίων"],
  ["online-orders.read", "orders", "online-orders", "Online Παραγγελίες"],
  ["table-service.read", "orders", "table-service", "Τραπέζια και σερβιτόροι"],
  ["baking.read", "stock", "baking", "Ψησίματα"],
  ["monthly-invoice-audit.read", "invoices", "monthly-invoice-audit", "Έλεγχος τιμολογίων μήνα"],
  ["pending.read", "support", "pending", "Εκκρεμότητες Chat"],
  ["promotions.read", "stock", "promotions", "Προσφορές"],
  ["payroll.read", "people", "payroll", "Μισθοδοσία"],
  ["stock.read", "stock", "stock", "Κινήσεις αποθήκης"],
  ["schedule.read", "people", "schedule", "Πρόγραμμα"],
  ["attendance.read", "people", "attendance", "Παρουσίες"],
  ["leaves.read", "people", "leaves", "Άδειες και ρεπό"],
  ["employees.read", "people", "employees", "Προσωπικό"],
  ["handover.read", "cash", "handover", "Παράδοση βάρδιας"],
  ["analytics.read", "cash", "analytics", "Ανάλυση πωλήσεων"],
  ["order-suggestions.read", "orders", "order-suggestions", "Προτάσεις παραγγελίας"],
  ["low-value-products.read", "stock", "low-value-products", "Προϊόντα Χαμηλής Απόδοσης"],
  ["supplier-price-comparison.read", "invoices", "supplier-comparison", "Σύγκριση προμηθευτών"],
  ["cash.read", "cash", "cash", "Έλεγχος ταμείων"],
  ["workforce-roles.read", "people", "workforce-roles.read", "Ρόλοι καταστήματος"],
  ["workforce-rules.read", "people", "workforce-rules.read", "Κανόνες προσωπικού"],
  ["shift-templates.read", "people", "shift-templates.read", "Πρότυπα βαρδιών"],
  ["workforce-audit.read", "people", "workforce-audit.read", "Audit προσωπικού"],
  ["unsold-products.read", "stock", "unsold-products.read", "Είδη χωρίς πωλήσεις"],
  ["sales-journal.read", "cash", "sales-journal.read", "Ημερολόγιο πωλήσεων"],
];

const passiveGroups = {
  cash:"cash", barcode:"stock", workforce:"people", schedule:"people",
  operator:"people", transaction:"cash", cloud:"support", pending:"support",
};

export function staffStoreMenu(capabilities) {
  const granted = new Set(capabilities);
  const items = views
    .filter(([key]) => granted.has(key) && (key !== "shifts.close" || !granted.has("sales.read")))
    .map(([key,group,view,label]) => ({key,group,view,label}));
  for (const {key,label,requires} of finalPassiveStoreActions) {
    if (![key,...requires].every(capability => granted.has(capability))) continue;
    const group = key === "barcode-sales.read" ? "cash" : passiveGroups[key.split("-")[0]] ?? "support";
    items.push({key,group,view:key,label});
  }
  for (const {key,label} of staffPermissionSections.find(section => section.key === "store-reports").actions) {
    if (granted.has(key)) items.push({key,group:"reports",view:key,label});
  }
  return groups.map(([key,label]) => ({
    key,label,items:items.filter(item => item.group === key),
  })).filter(group => group.items.length);
}
