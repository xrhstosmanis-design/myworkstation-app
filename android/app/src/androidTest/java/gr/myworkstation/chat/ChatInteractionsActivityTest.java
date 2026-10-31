package gr.myworkstation.chat;
import android.app.AlertDialog;import android.content.Context;import android.view.View;import android.view.ViewGroup;import android.view.WindowManager;import android.widget.EditText;import android.widget.TextView;
import androidx.lifecycle.Lifecycle;import androidx.test.core.app.ActivityScenario;import androidx.test.core.app.ApplicationProvider;import androidx.test.ext.junit.runners.AndroidJUnit4;import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;import java.lang.reflect.Method;import java.util.concurrent.CopyOnWriteArrayList;import java.util.ArrayList;import java.util.Arrays;
import org.json.JSONArray;import org.json.JSONObject;import org.junit.Before;import org.junit.After;import org.junit.Test;import org.junit.runner.RunWith;import static org.junit.Assert.*;
/** Real Activity/views/worker with synthetic transport. Never contacts production. */
@RunWith(AndroidJUnit4.class)
public class ChatInteractionsActivityTest {
 @Before public void clear(){Context c=ApplicationProvider.getApplicationContext();new TokenVault(c).clear();TokenVault.pendingTwoFactor(c).clear();}
 @After public void clean(){clear();}
 private Object get(MainActivity a,String name)throws Exception{Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);return f.get(a);}
 private void set(MainActivity a,String name,Object v)throws Exception{Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);f.set(a,v);}
 private void invoke(MainActivity a,String name)throws Exception{Method m=MainActivity.class.getDeclaredMethod(name);m.setAccessible(true);m.invoke(a);}
 private View find(View view,String text){if(view instanceof TextView&&((TextView)view).getText().toString().equals(text))return view;if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){View v=find(((ViewGroup)view).getChildAt(i),text);if(v!=null)return v;}return null;}
 private View find(MainActivity a,String text)throws Exception{return find((View)get(a,"root"),text);}
 private static JSONObject store()throws Exception{return new JSONObject().put("id","fixture-store").put("companyId","fixture-company").put("name","CI Chat");}
 private static final class Request{final String path,method;final JSONObject body;Request(String p,String m,JSONObject b)throws Exception{path=p;method=m;body=b==null?null:new JSONObject(b.toString());}}
 private static final class Api extends ChatApi {
  final CopyOnWriteArrayList<Request> calls=new CopyOnWriteArrayList<>();boolean delivered,acknowledged,pinned=true,manager=true,ackRequired=true;String reaction="";
  @Override synchronized JSONObject json(String path,String method,JSONObject body,String token)throws Exception{
   assertEquals("fixture-token",token);calls.add(new Request(path,method,body));
   if(method.equals("GET")&&path.endsWith("/messages?limit=100")){
    JSONObject row=new JSONObject().put("id","fixture-message").put("senderId","other").put("senderName","CI Other").put("body","Original announcement").put("createdAt","2026-10-31T12:00:00Z").put("category","ANNOUNCEMENT").put("pinned",pinned).put("readByMe",false).put("deliveredByMe",delivered).put("acknowledgedByMe",acknowledged);
    row.put("reactions",reaction.isEmpty()?new JSONArray():new JSONArray().put(new JSONObject().put("id","actor").put("name","CI actor").put("reaction",reaction)));
    row.put("acknowledgements",acknowledged?new JSONArray().put(new JSONObject().put("id","actor").put("name","CI actor")):new JSONArray());
    return new JSONObject().put("store",store()).put("rows",new JSONArray().put(row)).put("pinnedAnnouncements",pinned?new JSONArray().put(row):new JSONArray()).put("interactionsAvailable",true).put("voiceMessagesAvailable",true).put("videoMessagesAvailable",true).put("settings",new JSONObject().put("photosEnabled",true).put("announcementAcknowledgementRequired",ackRequired)).put("permissions",new JSONObject().put("canPin",manager).put("canManageSettings",manager));
   }
   if(method.equals("POST")&&path.endsWith("/delivered")){delivered=true;assertEquals("fixture-message",body.getJSONArray("messageIds").getString(0));return new JSONObject().put("ok",true).put("received",1);}
   if(method.equals("PUT")&&path.endsWith("/settings")){ackRequired=body.getBoolean("announcementAcknowledgementRequired");return new JSONObject().put("ok",true);}
   if(method.equals("PUT")&&path.endsWith("/reaction")){reaction=body.isNull("reaction")?"":body.getString("reaction");return new JSONObject().put("ok",true);}
   if(method.equals("PATCH")){pinned=body.getBoolean("pinned");return new JSONObject().put("ok",true);}
   if(method.equals("POST")&&path.endsWith("/acknowledge")){acknowledged=true;return new JSONObject().put("ok",true);}
   if(method.equals("POST")&&(path.endsWith("/messages")||path.endsWith("/voice-messages")||path.endsWith("/video-messages")))return new JSONObject().put("ok",true).put("id","sent-fixture");
   throw new AssertionError("Unexpected API or automatic read: "+method+" "+path);
  }
  int count(String suffix){int n=0;for(Request r:calls)if(r.path.endsWith(suffix))n++;return n;}
 }
 private void start(ActivityScenario<MainActivity> scenario,Api api)throws Exception{
  scenario.onActivity(a->{try{set(a,"api",api);set(a,"token","fixture-token");set(a,"identity",new JSONObject().put("id","actor").put("role","OWNER"));set(a,"selected",store());invoke(a,"conversation");}catch(Exception e){throw new AssertionError(e);}});idle(scenario);
 }
 private byte[] videoAsset()throws Exception{try(java.io.InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("video-one-second.mp4");java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()){byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);return out.toByteArray();}}
 private void idle(ActivityScenario<MainActivity> scenario)throws Exception{
  for(int i=0;i<150;i++){final boolean[] ready={false};scenario.onActivity(a->{try{ready[0]=!(boolean)get(a,"busy")&&(boolean)get(a,"interactionsReady");}catch(Exception e){throw new AssertionError(e);}});if(ready[0])return;Thread.sleep(30);}fail("Synthetic Chat request did not finish");
 }
 private void click(ActivityScenario<MainActivity> scenario,String text)throws Exception{scenario.onActivity(a->{try{View v=find(a,text);assertNotNull(text,v);v.performClick();}catch(Exception e){throw new AssertionError(e);}});idle(scenario);}
 @Test public void actualReplyIsQuotedInOneExplicitSendAndDeliveryNeverMarksHumanRead()throws Exception{
  Api api=new Api();try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){start(s,api);assertEquals(1,api.count("/delivered"));assertEquals(0,api.count("/read"));click(s,"Απάντηση");
   s.onActivity(a->{try{assertNotNull(get(a,"quotedMessage"));((EditText)get(a,"composer")).setText("Quoted answer");invoke(a,"send");}catch(Exception e){throw new AssertionError(e);}});idle(s);
   Request sent=null;for(Request r:api.calls)if(r.method.equals("POST")&&r.path.endsWith("/messages"))sent=r;assertNotNull(sent);assertEquals("fixture-message",sent.body.getString("replyToId"));assertEquals("Quoted answer",sent.body.getString("body"));assertEquals(1,api.count("/messages"));assertEquals(0,api.count("/read"));assertEquals(0,api.count("/acknowledge"));s.onActivity(a->{try{assertNull(get(a,"quotedMessage"));}catch(Exception e){throw new AssertionError(e);}});
  }
 }
 @Test public void actualReactionButtonsSetReplaceAndExplicitlyRemoveOnlyOneSelection()throws Exception{
  Api api=new Api();try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){start(s,api);click(s,"👍");click(s,"✅");click(s,"❤️");click(s,"❤️ 1");ArrayList<String> values=new ArrayList<>();for(Request r:api.calls)if(r.path.endsWith("/reaction"))values.add(r.body.isNull("reaction")?"remove":r.body.getString("reaction"));assertEquals(Arrays.asList("👍","✅","❤️","remove"),values);assertEquals(0,api.count("/read"));assertEquals(0,api.count("/acknowledge"));}
 }
 @Test public void pinnedAnnouncementDialogIsSecureAndAcknowledgesOnlyOnExplicitPress()throws Exception{
  Api api=new Api();try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){start(s,api);click(s,"Ανακοινώσεις (1)");assertEquals(0,api.count("/acknowledge"));
   s.onActivity(a->{try{AlertDialog d=(AlertDialog)get(a,"imageDialog");assertTrue((d.getWindow().getAttributes().flags&WindowManager.LayoutParams.FLAG_SECURE)!=0);assertEquals(1,d.getListView().getAdapter().getCount());d.getListView().performItemClick(null,0,0);}catch(Exception e){throw new AssertionError(e);}});
   s.onActivity(a->{try{AlertDialog d=(AlertDialog)get(a,"imageDialog");assertEquals("Το διάβασα",d.getButton(AlertDialog.BUTTON_POSITIVE).getText().toString());d.getButton(AlertDialog.BUTTON_POSITIVE).performClick();}catch(Exception e){throw new AssertionError(e);}});idle(s);assertEquals(1,api.count("/acknowledge"));assertEquals(0,api.count("/read"));click(s,"Ξεκαρφίτσωμα");assertFalse(api.pinned);
  }
  api=new Api();api.manager=false;try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){start(s,api);s.onActivity(a->{try{assertEquals(View.GONE,((View)get(a,"categoryButton")).getVisibility());assertNull(find(a,"Ξεκαρφίτσωμα"));}catch(Exception e){throw new AssertionError(e);}});}
 }
 @Test public void ownerAnnouncementSettingChangesOnlyAfterExplicitConfirmation()throws Exception{
  Api api=new Api();api.ackRequired=false;try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){start(s,api);assertEquals(0,api.count("/settings"));click(s,"Ρυθμίσεις");assertEquals(0,api.count("/settings"));
   s.onActivity(a->{try{AlertDialog d=(AlertDialog)get(a,"imageDialog");assertEquals("Ενεργοποίηση",d.getButton(AlertDialog.BUTTON_POSITIVE).getText().toString());d.getButton(AlertDialog.BUTTON_POSITIVE).performClick();}catch(Exception e){throw new AssertionError(e);}});idle(s);assertTrue(api.ackRequired);assertEquals(1,api.count("/settings"));s.onActivity(a->{try{assertNotNull(find(a,"Το διάβασα"));}catch(Exception e){throw new AssertionError(e);}});
  }
 }
 @Test public void staleStoreCompanyOrSessionCannotSelectReplyAndBackgroundWipesPrivateState()throws Exception{
  Api api=new Api();try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){start(s,api);
   s.onActivity(a->{try{View old=find(a,"Απάντηση");set(a,"selected",store().put("companyId","other-company"));old.performClick();assertNull(get(a,"quotedMessage"));set(a,"selected",store());set(a,"token","changed-token");old.performClick();assertNull(get(a,"quotedMessage"));set(a,"token","fixture-token");old.performClick();assertNotNull(get(a,"quotedMessage"));}catch(Exception e){throw new AssertionError(e);}});
   final MainActivity[] activity={null};s.onActivity(a->activity[0]=a);s.moveToState(Lifecycle.State.CREATED);
   InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{try{assertNull(get(activity[0],"quotedMessage"));assertEquals(0,((JSONArray)get(activity[0],"pinnedAnnouncements")).length());assertNull(get(activity[0],"imageDialog"));}catch(Exception e){throw new AssertionError(e);}});assertEquals(0,api.count("/reaction"));assertEquals(0,api.count("/read"));
  }
 }
 @Test public void actualPhotoVoiceAndVideoSendPathsPreserveTheSelectedQuote()throws Exception{
  for(String kind:new String[]{"photo","voice","video"}){Api api=new Api();try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){start(s,api);click(s,"Απάντηση");
   final byte[] video=kind.equals("video")?videoAsset():null;
   s.onActivity(a->{try{if(kind.equals("photo"))((PhotoBatch)get(a,"photos")).add(new byte[]{1,2},"image/jpeg");if(kind.equals("voice"))set(a,"voiceDraft",VoiceData.fromPcm(new short[]{1,2},2));if(kind.equals("video"))set(a,"videoDraft",video);((EditText)get(a,"composer")).setText("Media quote");invoke(a,"send");}catch(Exception e){throw new AssertionError(e);}});idle(s);
   Request sent=null;for(Request r:api.calls)if(r.method.equals("POST")&&(r.path.endsWith("/messages")||r.path.endsWith("/voice-messages")||r.path.endsWith("/video-messages")))sent=r;assertNotNull(kind,sent);assertEquals("fixture-message",sent.body.getString("replyToId"));assertNotNull(sent.body.optJSONObject("attachment"));assertEquals(0,api.count("/read"));
  }}
 }
}
