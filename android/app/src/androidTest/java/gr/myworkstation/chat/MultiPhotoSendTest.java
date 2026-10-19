package gr.myworkstation.chat;

import android.content.Context;
import android.widget.EditText;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Real Activity send/lifecycle boundaries; transport and photo bytes are isolated fixtures. */
@RunWith(AndroidJUnit4.class)
public class MultiPhotoSendTest {
    @Before public void clear() {
        Context context = ApplicationProvider.getApplicationContext();
        new TokenVault(context).clear(); TokenVault.pendingTwoFactor(context).clear();
    }
    @After public void clean() { clear(); }
    private static Object get(MainActivity a, String name) throws Exception {
        Field f = MainActivity.class.getDeclaredField(name); f.setAccessible(true); return f.get(a);
    }
    private static void set(MainActivity a, String name, Object value) throws Exception {
        Field f = MainActivity.class.getDeclaredField(name); f.setAccessible(true); f.set(a, value);
    }
    private static void invoke(MainActivity a, String name) throws Exception {
        Method m = MainActivity.class.getDeclaredMethod(name); m.setAccessible(true); m.invoke(a);
    }
    private static JSONObject store() throws Exception { return new JSONObject().put("id", "fixture-store").put("companyId", "fixture-company").put("name", "Isolated photo store"); }
    private static final class FixtureApi extends ChatApi {
        final List<JSONObject> posts = new CopyOnWriteArrayList<>();
        boolean enabled = true, unknownSecond, hold;
        final CountDownLatch started = new CountDownLatch(1), release = new CountDownLatch(1);
        @Override JSONObject json(String path, String method, JSONObject body, String token) throws Exception {
            assertTrue(path.startsWith("/api/store-chat/stores/fixture-store/messages"));
            assertEquals("isolated-fixture-token", token);
            if (method.equals("GET")) return new JSONObject().put("store", store()).put("rows", new JSONArray()).put("settings", new JSONObject().put("photosEnabled", enabled));
            assertEquals("POST", method); posts.add(new JSONObject(body.toString())); started.countDown();
            if (hold && !release.await(5, TimeUnit.SECONDS)) throw new AssertionError("fixture release timed out");
            if (unknownSecond && posts.size() == 2) return new JSONObject().put("ok", true); // no durable receipt
            return new JSONObject().put("ok", true).put("id", "fixture-message-" + posts.size());
        }
    }
    private ActivityScenario<MainActivity> open(FixtureApi api) throws Exception {
        ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class);
        scenario.onActivity(a -> {
            try {
                set(a, "api", api); set(a, "token", "isolated-fixture-token"); set(a, "selected", store());
                set(a, "identity", new JSONObject().put("id", "fixture-owner").put("role", "OWNER").put("tokenType", "BACKOFFICE_USER"));
                invoke(a, "conversation");
            } catch (Exception e) { throw new AssertionError(e); }
        });
        awaitIdle(scenario); return scenario;
    }
    private void awaitIdle(ActivityScenario<MainActivity> scenario) throws Exception {
        for (int i = 0; i < 100; i++) {
            boolean[] idle = {false}; scenario.onActivity(a -> { try { idle[0] = !(Boolean) get(a, "busy"); } catch (Exception e) { throw new AssertionError(e); } });
            if (idle[0]) return; Thread.sleep(50);
        }
        fail("Activity did not become idle");
    }
    private byte[][] prepareAndSend(ActivityScenario<MainActivity> scenario) {
        byte[][] bytes = {{1,2}, {3,4}, {5,6}};
        scenario.onActivity(a -> {
            try {
                PhotoBatch batch = (PhotoBatch) get(a, "photos");
                for (byte[] image : bytes) batch.add(image, "image/jpeg");
                ((EditText) get(a, "composer")).setText("Caption once"); invoke(a, "send");
            } catch (Exception e) { throw new AssertionError(e); }
        }); return bytes;
    }
    @Test public void confirmedReceiptsConsumeInOrderAndCaptionIsSentOnce() throws Exception {
        FixtureApi api = new FixtureApi();
        try (ActivityScenario<MainActivity> scenario = open(api)) {
            byte[][] bytes = prepareAndSend(scenario); awaitIdle(scenario);
            assertEquals(3, api.posts.size()); assertEquals("Caption once", api.posts.get(0).getString("body"));
            assertEquals("", api.posts.get(1).getString("body")); assertEquals("", api.posts.get(2).getString("body"));
            for (byte[] image : bytes) assertArrayEquals(new byte[]{0,0}, image);
            assertTrue(api.posts.get(0).getJSONObject("attachment").getString("dataUrl").endsWith("AQI="));
            assertTrue(api.posts.get(2).getJSONObject("attachment").getString("dataUrl").endsWith("BQY="));
        }
    }
    @Test public void missingSecondReceiptStopsWithoutReplayingOrSendingThird() throws Exception {
        FixtureApi api = new FixtureApi(); api.unknownSecond = true;
        try (ActivityScenario<MainActivity> scenario = open(api)) {
            byte[][] bytes = prepareAndSend(scenario); awaitIdle(scenario);
            assertEquals(2, api.posts.size()); assertArrayEquals(new byte[]{0,0}, bytes[0]);
            scenario.onActivity(a -> {
                try {
                    assertEquals("fixture-store", get(a, "uncertainStoreId"));
                    assertEquals(2, ((PhotoBatch) get(a, "photos")).size()); invoke(a, "send");
                } catch (Exception e) { throw new AssertionError(e); }
            });
            awaitIdle(scenario); assertEquals(2, api.posts.size());
        }
    }
    @Test public void backgroundErasesRemainingImagesAndLateReceiptCannotAdvance() throws Exception {
        FixtureApi api = new FixtureApi(); api.hold = true;
        try (ActivityScenario<MainActivity> scenario = open(api)) {
            byte[][] bytes = prepareAndSend(scenario); assertTrue(api.started.await(5, TimeUnit.SECONDS));
            scenario.moveToState(Lifecycle.State.CREATED); api.release.countDown();
            for (byte[] image : bytes) assertArrayEquals(new byte[]{0,0}, image);
            scenario.moveToState(Lifecycle.State.RESUMED); awaitIdle(scenario); assertEquals(1, api.posts.size());
        } finally { api.release.countDown(); }
    }
    @Test public void disabledPhotoSettingPreventsTheFirstPost() throws Exception {
        FixtureApi api = new FixtureApi(); api.enabled = false;
        try (ActivityScenario<MainActivity> scenario = open(api)) {
            prepareAndSend(scenario); awaitIdle(scenario); assertEquals(0, api.posts.size());
        }
    }
}
