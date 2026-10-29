package gr.myworkstation.chat;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CopyOnWriteArrayList;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Real activity/lifecycle with synthetic transport, no production request or real credential. */
@RunWith(AndroidJUnit4.class)
public class FirstEntrySetupTest {
    @Before public void clear() { Context c=ApplicationProvider.getApplicationContext();new TokenVault(c).clear();TokenVault.pendingTwoFactor(c).clear(); }
    @After public void clean() { clear(); }
    private static String token(long seconds) throws Exception {
        JSONObject p=new JSONObject().put("id","fixture-operator").put("employeeId","fixture-employee").put("companyId","fixture-company").put("storeId","fixture-store").put("tokenType","STORE_CHAT_OPERATOR").put("role","EMPLOYEE").put("chatSessionId","fixture-session").put("exp",System.currentTimeMillis()/1000+seconds);
        return "header."+Base64.encodeToString(p.toString().getBytes(StandardCharsets.UTF_8),Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING)+".signature";
    }
    private static class FixtureApi extends ChatApi {
        final CopyOnWriteArrayList<String> paths=new CopyOnWriteArrayList<>();
        @Override JSONObject json(String path,String method,JSONObject body,String bearer) throws Exception {
            paths.add(method+" "+path);
            if(path.equals("/api/operators/stores/fixture-store/directory"))return new JSONObject().put("store",new JSONObject().put("id","fixture-store").put("name","Fixture shop")).put("operators",new JSONArray().put(new JSONObject().put("hasPin",true).put("employeeId","fixture-employee").put("displayName","Fixture employee")));
            if(path.equals("/api/store-chat/stores/fixture-store/mobile-renew"))return new JSONObject().put("token",token(30*86400));
            throw new AssertionError("Unexpected request: "+path);
        }
    }
    private void set(MainActivity a,String name,Object value) throws Exception {Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);f.set(a,value);}
    private boolean visible(View v,String text){if(v instanceof TextView&&((TextView)v).getText().toString().contains(text))return true;if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++)if(visible(((ViewGroup)v).getChildAt(i),text))return true;return false;}
    private void await(ActivityScenario<MainActivity> s,String text) throws Exception {for(int i=0;i<100;i++){boolean[] ok={false};s.onActivity(a->ok[0]=visible(a.getWindow().getDecorView(),text));if(ok[0])return;Thread.sleep(50);}fail("Missing fixture view: "+text);}
    @Test public void linkOpensVerifiedStorePinScreenAndNeverReplacesSignedInAccount() throws Exception {
        FixtureApi api=new FixtureApi();try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){
            s.onActivity(a->{try{set(a,"api",api);a.onNewIntent(new Intent(Intent.ACTION_VIEW,Uri.parse("myworkstation-chat://store/fixture-store")));}catch(Exception e){throw new AssertionError(e);}});
            await(s,"Fixture shop");assertEquals(1,api.paths.size());assertEquals("GET /api/operators/stores/fixture-store/directory",api.paths.get(0));
            s.onActivity(a->{try{String value=token(30*86400);set(a,"token",value);set(a,"identity",new JSONObject(new String(Base64.decode(value.split("\\.")[1],Base64.URL_SAFE),StandardCharsets.UTF_8)));a.onNewIntent(new Intent(Intent.ACTION_VIEW,Uri.parse("myworkstation-chat://store/other-store")));Field f=MainActivity.class.getDeclaredField("token");f.setAccessible(true);assertEquals(value,f.get(a));}catch(Exception e){throw new AssertionError(e);}});
            assertEquals(1,api.paths.size());
        }
    }
    @Test public void resumedEmployeeRenewsEncryptedConnectionWithoutPinAndDoesNotRenewAgainImmediately() throws Exception {
        FixtureApi api=new FixtureApi();try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){
            s.onActivity(a->{try{String value=token(3600);set(a,"api",api);set(a,"token",value);set(a,"identity",new JSONObject(new String(Base64.decode(value.split("\\.")[1],Base64.URL_SAFE),StandardCharsets.UTF_8)));}catch(Exception e){throw new AssertionError(e);}});
            s.moveToState(Lifecycle.State.CREATED);s.moveToState(Lifecycle.State.RESUMED);await(s,"Το κατάστημά μου");
            assertEquals(1,api.paths.size());assertEquals("POST /api/store-chat/stores/fixture-store/mobile-renew",api.paths.get(0));assertFalse(new TokenVault(ApplicationProvider.getApplicationContext()).load().isEmpty());
            s.moveToState(Lifecycle.State.CREATED);s.moveToState(Lifecycle.State.RESUMED);await(s,"Το κατάστημά μου");assertEquals(1,api.paths.size());
        }
    }
}
