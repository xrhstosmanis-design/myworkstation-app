package gr.myworkstation.chat;
import android.app.AlertDialog;import android.content.Context;import android.view.View;import android.view.ViewGroup;import android.view.WindowManager;import android.widget.EditText;import android.widget.LinearLayout;import android.widget.TextView;
import androidx.test.core.app.ActivityScenario;import androidx.test.core.app.ApplicationProvider;import androidx.test.ext.junit.runners.AndroidJUnit4;import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;import java.lang.reflect.Method;import java.util.concurrent.CopyOnWriteArrayList;import org.json.JSONArray;import org.json.JSONObject;import org.junit.Before;import org.junit.After;import org.junit.Test;import org.junit.runner.RunWith;import static org.junit.Assert.*;
/** Real Android topic navigation with synthetic transport; never sends to production. */
@RunWith(AndroidJUnit4.class) public class ChatTopicsActivityTest {
 @Before public void clear(){Context c=ApplicationProvider.getApplicationContext();new TokenVault(c).clear();TokenVault.pendingTwoFactor(c).clear();}
 @After public void clean(){clear();}
 private static Object get(MainActivity a,String n)throws Exception{Field f=MainActivity.class.getDeclaredField(n);f.setAccessible(true);return f.get(a);}
 private static void set(MainActivity a,String n,Object v)throws Exception{Field f=MainActivity.class.getDeclaredField(n);f.setAccessible(true);f.set(a,v);}
 private static void call(MainActivity a,String n)throws Exception{Method m=MainActivity.class.getDeclaredMethod(n);m.setAccessible(true);m.invoke(a);}
 private static void topic(MainActivity a,String n)throws Exception{Method m=MainActivity.class.getDeclaredMethod("changeTopic",String.class);m.setAccessible(true);m.invoke(a,n);}
 private static JSONObject store()throws Exception{return new JSONObject().put("id","topics-fixture").put("companyId","fixture-company").put("name","Δοκιμαστικό κατάστημα");}
 private static View text(View v,String t){if(v instanceof TextView&&t.equals(((TextView)v).getText().toString()))return v;if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){View x=text(((ViewGroup)v).getChildAt(i),t);if(x!=null)return x;}return null;}
 private static final class Api extends ChatApi {
  final CopyOnWriteArrayList<JSONObject> sent=new CopyOnWriteArrayList<>();final CopyOnWriteArrayList<String> paths=new CopyOnWriteArrayList<>();boolean wrongResponse;int writes;
  @Override JSONObject json(String p,String method,JSONObject b,String token)throws Exception{
   assertEquals("fixture-token",token);paths.add(p);
   if(method.equals("GET")){String topic=p.contains("topic=INVOICE")?"INVOICE":p.contains("topic=CASH")?"CASH":"GENERAL";assertTrue(p.endsWith("topic="+topic));
    JSONObject row=new JSONObject().put("id","topic-message").put("senderId","actor").put("senderName","Δοκιμή").put("body","Μήνυμα "+topic).put("category",topic.equals("CASH")?"SHIFT":topic).put("topic",topic).put("readByMe",true).put("deliveredByMe",true);
    return new JSONObject().put("store",store()).put("topic",wrongResponse?"INVOICE":topic).put("topicsAvailable",true).put("rows",new JSONArray().put(row)).put("pinnedAnnouncements",new JSONArray()).put("interactionsAvailable",true).put("searchForwardAvailable",true).put("voiceMessagesAvailable",true).put("videoMessagesAvailable",true).put("settings",new JSONObject()).put("permissions",new JSONObject().put("canPin",true));
   }
   writes++;assertTrue(method.equals("POST")&&(p.endsWith("/messages")||p.endsWith("/voice-messages")||p.endsWith("/video-messages")));sent.add(new JSONObject(b.toString()));return new JSONObject().put("ok",true).put("id","sent-fixture");
  }
 }
 private void start(ActivityScenario<MainActivity>s,Api api)throws Exception{s.onActivity(a->{try{set(a,"api",api);set(a,"token","fixture-token");set(a,"identity",new JSONObject().put("id","actor").put("role","OWNER"));set(a,"selected",store());call(a,"conversation");}catch(Exception e){throw new AssertionError(e);}});idle(s);}
 private void idle(ActivityScenario<MainActivity>s)throws Exception{for(int i=0;i<150;i++){boolean[] done={false};s.onActivity(a->{try{done[0]=!(Boolean)get(a,"busy");}catch(Exception e){throw new AssertionError(e);}});if(done[0])return;Thread.sleep(30);}fail("Topic fixture request did not finish");}
 private void change(ActivityScenario<MainActivity>s,String topic)throws Exception{s.onActivity(a->{try{topic(a,topic);}catch(Exception e){throw new AssertionError(e);}});idle(s);}
 @Test public void actualTabsShowOnlySelectedTopicAndDoNotWriteReadOrAcknowledgements()throws Exception{
  Api api=new Api();try(ActivityScenario<MainActivity>s=ActivityScenario.launch(MainActivity.class)){start(s,api);for(String topic:ChatTopics.VALUES){change(s,topic);s.onActivity(a->{try{View root=(View)get(a,"root");LinearLayout tabs=root.findViewWithTag("chat-topics");assertEquals(3,tabs.getChildCount());assertTrue(tabs.findViewWithTag("topic-"+topic).isSelected());assertNotNull(text((View)get(a,"messages"),"Μήνυμα "+topic));assertEquals(1,((LinearLayout)get(a,"messages")).getChildCount());assertTrue(((EditText)get(a,"composer")).getHint().toString().contains(ChatTopics.label(topic)));}catch(Exception e){throw new AssertionError(e);}});}assertEquals(0,api.writes);}
 }
 @Test public void draftNeedsExplicitDiscardAndOldActionsCannotReplyAcrossTopics()throws Exception{
  Api api=new Api();try(ActivityScenario<MainActivity>s=ActivityScenario.launch(MainActivity.class)){start(s,api);final View[] old={null};s.onActivity(a->{try{old[0]=((LinearLayout)get(a,"messages")).getChildAt(0);((EditText)get(a,"composer")).setText("Πρόχειρο");topic(a,"CASH");assertEquals("GENERAL",get(a,"activeTopic"));AlertDialog d=(AlertDialog)get(a,"imageDialog");assertTrue((d.getWindow().getAttributes().flags&WindowManager.LayoutParams.FLAG_SECURE)!=0);d.getButton(AlertDialog.BUTTON_NEGATIVE).performClick();assertEquals("Πρόχειρο",((EditText)get(a,"composer")).getText().toString());topic(a,"CASH");((AlertDialog)get(a,"imageDialog")).getButton(AlertDialog.BUTTON_POSITIVE).performClick();}catch(Exception e){throw new AssertionError(e);}});idle(s);
   s.onActivity(a->{try{assertEquals("CASH",get(a,"activeTopic"));assertEquals("",((EditText)get(a,"composer")).getText().toString());old[0].performLongClick();assertNull(get(a,"quotedMessage"));assertNull(get(a,"imageDialog"));}catch(Exception e){throw new AssertionError(e);}});assertEquals(0,api.writes);}
 }
 @Test public void textPhotoVoiceAndVideoCarryTopicAndQuotedShiftCategory()throws Exception{
  for(String kind:new String[]{"text","photo","voice","video"}){Api api=new Api();try(ActivityScenario<MainActivity>s=ActivityScenario.launch(MainActivity.class)){start(s,api);change(s,"CASH");final byte[] video;if(kind.equals("video")){try(java.io.InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("video-one-second.mp4");java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);video=out.toByteArray();}}else video=null;
   s.onActivity(a->{try{JSONObject row=new JSONObject().put("id","topic-message").put("senderId","actor").put("body","Ταμείο").put("category","SHIFT").put("topic","CASH");Method reply=MainActivity.class.getDeclaredMethod("chooseChatReply",JSONObject.class);reply.setAccessible(true);reply.invoke(a,row);if(kind.equals("photo"))((PhotoBatch)get(a,"photos")).add(new byte[]{1,2},"image/jpeg");if(kind.equals("voice"))set(a,"voiceDraft",VoiceData.fromPcm(new short[]{1,2},2));if(kind.equals("video"))set(a,"videoDraft",video);((EditText)get(a,"composer")).setText("Απάντηση");call(a,"send");}catch(Exception e){throw new AssertionError(e);}});idle(s);assertEquals(kind,1,api.sent.size());JSONObject body=api.sent.get(0);assertEquals("CASH",body.getString("topic"));assertEquals("SHIFT",body.getString("category"));assertEquals("topic-message",body.getString("replyToId"));}
  }
 }
 @Test public void uncertainSendBlocksTopicSwitchAndWrongResponseNeverRenders()throws Exception{
  Api api=new Api();try(ActivityScenario<MainActivity>s=ActivityScenario.launch(MainActivity.class)){start(s,api);s.onActivity(a->{try{set(a,"uncertainStoreId","topics-fixture");topic(a,"INVOICE");assertEquals("GENERAL",get(a,"activeTopic"));set(a,"uncertainStoreId","");}catch(Exception e){throw new AssertionError(e);}});api.wrongResponse=true;change(s,"CASH");s.onActivity(a->{try{assertEquals(0,((LinearLayout)get(a,"messages")).getChildCount());assertTrue(((TextView)get(a,"notice")).getText().length()>0);}catch(Exception e){throw new AssertionError(e);}});assertEquals(0,api.writes);}
 }
}
