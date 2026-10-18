package gr.myworkstation.chat;

import android.content.Context;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.TextView;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** No real account, server request, OTP verification, message or push is used. */
@RunWith(AndroidJUnit4.class)
public class TwoFactorResumeTest {
    private Context context;
    private TokenVault pending;
    @Before public void prepare() {
        context = ApplicationProvider.getApplicationContext();
        pending = TokenVault.pendingTwoFactor(context);
        new TokenVault(context).clear(); pending.clear();
    }
    @After public void clean() { pending.clear(); new TokenVault(context).clear(); }
    private String challenge(long expiry) {
        String json = "{\"id\":\"isolated-test\",\"purpose\":\"TOTP_CHALLENGE\",\"exp\":" + expiry + "}";
        return "header." + Base64.encodeToString(json.getBytes(StandardCharsets.UTF_8), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING) + ".signature";
    }
    private void fields(View view, List<EditText> result) {
        if (view instanceof EditText) result.add((EditText) view);
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int n = 0; n < group.getChildCount(); n++) fields(group.getChildAt(n), result);
        }
    }
    private List<EditText> fields(MainActivity activity) {
        List<EditText> result = new ArrayList<>(); fields(activity.getWindow().getDecorView(), result); return result;
    }
    private void assertChallenge(MainActivity activity) {
        List<EditText> inputs = fields(activity);
        assertEquals(1, inputs.size()); assertEquals("Κωδικός 2FA", inputs.get(0).getHint().toString());
        assertEquals("", inputs.get(0).getText().toString());
    }
    private View findText(View view, String label) {
        if (view instanceof TextView && label.contentEquals(((TextView) view).getText())) return view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int n = 0; n < group.getChildCount(); n++) {
                View match = findText(group.getChildAt(n), label); if (match != null) return match;
            }
        }
        return null;
    }
    @Test public void backgroundAndRecreatedActivityRestoreOnlyTheChallenge() throws Exception {
        String value = challenge(System.currentTimeMillis() / 1000 + 300); pending.save(value);
        byte[] bytes = Files.readAllBytes(new File(context.getNoBackupFilesDir(), "pending-2fa.enc").toPath());
        assertFalse(new String(bytes, StandardCharsets.ISO_8859_1).contains(value));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> { assertChallenge(activity); fields(activity).get(0).setText("123456"); });
            scenario.moveToState(Lifecycle.State.CREATED);
            scenario.moveToState(Lifecycle.State.RESUMED);
            scenario.onActivity(this::assertChallenge);
            scenario.recreate();
            scenario.onActivity(this::assertChallenge);
        }
        try (ActivityScenario<MainActivity> reopened = ActivityScenario.launch(MainActivity.class)) {
            reopened.onActivity(this::assertChallenge);
        }
        assertEquals(value, pending.load());
    }
    @Test public void expiredChallengeReturnsToLoginAndIsRemoved() throws Exception {
        pending.save(challenge(System.currentTimeMillis() / 1000 - 1));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> assertEquals(2, fields(activity).size()));
        }
        assertEquals("", pending.load());
    }
    @Test public void explicitAccountChangeCannotRestorePreviousChallenge() throws Exception {
        pending.save(challenge(System.currentTimeMillis() / 1000 + 300));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                assertChallenge(activity);
                View cancel = findText(activity.getWindow().getDecorView(), "Άλλος λογαριασμός");
                assertNotNull(cancel); cancel.performClick(); assertEquals(2, fields(activity).size());
            });
            scenario.recreate();
            scenario.onActivity(activity -> assertEquals(2, fields(activity).size()));
        }
        assertEquals("", pending.load());
    }
    @Test public void pendingAndAuthenticatedRecordsUseIndependentKeysAndLifetimes() throws Exception {
        TokenVault connection = new TokenVault(context); connection.save("isolated-connection-token");
        String value = challenge(System.currentTimeMillis() / 1000 + 300); pending.save(value);
        pending.clear(); assertEquals("isolated-connection-token", connection.load());
        pending.save(value); connection.clear(); assertEquals(value, pending.load());
    }
}
