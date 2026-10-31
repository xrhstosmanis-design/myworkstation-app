package gr.myworkstation.chat;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/** Names from an already authorized message response; never infers device delivery. */
public final class ReadReceipts {
    private static final Pattern CONTROLS = Pattern.compile("\\p{C}"), SPACE = Pattern.compile("\\s+");
    private ReadReceipts() {}
    public static ArrayList<String> names(JSONArray readers, String senderId) {
        ArrayList<String> names = new ArrayList<>();
        HashSet<String> seen = new HashSet<>();
        if (readers == null) return names;
        for (int i = 0; i < readers.length(); i++) {
            JSONObject reader = readers.optJSONObject(i);
            if (reader == null || !(reader.opt("id") instanceof String)) continue;
            String id = reader.optString("id").trim();
            if (id.isEmpty() || id.length() > 256 || id.equals(senderId) || !seen.add(id)) continue;
            String name = reader.opt("name") instanceof String ? reader.optString("name") : "";
            name = SPACE.matcher(CONTROLS.matcher(name).replaceAll(" ")).replaceAll(" ").trim();
            if (name.isEmpty() || name.equals(id)) name = "Χρήστης";
            if (name.codePointCount(0, name.length()) > 160) name = name.substring(0, name.offsetByCodePoints(0, 160)) + "…";
            names.add(name);
        }
        return names;
    }
}
