package gr.myworkstation.chat;
import org.json.JSONArray;import org.json.JSONObject;import org.junit.Test;import static org.junit.Assert.*;
public class ChatInteractionsTest {
 @Test public void actualDeliveryBatchExcludesSelfDuplicatesAndAlreadyAcknowledgedButNeverUsesReadState() throws Exception {
  JSONArray rows=new JSONArray().put(new JSONObject().put("id","m1").put("senderId","other").put("readByMe",true)).put(new JSONObject().put("id","m1").put("senderId","other")).put(new JSONObject().put("id","own").put("senderId","actor")).put(new JSONObject().put("id","done").put("senderId","other").put("deliveredByMe",true)).put(new JSONObject().put("id","bad/path")).put(JSONObject.NULL);
  assertEquals("[\"m1\"]",ChatInteractions.deliveryIds(rows,"actor").toString());assertEquals(0,ChatInteractions.deliveryIds(null,"actor").length());
  JSONArray many=new JSONArray();for(int i=0;i<250;i++)many.put(new JSONObject().put("id","m"+i).put("senderId","other"));assertEquals(200,ChatInteractions.deliveryIds(many,"actor").length());
 }
 @Test public void quotePreviewIsBoundedPlainTextAndNeverUsesOpaqueOrMalformedBody()throws Exception {
  assertEquals("Hello world",ChatInteractions.preview(new JSONObject().put("body","Hello\n\u202e world")));
  String text=ChatInteractions.preview(new JSONObject().put("body","👩".repeat(300)));assertEquals(281,text.codePointCount(0,text.length()));assertTrue(text.endsWith("…"));
  assertEquals("image.png",ChatInteractions.preview(new JSONObject().put("body",new JSONObject()).put("attachmentName","image.png")));
  assertEquals("Μήνυμα",ChatInteractions.preview(new JSONObject()));assertFalse(ChatInteractions.validId("x/y"));assertFalse(ChatInteractions.validId(" "));assertTrue(ChatInteractions.validId("chat-123-abc"));
 }
 @Test public void reactionsUseOnlyCurrentActorAndAllowedEmojiWithoutDuplicateCounts()throws Exception {
  JSONObject row=new JSONObject().put("reactions",new JSONArray().put(new JSONObject().put("id","a").put("reaction","👍")).put(new JSONObject().put("id","a").put("reaction","👍")).put(new JSONObject().put("id","b").put("reaction","❤️")).put(new JSONObject().put("id","c").put("reaction","🔥")));
  assertEquals(1,ChatInteractions.count(row,"👍"));assertEquals("❤️",ChatInteractions.mine(row,"b"));assertEquals("",ChatInteractions.mine(row,"c"));assertEquals("",ChatInteractions.mine(row,"missing"));assertFalse(ChatInteractions.reaction("❤"));assertTrue(ChatInteractions.reaction("✅"));
 }
}
