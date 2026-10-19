package gr.myworkstation.chat;

import android.content.Context;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.app.Activity;
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
        new TokenVault(context).clear(); TokenVault.pendingTwoFactor(context).clear(); CaptureBuffer.clear();
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
        volatile boolean holdGet;
        final CountDownLatch getStarted = new CountDownLatch(1), getRelease = new CountDownLatch(1);
        final CountDownLatch started = new CountDownLatch(1), release = new CountDownLatch(1);
        @Override JSONObject json(String path, String method, JSONObject body, String token) throws Exception {
            assertTrue(path.startsWith("/api/store-chat/stores/fixture-store/messages"));
            assertEquals("isolated-fixture-token", token);
            if (method.equals("GET")) {
                if (holdGet) { getStarted.countDown(); if (!getRelease.await(5, TimeUnit.SECONDS)) throw new AssertionError("GET fixture release timed out"); }
                return new JSONObject().put("store", store()).put("rows", new JSONArray()).put("settings", new JSONObject().put("photosEnabled", enabled));
            }
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
    @Test public void quickReplyNeedsExplicitDraftChoiceAndExplicitSend() throws Exception {
        FixtureApi api = new FixtureApi();
        try (ActivityScenario<MainActivity> scenario = open(api)) {
            scenario.onActivity(a -> {
                try {
                    EditText target = (EditText) get(a, "composer"); target.setText("Existing draft");
                    invoke(a, "pickReply"); android.app.AlertDialog picker = (android.app.AlertDialog) get(a, "replyDialog");
                    picker.getListView().performItemClick(null, 0, 0);
                    assertEquals("Existing draft", target.getText().toString()); assertEquals(0, api.posts.size());
                    android.app.AlertDialog confirm = (android.app.AlertDialog) get(a, "replyDialog");
                    confirm.getButton(android.content.DialogInterface.BUTTON_POSITIVE).performClick();
                } catch (Exception e) { throw new AssertionError(e); }
            });
            // AlertDialog posts its button listener to the main Handler. Observe after dispatch.
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            scenario.onActivity(a -> {
                try {
                    EditText target = (EditText) get(a, "composer");
                    assertEquals("Existing draft\n" + QuickReplies.choices()[0], target.getText().toString());
                    assertEquals(0, api.posts.size()); invoke(a, "send");
                } catch (Exception e) { throw new AssertionError(e); }
            });
            awaitIdle(scenario); assertEquals(1, api.posts.size());
            assertEquals("Existing draft\n" + QuickReplies.choices()[0], api.posts.get(0).getString("body"));
            assertFalse(api.posts.get(0).has("attachment"));
        }
    }
    @Test public void quickReplyCancelKeepsDraftAndBackgroundDismissesPicker() throws Exception {
        FixtureApi api = new FixtureApi();
        android.app.AlertDialog[] picker = {null}; EditText[] target = {null};
        try (ActivityScenario<MainActivity> scenario = open(api)) {
            scenario.onActivity(a -> {
                try {
                    target[0] = (EditText) get(a, "composer"); target[0].setText("Keep draft");
                    invoke(a, "pickReply");
                    ((android.app.AlertDialog) get(a, "replyDialog")).getListView().performItemClick(null, 1, 1);
                    ((android.app.AlertDialog) get(a, "replyDialog")).getButton(android.content.DialogInterface.BUTTON_NEGATIVE).performClick();
                    assertEquals("Keep draft", target[0].getText().toString());
                    invoke(a, "pickReply"); picker[0] = (android.app.AlertDialog) get(a, "replyDialog");
                    assertTrue(picker[0].isShowing());
                } catch (Exception e) { throw new AssertionError(e); }
            });
            scenario.moveToState(Lifecycle.State.CREATED);
            assertFalse(picker[0].isShowing()); assertEquals("", target[0].getText().toString()); assertEquals(0, api.posts.size());
        }
    }
    @Test public void uncertainSendGatePreventsQuickReplySelection() throws Exception {
        FixtureApi api = new FixtureApi();
        try (ActivityScenario<MainActivity> scenario = open(api)) {
            scenario.onActivity(a -> {
                try {
                    set(a, "uncertainStoreId", "fixture-store"); invoke(a, "pickReply");
                    assertNull(get(a, "replyDialog")); assertEquals(0, api.posts.size());
                } catch (Exception e) { throw new AssertionError(e); }
            });
        }
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
    @Test public void typingTheNextDraftDuringUploadDoesNotSendOrEraseIt() throws Exception {
        FixtureApi api = new FixtureApi(); api.hold = true;
        try (ActivityScenario<MainActivity> scenario = open(api)) {
            prepareAndSend(scenario); assertTrue(api.started.await(5, TimeUnit.SECONDS));
            scenario.onActivity(a -> {
                try { ((EditText) get(a, "composer")).setText("Next private draft"); }
                catch (Exception e) { throw new AssertionError(e); }
            });
            api.release.countDown(); awaitIdle(scenario); assertEquals(3, api.posts.size());
            assertEquals("Caption once", api.posts.get(0).getString("body"));
            assertEquals("", api.posts.get(1).getString("body")); assertEquals("", api.posts.get(2).getString("body"));
            scenario.onActivity(a -> {
                try { assertEquals("Next private draft", ((EditText) get(a, "composer")).getText().toString()); }
                catch (Exception e) { throw new AssertionError(e); }
            });
        } finally { api.release.countDown(); }
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
    @Test public void oversizedOrUnsupportedPickerSelectionIsRejectedWithoutPartialReplacement() throws Exception {
        FixtureApi api = new FixtureApi();
        try (ActivityScenario<MainActivity> scenario = open(api)) {
            scenario.onActivity(a -> {
                try {
                    PhotoBatch batch = (PhotoBatch) get(a, "photos"); byte[] original = {7}; batch.add(original, "image/jpeg");
                    for (boolean tooMany : new boolean[]{true, false}) {
                        set(a, "photoToken", "isolated-fixture-token"); set(a, "photoBinding", "fixture-store");
                        Intent picked = new Intent();
                        if (tooMany) {
                            ClipData clip = ClipData.newRawUri("fixture", Uri.parse("content://isolated/1"));
                            for (int i = 1; i < 6; i++) clip.addItem(new ClipData.Item(Uri.parse("content://isolated/" + i)));
                            picked.setClipData(clip);
                        } else picked.setData(Uri.parse("file:///must-never-read.jpg"));
                        a.onActivityResult(41, Activity.RESULT_OK, picked);
                        assertEquals(1, batch.size()); assertSame(original, batch.get(0).bytes);
                        assertFalse(((String) get(a, "photoSelectionNotice")).isEmpty());
                    }
                } catch (Exception e) { throw new AssertionError(e); }
            });
            assertEquals(0, api.posts.size());
        }
    }
    @Test public void galleryContentProviderSelectionSendsBothImagesAfterResume() throws Exception {
        FixtureApi api = new FixtureApi();
        try (ActivityScenario<MainActivity> scenario = open(api)) {
            // A stopped gallery round-trip must not depend on injected PhotoBatch bytes.
            scenario.moveToState(Lifecycle.State.CREATED);
            scenario.moveToState(Lifecycle.State.STARTED);
            scenario.onActivity(a -> {
                try {
                    set(a, "photoToken", "isolated-fixture-token"); set(a, "photoBinding", "fixture-store");
                    ClipData clip = ClipData.newRawUri("fixture", Uri.parse("content://" + GalleryFixtureProvider.AUTHORITY + "/1"));
                    clip.addItem(new ClipData.Item(Uri.parse("content://" + GalleryFixtureProvider.AUTHORITY + "/2")));
                    Intent picked = new Intent(); picked.setClipData(clip);
                    a.onActivityResult(41, Activity.RESULT_OK, picked);
                    assertEquals("", get(a, "photoSelectionNotice"));
                    assertEquals(2, ((PhotoBatch) get(a, "photos")).size());
                } catch (Exception e) { throw new AssertionError(e); }
            });
            scenario.moveToState(Lifecycle.State.RESUMED); awaitIdle(scenario);
            scenario.onActivity(a -> {
                try {
                    assertTrue(((android.widget.TextView) get(a, "attachmentLabel")).getText().toString().contains("2 φωτογραφίες"));
                    invoke(a, "send");
                } catch (Exception e) { throw new AssertionError(e); }
            });
            awaitIdle(scenario);
            assertEquals(2, api.posts.size());
            assertEquals("data:image/jpeg;base64,AQI=", api.posts.get(0).getJSONObject("attachment").getString("dataUrl"));
            assertEquals("data:image/jpeg;base64,AwQ=", api.posts.get(1).getJSONObject("attachment").getString("dataUrl"));
        }
    }
    @Test public void refreshDisablesSendAndNeverDefersAUserPost() throws Exception {
        FixtureApi api = new FixtureApi();
        try (ActivityScenario<MainActivity> scenario = open(api)) {
            api.holdGet = true;
            scenario.onActivity(a -> {
                try {
                    PhotoBatch batch = (PhotoBatch) get(a, "photos");
                    batch.add(new byte[]{1, 2}, "image/jpeg"); batch.add(new byte[]{3, 4}, "image/jpeg");
                    invoke(a, "conversation");
                    ((EditText) get(a, "composer")).setText("Keep this caption");
                } catch (Exception e) { throw new AssertionError(e); }
            });
            assertTrue(api.getStarted.await(3, TimeUnit.SECONDS));
            scenario.onActivity(a -> {
                try {
                    assertFalse(((android.widget.Button) get(a, "chatSendButton")).isEnabled());
                    assertEquals("Ανανέωση μηνυμάτων…", ((android.widget.TextView) get(a, "notice")).getText().toString());
                    invoke(a, "send"); // busy guard remains even if invoked outside normal disabled touch input
                    assertEquals(2, ((PhotoBatch) get(a, "photos")).size());
                } catch (Exception e) { throw new AssertionError(e); }
            });
            assertEquals(0, api.posts.size());
            api.holdGet = false; api.getRelease.countDown(); awaitIdle(scenario);
            assertEquals("Refresh completion must never auto-send", 0, api.posts.size());
            scenario.onActivity(a -> {
                try {
                    android.widget.Button button = (android.widget.Button) get(a, "chatSendButton");
                    assertTrue(button.isEnabled());
                    assertEquals("Keep this caption", ((EditText) get(a, "composer")).getText().toString());
                    button.performClick();
                } catch (Exception e) { throw new AssertionError(e); }
            });
            awaitIdle(scenario); assertEquals(2, api.posts.size());
            assertEquals("Keep this caption", api.posts.get(0).getString("body"));
            assertEquals("", api.posts.get(1).getString("body"));
        } finally { api.getRelease.countDown(); }
    }
    @Test public void cameraBatchResultSendsBothOnlyAfterExplicitSend() throws Exception {
        FixtureApi api = new FixtureApi();
        try (ActivityScenario<MainActivity> scenario = open(api)) {
            scenario.onActivity(a -> {
                try {
                    PhotoBatch batch = new PhotoBatch(); batch.add(new byte[]{1,2}, "image/jpeg"); batch.add(new byte[]{3,4}, "image/jpeg");
                    CaptureBuffer.put(batch); set(a, "photoToken", "isolated-fixture-token"); set(a, "photoBinding", "fixture-store");
                    a.onActivityResult(42, Activity.RESULT_OK, null);
                    assertEquals(2, ((PhotoBatch)get(a,"photos")).size()); assertEquals(0,api.posts.size());
                    invoke(a,"send");
                } catch(Exception e) { throw new AssertionError(e); }
            });
            awaitIdle(scenario); assertEquals(2,api.posts.size());
            assertEquals("data:image/jpeg;base64,AQI=",api.posts.get(0).getJSONObject("attachment").getString("dataUrl"));
            assertEquals("data:image/jpeg;base64,AwQ=",api.posts.get(1).getJSONObject("attachment").getString("dataUrl"));
        }
    }
    @Test public void staleCameraBatchIsWipedWithoutReplacingCurrentSelection() throws Exception {
        FixtureApi api = new FixtureApi(); byte[] first={1,2},second={3,4},current={7};
        try (ActivityScenario<MainActivity> scenario = open(api)) {
            scenario.onActivity(a -> {
                try {
                    ((PhotoBatch)get(a,"photos")).add(current,"image/jpeg");
                    PhotoBatch batch=new PhotoBatch();batch.add(first,"image/jpeg");batch.add(second,"image/jpeg");CaptureBuffer.put(batch);
                    set(a,"photoToken","different-old-session");set(a,"photoBinding","fixture-store");a.onActivityResult(42,Activity.RESULT_OK,null);
                    assertEquals(1,((PhotoBatch)get(a,"photos")).size());assertSame(current,((PhotoBatch)get(a,"photos")).get(0).bytes);
                }catch(Exception e){throw new AssertionError(e);}
            });
            assertArrayEquals(new byte[]{0,0},first);assertArrayEquals(new byte[]{0,0},second);assertEquals(0,api.posts.size());assertNull(CaptureBuffer.take());
        }
    }
    @Test public void disabledPhotoSettingPreventsTheFirstPost() throws Exception {
        FixtureApi api = new FixtureApi(); api.enabled = false;
        try (ActivityScenario<MainActivity> scenario = open(api)) {
            prepareAndSend(scenario); awaitIdle(scenario); assertEquals(0, api.posts.size());
        }
    }
}
