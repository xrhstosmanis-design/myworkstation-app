package gr.myworkstation.chat;
import org.junit.Test;
import static org.junit.Assert.*;
public class RequestEpochTest {
    @Test public void lateMessageAndAuthResponsesCannotCrossStoreOrSessionBoundary() {
        RequestEpoch state = new RequestEpoch(); long storeA = state.capture();
        assertTrue(state.current(storeA)); state.invalidate(); long storeB = state.capture();
        assertFalse(state.current(storeA)); assertTrue(state.current(storeB));
        state.invalidate(); assertFalse(state.current(storeA)); assertFalse(state.current(storeB));
    }
    @Test public void backgroundAndResumeNeverRevalidateAnOldResponse() {
        RequestEpoch state = new RequestEpoch(); long beforeStop = state.capture(); state.invalidate();
        long resumed = state.capture(); assertFalse(state.current(beforeStop)); assertTrue(state.current(resumed));
    }
}
