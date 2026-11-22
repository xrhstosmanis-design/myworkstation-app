package gr.myworkstation.chat;

import org.json.JSONObject;

/** Public topic labels only; no stored messages, drafts, permissions or financial state. */
final class ChatTopics {
    static final String[] VALUES = {"GENERAL", "CASH", "INVOICE"};
    static boolean valid(String topic) { for(String value:VALUES) if(value.equals(topic))return true;return false; }
    static String label(String topic) { return "CASH".equals(topic)?"Ταμεία":"INVOICE".equals(topic)?"Τιμολόγια":"Συνομιλία"; }
    static String categoryTopic(String category) { return "CASH".equals(category)||"SHIFT".equals(category)?"CASH":"INVOICE".equals(category)?"INVOICE":"GENERAL"; }
    static boolean matches(JSONObject row,String topic) {
        if(row==null||!valid(topic))return false;
        String derived=categoryTopic(row.optString("category","GENERAL"));
        return derived.equals(topic)&&(!row.has("topic")||derived.equals(row.optString("topic")));
    }
    static boolean response(JSONObject data,String topic) {
        if(!valid(topic))throw new IllegalArgumentException();
        boolean available=data.optBoolean("topicsAvailable");
        if(available&&!topic.equals(data.optString("topic")))throw new IllegalArgumentException("Wrong Chat topic");
        return available;
    }
}
