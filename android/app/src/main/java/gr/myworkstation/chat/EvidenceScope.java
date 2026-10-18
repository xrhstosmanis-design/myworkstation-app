package gr.myworkstation.chat;
import org.json.JSONArray;
import org.json.JSONObject;
/** Same selected-store evidence boundary as the existing web client; no all-store shortcut. */
final class EvidenceScope {
    static boolean matches(JSONObject scope, String company, String store) {
        return scope != null && !company.isEmpty() && !store.isEmpty() && company.equals(scope.optString("companyId")) && store.equals(scope.optString("storeId"));
    }
    static boolean valid(JSONObject answer, String company, String store, boolean platform) {
        if (!matches(answer.optJSONObject("scope"), company, store)) return false;
        JSONArray evidence = answer.optJSONArray("evidence"); if (evidence == null) return !answer.has("evidence");
        String expected = platform ? "PLATFORM_SELECTED_STORE" : "OWNER_SELECTED_STORE";
        for (int i = 0; i < evidence.length(); i++) {
            JSONObject row = evidence.optJSONObject(i); if (row == null || !expected.equals(row.optString("scope"))) return false;
            if (row.optString("kind").equals("sales_by_store")) {
                JSONArray stores = row.optJSONArray("stores"); if (stores == null) return false;
                for (int n = 0; n < stores.length(); n++) if (!matches(stores.optJSONObject(n), company, store)) return false;
            } else if (!matches(row, company, store)) return false;
        }
        return true;
    }
}
