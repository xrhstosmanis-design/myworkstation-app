package gr.myworkstation.chat;

import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Camera lifecycle/queue fixtures only: no hardware capture or production transport. */
@RunWith(AndroidJUnit4.class)
public class CameraBatchTest {
    @Before public void before() { CaptureBuffer.clear(); }
    @After public void after() { CaptureBuffer.clear(); }
    private static Object get(CameraActivity activity, String name) throws Exception {
        Field f=CameraActivity.class.getDeclaredField(name); f.setAccessible(true); return f.get(activity);
    }
    private static void accept(CameraActivity activity, byte[] bytes, long generation) throws Exception {
        Method m=CameraActivity.class.getDeclaredMethod("acceptImage",byte[].class,long.class); m.setAccessible(true); m.invoke(activity,bytes,generation);
    }
    private static long generation(CameraActivity activity) throws Exception { return ((RequestEpoch)get(activity,"epoch")).capture(); }
    @Test public void twoCapturesRemainUntilExplicitUseAndSurviveActivityDestructionAsOneHandoff() throws Exception {
        byte[] first={1,2},second={3,4};
        try (ActivityScenario<CameraActivity> scenario=ActivityScenario.launch(CameraActivity.class)) {
            scenario.onActivity(a->{try {
                accept(a,first,generation(a)); accept(a,second,generation(a));
                assertFalse(a.isFinishing()); assertEquals(2,((PhotoBatch)get(a,"captures")).size());
                assertTrue(((android.widget.Button)get(a,"use")).isEnabled());
                Method use=CameraActivity.class.getDeclaredMethod("usePhotos");use.setAccessible(true);use.invoke(a);
                assertTrue(a.isFinishing());
            } catch(Exception e){throw new AssertionError(e);}});
        }
        PhotoBatch result=CaptureBuffer.take(); assertNotNull(result); assertEquals(2,result.size());
        assertSame(first,result.get(0).bytes); assertSame(second,result.get(1).bytes); assertNull(CaptureBuffer.take()); result.clear();
        assertArrayEquals(new byte[]{0,0},first);assertArrayEquals(new byte[]{0,0},second);
    }
    @Test public void backgroundWipesDraftAndLateCallbackCannotRestoreIt() throws Exception {
        byte[] first={1,2},late={5,6};long[] old={0};
        try(ActivityScenario<CameraActivity> scenario=ActivityScenario.launch(CameraActivity.class)){
            scenario.onActivity(a->{try{old[0]=generation(a);accept(a,first,old[0]);}catch(Exception e){throw new AssertionError(e);}});
            scenario.moveToState(Lifecycle.State.CREATED); assertArrayEquals(new byte[]{0,0},first);
            scenario.moveToState(Lifecycle.State.RESUMED);
            scenario.onActivity(a->{try{accept(a,late,old[0]);assertEquals(0,((PhotoBatch)get(a,"captures")).size());}catch(Exception e){throw new AssertionError(e);}});
            assertArrayEquals(new byte[]{0,0},late); assertNull(CaptureBuffer.take());
        }
    }
    @Test public void cancellationWipesBothWithoutCreatingHandoff() throws Exception {
        byte[] first={1,2},second={3,4};
        try(ActivityScenario<CameraActivity> scenario=ActivityScenario.launch(CameraActivity.class)){
            scenario.onActivity(a->{try{accept(a,first,generation(a));accept(a,second,generation(a));a.finish();}catch(Exception e){throw new AssertionError(e);}});
        }
        assertArrayEquals(new byte[]{0,0},first); assertArrayEquals(new byte[]{0,0},second); assertNull(CaptureBuffer.take());
    }
}
