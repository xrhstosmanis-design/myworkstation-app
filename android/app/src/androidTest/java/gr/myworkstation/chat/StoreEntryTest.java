package gr.myworkstation.chat;

import android.content.Context;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.TextView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Exercises actual store-row clicks with an in-memory transport; never contacts production. */
@RunWith(AndroidJUnit4.class)
public class StoreEntryTest {
    @Before public void clear() {
        Context context = ApplicationProvider.getApplicationContext();
        new TokenVault(context).clear(); TokenVault.pendingTwoFactor(context).clear();
    }
    @After public void clean() { clear(); }
    private JSONObject identity(boolean platform) throws Exception {
        return new JSONObject().put("id", "isolated-owner").put("role", "OWNER")
            .put("platformRole", platform ? "SUPER_ADMIN" : "OWNER").put("isSuperAdmin", platform)
            .put("tokenType", "BACKOFFICE_USER").put("companyId", "company-a");
    }
    private static final class FixtureApi extends ChatApi {
        final boolean platform;
        final List<String> requests = new CopyOnWriteArrayList<>();
        FixtureApi(boolean platform) { this.platform = platform; }
        @Override JSONObject json(String path, String method, JSONObject body, String token) throws Exception {
            requests.add(method + " " + path);
            JSONObject store = new JSONObject().put("id", "store-b").put("companyId", "company-b").put("name", "Isolated store B");
            if (path.equals("/api/store-chat/mobile/stores")) return new JSONObject().put("stores", new JSONArray().put(store));
            if (path.equals("/api/auth/owner-companies/select")) {
                if (platform) throw new Failure(403, "Owner-only endpoint");
                assertEquals("company-b", body.getString("companyId"));
                JSONObject claims = new JSONObject().put("id", "isolated-owner").put("companyId", "company-b")
                    .put("role", "OWNER").put("platformRole", "OWNER").put("isSuperAdmin", false)
                    .put("tokenType", "BACKOFFICE_USER").put("exp", System.currentTimeMillis() / 1000 + 300);
                String value = "header." + Base64.encodeToString(claims.toString().getBytes(StandardCharsets.UTF_8), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING) + ".signature";
                return new JSONObject().put("token", value);
            }
            if (path.equals("/api/store-chat/stores/store-b/messages?limit=100")) return new JSONObject().put("store", store).put("rows", new JSONArray());
            throw new AssertionError("Unexpected fixture request: " + method + " " + path);
        }
    }
    private View find(View view, String value, boolean input) {
        if (input && view instanceof EditText && value.contentEquals(((EditText) view).getHint())) return view;
        if (!input && view instanceof TextView && ((TextView) view).getText().toString().contains(value)) return view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int n = 0; n < group.getChildCount(); n++) { View result = find(group.getChildAt(n), value, input); if (result != null) return result; }
        }
        return null;
    }
    private void await(ActivityScenario<MainActivity> scenario, String value, boolean input) throws Exception {
        for (int n = 0; n < 100; n++) {
            boolean[] found = {false}; scenario.onActivity(activity -> found[0] = find(activity.getWindow().getDecorView(), value, input) != null);
            if (found[0]) return; Thread.sleep(50);
        }
        fail("Expected visible fixture control: " + value);
    }
    private void exercise(boolean platform) throws Exception {
        FixtureApi api = new FixtureApi(platform); JSONObject identity = identity(platform);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                try {
                    for (String name : new String[]{"api", "identity", "token"}) {
                        Field field = MainActivity.class.getDeclaredField(name); field.setAccessible(true);
                        field.set(activity, name.equals("api") ? api : name.equals("identity") ? identity : "isolated-fixture-token");
                    }
                    Method stores = MainActivity.class.getDeclaredMethod("stores"); stores.setAccessible(true); stores.invoke(activity);
                } catch (Exception error) { throw new AssertionError(error); }
            });
            await(scenario, "Isolated store B", false);
            scenario.onActivity(activity -> find(activity.getWindow().getDecorView(), "Isolated store B", false).performClick());
            await(scenario, "Γράψε μήνυμα…", true);
            await(scenario, "Δεν υπάρχουν ακόμη μηνύματα.", false);
            assertTrue(api.requests.contains("GET /api/store-chat/stores/store-b/messages?limit=100"));
            assertEquals(!platform, api.requests.contains("POST /api/auth/owner-companies/select"));
        }
    }
    @Test public void compatibilitySuperAdminOpensOtherCompanyStoreWithoutOwnerSwitch() throws Exception { exercise(true); }
    @Test public void ordinaryOwnerRetainsCompanySelectionBeforeOpeningStore() throws Exception { exercise(false); }
}
