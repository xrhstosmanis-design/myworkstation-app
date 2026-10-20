package gr.myworkstation.chat;
import org.junit.Test;
import java.nio.ByteBuffer;
import static org.junit.Assert.*;
public class VideoDataTest {
    static byte[] envelope(){return ByteBuffer.allocate(33).putInt(16).putInt(0x66747970).putLong(0).putInt(8).putInt(0x6d6f6f76).putInt(9).putInt(0x6d646174).put((byte)1).array();}
    @Test public void envelopeRejectsTruncationOverflowDuplicateAndMissingBoxes(){
        assertTrue(VideoData.valid(envelope()));for(int size=0;size<33;size++)assertFalse(VideoData.valid(java.util.Arrays.copyOf(envelope(),size)));
        byte[] overflow=envelope();overflow[0]=127;assertFalse(VideoData.valid(overflow));assertFalse(VideoData.valid(new byte[VideoData.MAX_BYTES+1]));
        byte[] bytes=envelope();bytes[4]=0;assertFalse(VideoData.valid(bytes));
    }
    @Test public void handoffIsOneUseAndReplacingOrClearingWipesMemory(){
        byte[] first=envelope(),next=envelope();VideoBuffer.put(first);VideoBuffer.put(next);for(byte b:first)assertEquals(0,b);assertSame(next,VideoBuffer.take());assertNull(VideoBuffer.take());VideoData.wipe(next);VideoBuffer.put(envelope());VideoBuffer.clear();assertNull(VideoBuffer.take());
    }
}
