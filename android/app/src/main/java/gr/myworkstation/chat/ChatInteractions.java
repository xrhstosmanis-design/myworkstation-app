package gr.myworkstation.chat;

import java.util.HashSet;
import org.json.JSONArray;
import org.json.JSONObject;

/** Bounded, in-memory rendering/acknowledgement of authorized Chat responses. */
final class ChatInteractions {
    static final String[] REACTIONS = {"👍", "✅", "❤️"};
    static boolean validId(String id) { return id != null && id.matches("[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}"); }
    static String preview(JSONObject row) {
        Object body = row.opt("body"), file = row.opt("attachmentName");
        String value = body instanceof String ? ((String) body).trim() : "";
        if (value.isEmpty()) value = file instanceof String ? (String) file : "Μήνυμα";
        value = value.replaceAll("\\p{C}", " ").replaceAll("\\s+", " ").trim();
        if (value.isEmpty()) value = "Μήνυμα";
        int count=value.codePointCount(0,value.length());
        return count<=280?value:value.substring(0,value.offsetByCodePoints(0,280))+"…";
    }
    static JSONArray deliveryIds(JSONArray rows,String actor) {
        JSONArray result=new JSONArray();HashSet<String> seen=new HashSet<>();
        if(rows==null)return result;
        for(int i=0;i<rows.length()&&result.length()<200;i++) {
            JSONObject row=rows.optJSONObject(i);if(row==null)continue;
            Object raw=row.opt("id");String id=raw instanceof String?(String)raw:"";
            if(validId(id)&&!row.optString("senderId").equals(actor)&&!row.optBoolean("deliveredByMe")&&seen.add(id))result.put(id);
        }
        return result;
    }
    static boolean reaction(String value) { for(String r:REACTIONS)if(r.equals(value))return true;return false; }
    static int count(JSONObject row,String emoji) {
        JSONArray items=row.optJSONArray("reactions");HashSet<String> seen=new HashSet<>();if(items==null)return 0;
        for(int i=0;i<items.length();i++){JSONObject item=items.optJSONObject(i);if(item!=null&&validId(item.optString("id"))&&emoji.equals(item.optString("reaction")))seen.add(item.optString("id"));}
        return seen.size();
    }
    static String mine(JSONObject row,String actor) {
        JSONArray items=row.optJSONArray("reactions");if(items==null)return "";
        for(int i=0;i<items.length();i++){JSONObject item=items.optJSONObject(i);if(item!=null&&actor.equals(item.optString("id"))&&reaction(item.optString("reaction")))return item.optString("reaction");}
        return "";
    }
}
