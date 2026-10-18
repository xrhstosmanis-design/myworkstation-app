package gr.myworkstation.chat;
import org.json.*;
import java.util.Map;
/** Read-only source display: no locally recomputed business totals and no raw technical JSON. */
final class ReportText {
    private static final Map<String,String> LABELS = Map.ofEntries(
        Map.entry("companyName","Εταιρεία"), Map.entry("storeName","Κατάστημα"), Map.entry("name","Είδος / εγγραφή"), Map.entry("sku","Κωδικός είδους"),
        Map.entry("from","Από"), Map.entry("to","Έως"), Map.entry("asOf","Στοιχεία έως"), Map.entry("date","Ημερομηνία"), Map.entry("createdAt","Καταχώριση"),
        Map.entry("grossSales","Τζίρος"), Map.entry("netSales","Καθαρή αξία"), Map.entry("vatValue","ΦΠΑ"), Map.entry("salesQuantity","Ποσότητα πωλήσεων"),
        Map.entry("currentStock","Τρέχον απόθεμα"), Map.entry("unit","Μονάδα"), Map.entry("amount","Ποσό"), Map.entry("total","Σύνολο πηγής"),
        Map.entry("quantity","Ποσότητα"), Map.entry("reason","Αιτιολογία / περιορισμός"), Map.entry("description","Περιγραφή"), Map.entry("source","Πηγή"),
        Map.entry("paymentMethod","Τρόπος πληρωμής"), Map.entry("employeeName","Εργαζόμενος"), Map.entry("supplierName","Προμηθευτής"),
        Map.entry("cash","Μετρητά"), Map.entry("card","Κάρτα"), Map.entry("iris","IRIS"), Map.entry("difference","Διαφορά"));
    static String render(JSONArray evidence) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < evidence.length(); i++) {
            JSONObject row = evidence.optJSONObject(i); if (row == null) continue;
            out.append("Αναγνωσμένη πηγή ").append(i + 1).append("\n"); append(row, out, 0); out.append("\n");
        }
        if (out.length() == 0) return "Δεν υπάρχουν διαθέσιμα στοιχεία προβολής.";
        return out.toString();
    }
    private static void append(JSONObject row, StringBuilder out, int depth) {
        if (depth > 4 || out.length() > 60000) return;
        for (String key : LABELS.keySet()) {
            Object value = row.opt(key);
            if (value != null && value != JSONObject.NULL && !(value instanceof JSONObject) && !(value instanceof JSONArray)) out.append(LABELS.get(key)).append(": ").append(String.valueOf(value)).append("\n");
        }
        for (String key : new String[]{"totals","rows","stores","products","items","records"}) {
            Object children = row.opt(key);
            if (children instanceof JSONObject) { out.append("Σύνολα καταγεγραμμένης πηγής\n"); append((JSONObject) children, out, depth + 1); }
            if (children instanceof JSONArray) {
                JSONArray list = (JSONArray) children;
                for (int i = 0; i < list.length() && i < 100 && out.length() <= 60000; i++) { JSONObject child = list.optJSONObject(i); if (child != null) { out.append("—\n"); append(child, out, depth + 1); } }
                if (list.length() > 100) out.append("Η πηγή περιέχει επιπλέον γραμμές. Για πλήρη προβολή άνοιξε την αντίστοιχη αναφορά στο Backoffice.\n");
            }
        }
        if (row.optBoolean("truncated") || row.optBoolean("sourceUnavailable")) out.append("Η πηγή είναι περιορισμένη ή μη διαθέσιμη· δεν τεκμηριώνει πλήρες σύνολο.\n");
        if (row.optBoolean("incompletePeriod")) out.append("Η περίοδος δεν έχει ολοκληρωθεί.\n");
    }
}
