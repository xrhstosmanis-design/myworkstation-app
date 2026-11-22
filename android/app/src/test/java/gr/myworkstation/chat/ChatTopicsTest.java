package gr.myworkstation.chat;
import org.json.JSONObject;import org.junit.Test;import static org.junit.Assert.*;
public class ChatTopicsTest {
 @Test public void topicsKeepLegacyCashAndShiftTogetherWithoutChangingAnnouncementMeaning()throws Exception{
  assertTrue(ChatTopics.matches(new JSONObject().put("category","CASH"),"CASH"));
  assertTrue(ChatTopics.matches(new JSONObject().put("category","SHIFT"),"CASH"));
  assertFalse(ChatTopics.matches(new JSONObject().put("category","INVOICE"),"CASH"));
  assertTrue(ChatTopics.matches(new JSONObject().put("category","ANNOUNCEMENT"),"GENERAL"));
  assertTrue(ChatTopics.matches(new JSONObject(),"GENERAL"));
  assertFalse(ChatTopics.valid("cash"));assertFalse(ChatTopics.valid(null));
 }
 @Test public void explicitWrongTopicCannotRenderEvenWithKnownCategory()throws Exception{
  assertFalse(ChatTopics.matches(new JSONObject().put("category","INVOICE").put("topic","CASH"),"INVOICE"));
  assertFalse(ChatTopics.matches(new JSONObject().put("category","CASH").put("topic",JSONObject.NULL),"CASH"));
 }
 @Test public void advertisedResponseMustMatchRequestedTopic()throws Exception{
  assertTrue(ChatTopics.response(new JSONObject().put("topicsAvailable",true).put("topic","CASH"),"CASH"));
  assertFalse(ChatTopics.response(new JSONObject(),"GENERAL"));
  try{ChatTopics.response(new JSONObject().put("topicsAvailable",true).put("topic","INVOICE"),"CASH");fail();}catch(IllegalArgumentException expected){}
 }
}
