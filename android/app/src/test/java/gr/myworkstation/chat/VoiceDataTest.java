package gr.myworkstation.chat;
import org.junit.Test;
import static org.junit.Assert.*;
public class VoiceDataTest {
    @Test public void canonicalPcmRetainsSignedSamplesAndBoundaries() {
        byte[] data = VoiceData.fromPcm(new short[]{-32768, 32767}, 2);
        assertTrue(VoiceData.valid(data)); assertEquals(48, data.length);
        assertEquals(0, data[44]); assertEquals((byte) 128, data[45]); assertEquals((byte) 255, data[46]); assertEquals(127, data[47]);
        assertTrue(VoiceData.valid(VoiceData.fromPcm(new short[VoiceData.MAX_SAMPLES], VoiceData.MAX_SAMPLES)));
        assertEquals(60, VoiceData.seconds(VoiceData.fromPcm(new short[VoiceData.MAX_SAMPLES], VoiceData.MAX_SAMPLES)));
    }
    @Test public void malformedHeadersAndTooLongPcmAreRejected() {
        byte[] valid = VoiceData.fromPcm(new short[]{1,2}, 2);
        for (int offset : new int[]{0,4,8,12,16,20,22,24,28,32,34,36,40}) {
            byte[] bad = valid.clone(); bad[offset] ^= 1; assertFalse("offset " + offset, VoiceData.valid(bad));
        }
        assertFalse(VoiceData.valid(new byte[44])); assertFalse(VoiceData.valid(null));
        try { VoiceData.fromPcm(new short[VoiceData.MAX_SAMPLES + 1], VoiceData.MAX_SAMPLES + 1); fail(); } catch (IllegalArgumentException expected) {}
        VoiceData.wipe(valid); for (byte value : valid) assertEquals(0, value);
    }
}
