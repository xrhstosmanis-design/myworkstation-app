package gr.myworkstation.chat;

import android.app.AlertDialog;
import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Actual UI and lifecycle, synthetic authorized data; no production transport or read write. */
@RunWith(AndroidJUnit4.class)
public class ReadReceiptsActivityTest {
    @Before public void clear() { Context c=ApplicationProvider.getApplicationContext();new TokenVault(c).clear();TokenVault.pendingTwoFactor(c).clear(); }
    @After public void clean() { clear(); }
    private Object get(MainActivity a,String name)throws Exception {Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);return f.get(a);}
    private void set(MainActivity a,String name,Object value)throws Exception {Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);f.set(a,value);}
    private void navigate(MainActivity a)throws Exception {Method m=MainActivity.class.getDeclaredMethod("navigate");m.setAccessible(true);m.invoke(a);}
    private JSONObject store(String id)throws Exception {return new JSONObject().put("id",id).put("companyId","fixture-company");}
    private View find(View view,String text) {
        if(view instanceof TextView&&((TextView)view).getText().toString().equals(text))return view;
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){View found=find(((ViewGroup)view).getChildAt(i),text);if(found!=null)return found;}
        return null;
    }
    private View render(MainActivity a,boolean own,JSONArray readers)throws Exception {
        LinearLayout root=new LinearLayout(a);root.setOrientation(LinearLayout.VERTICAL);a.setContentView(root);
        set(a,"root",root);set(a,"messages",root);set(a,"selected",store("fixture-store"));set(a,"token","fixture-token");
        set(a,"identity",new JSONObject().put("id","sender").put("role","OWNER"));
        set(a,"api",new ChatApi(){@Override JSONObject json(String p,String m,JSONObject b,String t){throw new AssertionError("Reader dialog must not make an API call");}});
        JSONObject row=new JSONObject().put("id","fixture-message").put("senderId","sender").put("readByMe",true).put("readers",readers);
        Method bubble=MainActivity.class.getDeclaredMethod("bubble",String.class,boolean.class,String.class,JSONObject.class);bubble.setAccessible(true);bubble.invoke(a,"Fixture",own,"Fixture metadata",row);
        return find(root,"Διαβάστηκε από 2");
    }
    private JSONArray readers()throws Exception {return new JSONArray().put(new JSONObject().put("id","A").put("name","Λεωνίδας")).put(new JSONObject().put("id","B").put("name","Μαρία"));}
    private void awaitNames(ActivityScenario<MainActivity> scenario)throws Exception {
        for(int i=0;i<100;i++){
            final boolean[] visible={false};
            scenario.onActivity(a->{try{AlertDialog d=(AlertDialog)get(a,"imageDialog");visible[0]=d!=null&&find(d.getWindow().getDecorView(),"Λεωνίδας")!=null&&find(d.getWindow().getDecorView(),"Μαρία")!=null;}catch(Exception e){throw new AssertionError(e);}});
            if(visible[0])return;Thread.sleep(30);
        }
        fail("Reader names were not rendered in the actual dialog");
    }
    @Test public void actualDialogShowsRecipientNamesIsPrivateAndClosesOnNavigation()throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(a->{try{
                View button=render(a,true,readers());assertNotNull(button);button.performClick();AlertDialog dialog=(AlertDialog)get(a,"imageDialog");
                assertTrue(dialog.isShowing());
            }catch(Exception e){throw new AssertionError(e);}});
            awaitNames(scenario);
            scenario.onActivity(a->{try{AlertDialog dialog=(AlertDialog)get(a,"imageDialog");
                assertTrue((dialog.getWindow().getAttributes().flags&WindowManager.LayoutParams.FLAG_SECURE)!=0);
                navigate(a);assertFalse(dialog.isShowing());assertNull(get(a,"imageDialog"));
            }catch(Exception e){throw new AssertionError(e);}});
        }
    }
    @Test public void emptyOwnReadDataOrIncomingMessagesHaveNoReaderButtonAndStaleScopesCannotOpenIt()throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(a->{try{
                assertNull(render(a,true,new JSONArray()));assertNull(render(a,false,readers()));
                View old=render(a,true,readers());set(a,"selected",store("other-store"));old.performClick();assertNull(get(a,"imageDialog"));
                old=render(a,true,readers());set(a,"selected",store("fixture-store").put("companyId","other-company"));old.performClick();assertNull(get(a,"imageDialog"));
                old=render(a,true,readers());set(a,"token","changed-account");old.performClick();assertNull(get(a,"imageDialog"));
                old=render(a,true,readers());navigate(a);old.performClick();assertNull(get(a,"imageDialog"));
            }catch(Exception e){throw new AssertionError(e);}});
        }
    }
    @Test public void backgroundDismissesAndClearsPrivateReaderDialog()throws Exception {
        final AlertDialog[] dialog={null};
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(a->{try{render(a,true,readers()).performClick();dialog[0]=(AlertDialog)get(a,"imageDialog");assertTrue(dialog[0].isShowing());}catch(Exception e){throw new AssertionError(e);}});
            scenario.moveToState(Lifecycle.State.CREATED);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->assertFalse(dialog[0].isShowing()));
        }
    }
}
