package gr.myworkstation.chat;
import android.app.AlertDialog;import android.content.Context;import android.view.View;import android.view.ViewGroup;import android.view.WindowManager;import android.widget.EditText;import android.widget.TextView;
import androidx.lifecycle.Lifecycle;import androidx.test.core.app.ActivityScenario;import androidx.test.core.app.ApplicationProvider;import androidx.test.ext.junit.runners.AndroidJUnit4;import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;import java.lang.reflect.Method;import java.util.concurrent.CopyOnWriteArrayList;import java.util.concurrent.CountDownLatch;import java.util.concurrent.TimeUnit;
import org.json.JSONArray;import org.json.JSONObject;import org.junit.Before;import org.junit.After;import org.junit.Test;import org.junit.runner.RunWith;import static org.junit.Assert.*;
/** Actual Activity/dialogs/worker with isolated synthetic transport. No production calls. */
@RunWith(AndroidJUnit4.class)
public class ChatSearchForwardActivityTest {
 @Before public void clear(){Context c=ApplicationProvider.getApplicationContext();new TokenVault(c).clear();TokenVault.pendingTwoFactor(c).clear();}
 @After public void clean(){clear();}
 private Object get(MainActivity a,String n)throws Exception{Field f=MainActivity.class.getDeclaredField(n);f.setAccessible(true);return f.get(a);}
 private void set(MainActivity a,String n,Object v)throws Exception{Field f=MainActivity.class.getDeclaredField(n);f.setAccessible(true);f.set(a,v);}
 private void invoke(MainActivity a,String n)throws Exception{Method m=MainActivity.class.getDeclaredMethod(n);m.setAccessible(true);m.invoke(a);}
 private View find(View root,String text){if(root instanceof TextView&&((TextView)root).getText().toString().equals(text))return root;if(root instanceof ViewGroup)for(int i=0;i<((ViewGroup)root).getChildCount();i++){View v=find(((ViewGroup)root).getChildAt(i),text);if(v!=null)return v;}return null;}
 private EditText edit(View root){if(root instanceof EditText)return (EditText)root;if(root instanceof ViewGroup)for(int i=0;i<((ViewGroup)root).getChildCount();i++){EditText v=edit(((ViewGroup)root).getChildAt(i));if(v!=null)return v;}return null;}
 private static JSONObject store()throws Exception{return new JSONObject().put("id","fixture-store").put("companyId","fixture-company").put("name","CI Source");}
 private static JSONObject row(String id,String body)throws Exception{return new JSONObject().put("id",id).put("senderId","other").put("senderName","CI Other").put("body",body).put("category","GENERAL").put("createdAt","2026-11-01T00:00:00Z").put("readByMe",true).put("deliveredByMe",true);}
 private static class Request{final String path,method;final JSONObject body;Request(String p,String m,JSONObject b)throws Exception{path=p;method=m;body=b==null?null:new JSONObject(b.toString());}}
 private static class Api extends ChatApi{
  final CopyOnWriteArrayList<Request> calls=new CopyOnWriteArrayList<>();boolean canForward=true,failFirstForward,foreignSearch;int forwards;CountDownLatch entered,release;
  @Override public JSONObject json(String path,String method,JSONObject body,String token)throws Exception{
   assertEquals("fixture-token",token);calls.add(new Request(path,method,body));
   if(path.endsWith("/messages?limit=100"))return new JSONObject().put("store",store()).put("rows",new JSONArray().put(row("current","Current message"))).put("interactionsAvailable",true).put("searchForwardAvailable",true).put("settings",new JSONObject()).put("permissions",new JSONObject().put("canForward",canForward));
   if(path.contains("/messages/search?")){
    if(entered!=null){entered.countDown();if(!release.await(5,TimeUnit.SECONDS))throw new AssertionError("Search fixture was not released");}
    android.net.Uri uri=android.net.Uri.parse("https://fixture.invalid"+path);boolean next=uri.getQueryParameter("before")!=null;
    return new JSONObject().put("store",foreignSearch?store().put("companyId","foreign-company"):store()).put("q",uri.getQueryParameter("q")).put("rows",new JSONArray().put(row(next?"older-b":"older-a",next?"Second page":"Old archive"))).put("nextCursor",next?JSONObject.NULL:"older-a");
   }
   if(path.endsWith("/forward-targets"))return new JSONObject().put("store",store()).put("stores",new JSONArray().put(new JSONObject().put("id","target").put("companyId","fixture-company").put("companyName","CI Company").put("name","CI Destination")));
   if(path.endsWith("/forward")){forwards++;if(failFirstForward&&forwards==1)throw new java.io.IOException("Synthetic loss after commit");return new JSONObject().put("ok",true).put("id","forwarded-fixture").put("targetStoreId","target").put("replayed",forwards>1);}
   throw new AssertionError("Unexpected mutation or transport: "+method+" "+path);
  }
  int posts(){int n=0;for(Request r:calls)if(r.method.equals("POST"))n++;return n;}
 }
 private void idle(ActivityScenario<MainActivity> s)throws Exception{for(int i=0;i<150;i++){boolean[] ready={false};s.onActivity(a->{try{ready[0]=!(boolean)get(a,"busy")&&(boolean)get(a,"searchForwardReady");}catch(Exception e){throw new AssertionError(e);}});if(ready[0])return;Thread.sleep(20);}fail("Synthetic request did not finish");}
 private void start(ActivityScenario<MainActivity> s,Api api)throws Exception{s.onActivity(a->{try{set(a,"api",api);set(a,"token","fixture-token");set(a,"identity",new JSONObject().put("id","actor").put("role",api.canForward?"OWNER":"EMPLOYEE").put("tokenType",api.canForward?"BACKOFFICE_USER":"STORE_OPERATOR"));set(a,"selected",store());invoke(a,"conversation");}catch(Exception e){throw new AssertionError(e);}});idle(s);}
 private AlertDialog dialog(MainActivity a)throws Exception{return (AlertDialog)get(a,"imageDialog");}
 private void clickRoot(ActivityScenario<MainActivity> s,String text)throws Exception{s.onActivity(a->{try{View v=find((View)get(a,"root"),text);assertNotNull(text,v);v.performClick();}catch(Exception e){throw new AssertionError(e);}});idle(s);}
 private void clickDialog(ActivityScenario<MainActivity> s,String text)throws Exception{s.onActivity(a->{try{View v=find(dialog(a).getWindow().getDecorView(),text);assertNotNull(text,v);v.performClick();}catch(Exception e){throw new AssertionError(e);}});idle(s);}
 private void search(ActivityScenario<MainActivity> s,String term)throws Exception{clickRoot(s,"Αναζήτηση μηνυμάτων");s.onActivity(a->{try{assertTrue((dialog(a).getWindow().getAttributes().flags&WindowManager.LayoutParams.FLAG_SECURE)!=0);edit(dialog(a).getWindow().getDecorView()).setText(term);}catch(Exception e){throw new AssertionError(e);}});clickDialog(s,"Αναζήτηση ιστορικού");}
 @Test public void actualHistorySearchPagesAndRepliesWithoutAnyAutomaticReadDeliveryOrAck()throws Exception{
  Api api=new Api();try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){start(s,api);search(s,"archive");clickDialog(s,"Επόμενα αποτελέσματα");clickDialog(s,"CI Other\nSecond page");
   s.onActivity(a->{try{assertTrue((dialog(a).getWindow().getAttributes().flags&WindowManager.LayoutParams.FLAG_SECURE)!=0);dialog(a).getButton(AlertDialog.BUTTON_POSITIVE).performClick();}catch(Exception e){throw new AssertionError(e);}});
   InstrumentationRegistry.getInstrumentation().waitForIdleSync();
   s.onActivity(a->{try{assertNotNull(get(a,"quotedMessage"));assertEquals("older-b",((JSONObject)get(a,"quotedMessage")).getString("id"));}catch(Exception e){throw new AssertionError(e);}});assertEquals(0,api.posts());
  }
 }
 @Test public void actualForwardRequiresSelectionAndConfirmationAndRetryUsesTheSameIntent()throws Exception{
  Api api=new Api();api.failFirstForward=true;try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){start(s,api);clickRoot(s,"Προώθηση");assertEquals(0,api.posts());
   s.onActivity(a->{try{assertEquals(1,dialog(a).getListView().getAdapter().getCount());assertTrue((dialog(a).getWindow().getAttributes().flags&WindowManager.LayoutParams.FLAG_SECURE)!=0);dialog(a).getListView().performItemClick(null,0,0);}catch(Exception e){throw new AssertionError(e);}});assertEquals(0,api.posts());
   for(int i=0;i<2;i++){s.onActivity(a->{try{dialog(a).getButton(AlertDialog.BUTTON_POSITIVE).performClick();}catch(Exception e){throw new AssertionError(e);}});idle(s);}
   assertEquals(2,api.posts());Request first=null;for(Request r:api.calls)if(r.method.equals("POST")){assertEquals("target",r.body.getString("targetStoreId"));assertEquals(3,r.body.length());assertEquals("fixture-company",r.body.getString("targetCompanyId"));if(first==null)first=r;else assertEquals(first.body.getString("requestId"),r.body.getString("requestId"));}s.onActivity(a->{try{assertNull(get(a,"imageDialog"));assertEquals("",get(a,"uncertainForwardStoreId"));}catch(Exception e){throw new AssertionError(e);}});
  }
 }
 @Test public void changedQueryRejectsLateResultsAndBackgroundClosesPrivateSearch()throws Exception{
  Api api=new Api();api.entered=new CountDownLatch(1);api.release=new CountDownLatch(1);
  try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){start(s,api);clickRoot(s,"Αναζήτηση μηνυμάτων");
   s.onActivity(a->{try{AlertDialog d=dialog(a);edit(d.getWindow().getDecorView()).setText("archive");find(d.getWindow().getDecorView(),"Αναζήτηση ιστορικού").performClick();}catch(Exception e){throw new AssertionError(e);}});assertTrue(api.entered.await(3,TimeUnit.SECONDS));
   s.onActivity(a->{try{edit(dialog(a).getWindow().getDecorView()).setText("changed");}catch(Exception e){throw new AssertionError(e);}});api.release.countDown();idle(s);
   final MainActivity[] saved={null};s.onActivity(a->{try{assertNull(find(dialog(a).getWindow().getDecorView(),"CI Other\nOld archive"));saved[0]=a;}catch(Exception e){throw new AssertionError(e);}});s.moveToState(Lifecycle.State.CREATED);
   InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{try{assertNull(get(saved[0],"imageDialog"));assertFalse((boolean)get(saved[0],"searchForwardReady"));}catch(Exception e){throw new AssertionError(e);}});assertEquals(0,api.posts());
  }finally{api.release.countDown();}
 }
 @Test public void foreignSearchResponseIsRejectedAndStaffNeverGetsForwardControls()throws Exception{
  Api api=new Api();api.canForward=false;api.foreignSearch=true;try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){start(s,api);s.onActivity(a->{try{assertNull(find((View)get(a,"root"),"Προώθηση"));}catch(Exception e){throw new AssertionError(e);}});search(s,"archive");s.onActivity(a->{try{assertNull(find(dialog(a).getWindow().getDecorView(),"CI Other\nOld archive"));assertNull(get(a,"quotedMessage"));}catch(Exception e){throw new AssertionError(e);}});assertEquals(0,api.posts());}
 }
 @Test public void staleStoreOrTokenCannotInvokeCapturedForwardButton()throws Exception{
  Api api=new Api();try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){start(s,api);clickRoot(s,"Προώθηση");
   s.onActivity(a->{try{dialog(a).getListView().performItemClick(null,0,0);View send=dialog(a).getButton(AlertDialog.BUTTON_POSITIVE);set(a,"selected",store().put("companyId","foreign"));send.performClick();assertEquals(0,api.posts());set(a,"selected",store());set(a,"token","changed");send.performClick();assertEquals(0,api.posts());}catch(Exception e){throw new AssertionError(e);}});
  }
 }
}
