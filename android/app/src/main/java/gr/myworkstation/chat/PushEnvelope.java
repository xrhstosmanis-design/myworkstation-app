package gr.myworkstation.chat;
import java.util.Map;
/** Reject stale sessions, foreign staff scope and any content-bearing payload. */
final class PushEnvelope {
    private static final java.util.List<String> FIELDS = java.util.Arrays.asList("kind", "binding", "storeId", "companyId", "storeName", "messageId");
    static boolean allowed(Map<String, String> data, String binding, boolean staff, String store, String company) {
        if (data == null || !FIELDS.containsAll(data.keySet()) || !"MWS_CHAT".equals(data.get("kind")) || binding == null || !binding.matches("[a-f0-9]{64}") || !binding.equals(data.get("binding"))) return false;
        if (data.containsKey("storeName") && !validLabel(data.get("storeName"))) return false;
        if (data.containsKey("messageId") && !ChatInteractions.validId(data.get("messageId"))) return false;
        String targetStore = data.get("storeId"), targetCompany = data.get("companyId");
        if (targetStore == null || targetStore.isEmpty() || targetStore.length() > 200 || targetCompany == null || targetCompany.isEmpty() || targetCompany.length() > 200) return false;
        return !staff || (targetStore.equals(store) && targetCompany.equals(company));
    }
    static boolean validLabel(String name) {
        return name != null && !name.trim().isEmpty() && name.codePointCount(0, name.length()) <= 80
            && name.codePoints().noneMatch(c -> Character.isISOControl(c) || Character.getType(c) == Character.FORMAT);
    }
    static String title(Map<String, String> data) {
        String name = data.get("storeName");
        return validLabel(name) ? name + " · MyWorkStation Chat" : "MyWorkStation Chat";
    }
}
