package gr.myworkstation.chat;
import org.junit.Test;
import static org.junit.Assert.*;
public class CaptureBufferTest {
    @Test public void cameraHandoffIsSingleUseAndReplacedPhotosAreZeroed() {
        byte[] old = {1,2,3}; CaptureBuffer.put(old); byte[] next = {4,5}; CaptureBuffer.put(next);
        assertArrayEquals(new byte[]{0,0,0}, old); assertSame(next, CaptureBuffer.take()); assertNull(CaptureBuffer.take());
    }
    @Test public void cancelledCaptureErasesItsMemoryBuffer() {
        byte[] photo = {10,20}; CaptureBuffer.put(photo); CaptureBuffer.clear(); assertArrayEquals(new byte[]{0,0}, photo); assertNull(CaptureBuffer.take());
    }
}
