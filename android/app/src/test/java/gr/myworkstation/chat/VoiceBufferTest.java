package gr.myworkstation.chat;
import org.junit.After;
import org.junit.Test;
import static org.junit.Assert.*;
public class VoiceBufferTest {
    @After public void clear() { VoiceBuffer.clear(); }
    @Test public void replacementWipesOldAndConsumptionIsSingleUse() {
        byte[] old = VoiceData.fromPcm(new short[]{1}, 1), next = VoiceData.fromPcm(new short[]{2}, 1);
        VoiceBuffer.put(old); VoiceBuffer.put(next); for (byte value : old) assertEquals(0, value);
        assertSame(next, VoiceBuffer.take()); assertNull(VoiceBuffer.take()); assertTrue(VoiceData.valid(next)); VoiceData.wipe(next);
    }
    @Test public void expiredAndMalformedHandoffsAreWiped() throws Exception {
        byte[] value = VoiceData.fromPcm(new short[]{3}, 1); VoiceBuffer.put(value);
        java.lang.reflect.Field created = VoiceBuffer.class.getDeclaredField("created"); created.setAccessible(true); created.setLong(null, System.nanoTime() - 31_000_000_000L);
        assertNull(VoiceBuffer.take()); for (byte b : value) assertEquals(0, b);
        byte[] bad = {1,2,3}; VoiceBuffer.put(bad); assertArrayEquals(new byte[3], bad); assertNull(VoiceBuffer.take());
    }
}
