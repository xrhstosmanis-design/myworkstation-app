package gr.myworkstation.chat;
import java.util.Map;
/** Reject stale sessions, foreign staff scope and any content-bearing payload. */
final class PushEnvelope {
    static boolean allowed(Map<String, String> data, String binding, boolean staff, String store, String company) {
        if (data == null || data.size() != 4 || !"MWS_CHAT".equals(data.get("kind")) || binding == null || !binding.matches("[a-f0-9]{64}") || !binding.equals(data.get("binding"))) return false;
        String targetStore = data.get("storeId"), targetCompany = data.get("companyId");
        if (targetStore == null || targetStore.isEmpty() || targetStore.length() > 200 || targetCompany == null || targetCompany.isEmpty() || targetCompany.length() > 200) return false;
        return !staff || (targetStore.equals(store) && targetCompany.equals(company));
    }
}
