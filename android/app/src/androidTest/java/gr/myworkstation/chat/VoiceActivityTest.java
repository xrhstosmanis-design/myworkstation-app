package gr.myworkstation.chat;

import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Real lifecycle/handoff with synthetic PCM; no microphone permission or hardware acceptance claim. */
@RunWith(AndroidJUnit4.class)
public class VoiceActivityTest {
    @After public void clear() { VoiceBuffer.clear(); }
    private static Object get(VoiceActivity a, String name) throws Exception { Field f = VoiceActivity.class.getDeclaredField(name); f.setAccessible(true); return f.get(a); }
    private static void accept(VoiceActivity a, byte[] bytes, long generation) throws Exception { Method m = VoiceActivity.class.getDeclaredMethod("acceptVoice", byte[].class, long.class); m.setAccessible(true); m.invoke(a, bytes, generation); }
    @Test public void useIsExplicitAndSingleUseHandoffSurvivesDestruction() throws Exception {
        byte[] wave = VoiceData.fromPcm(new short[]{1,2}, 2);
        try (ActivityScenario<VoiceActivity> scenario = ActivityScenario.launch(VoiceActivity.class)) {
            scenario.onActivity(a -> { try {
                assertNull(get(a,"recorder")); assertFalse((Boolean)get(a,"recording"));
                accept(a, wave, ((RequestEpoch)get(a,"epoch")).capture()); assertFalse(a.isFinishing()); assertNull(VoiceBuffer.take());
                Method use = VoiceActivity.class.getDeclaredMethod("useVoice"); use.setAccessible(true); use.invoke(a); assertTrue(a.isFinishing());
            } catch (Exception e) { throw new AssertionError(e); } });
        }
        assertSame(wave, VoiceBuffer.take()); assertTrue(VoiceData.valid(wave)); assertNull(VoiceBuffer.take()); VoiceData.wipe(wave);
    }
    @Test public void backgroundWipesDraftAndRejectsLateCapture() throws Exception {
        byte[] wave = VoiceData.fromPcm(new short[]{3,4}, 2); long[] old = {0};
        try (ActivityScenario<VoiceActivity> scenario = ActivityScenario.launch(VoiceActivity.class)) {
            scenario.onActivity(a -> { try { old[0]=((RequestEpoch)get(a,"epoch")).capture(); accept(a,wave,old[0]); } catch (Exception e) { throw new AssertionError(e); } });
            scenario.moveToState(Lifecycle.State.CREATED); for (byte b : wave) assertEquals(0,b); assertNull(VoiceBuffer.take());
            scenario.moveToState(Lifecycle.State.RESUMED); byte[] late=VoiceData.fromPcm(new short[]{5},1);
            scenario.onActivity(a -> { try { accept(a,late,old[0]); assertNull(get(a,"draft")); } catch(Exception e) { throw new AssertionError(e); } });
            for (byte b : late) assertEquals(0,b);
        }
    }
    @Test public void permissionDenialDoesNotStartRecorder() throws Exception {
        try (ActivityScenario<VoiceActivity> scenario = ActivityScenario.launch(VoiceActivity.class)) {
            scenario.onActivity(a -> { try {
                Field pending = VoiceActivity.class.getDeclaredField("permissionEpoch"); pending.setAccessible(true); pending.setLong(a,((RequestEpoch)get(a,"epoch")).capture());
                a.onRequestPermissionsResult(53,new String[]{android.Manifest.permission.RECORD_AUDIO},new int[]{android.content.pm.PackageManager.PERMISSION_DENIED});
                assertNull(get(a,"recorder")); assertFalse((Boolean)get(a,"recording")); assertNull(get(a,"draft"));
            } catch(Exception e) { throw new AssertionError(e); } });
        }
    }
}
