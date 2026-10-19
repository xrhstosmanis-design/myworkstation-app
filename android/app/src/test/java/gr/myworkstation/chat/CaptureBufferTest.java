package gr.myworkstation.chat;
import org.junit.Test;
import static org.junit.Assert.*;
public class CaptureBufferTest {
    @Test public void replacementWipesOldAndTakeIsSingleUse() {
        byte[] oldBytes = {1,2,3}, nextBytes = {4,5};
        PhotoBatch old = new PhotoBatch(), next = new PhotoBatch(); old.add(oldBytes,"image/jpeg"); next.add(nextBytes,"image/jpeg");
        CaptureBuffer.put(old); CaptureBuffer.put(next);
        assertArrayEquals(new byte[]{0,0,0}, oldBytes); assertSame(next, CaptureBuffer.take()); assertNull(CaptureBuffer.take()); next.clear();
    }
    @Test public void clearWipesEveryPhoto() {
        byte[] first = {10,20}, second = {30,40}; PhotoBatch photos = new PhotoBatch();
        photos.add(first,"image/jpeg"); photos.add(second,"image/jpeg"); CaptureBuffer.put(photos); CaptureBuffer.clear();
        assertArrayEquals(new byte[]{0,0},first); assertArrayEquals(new byte[]{0,0},second); assertNull(CaptureBuffer.take());
    }
    @Test public void oneHandoffPreservesBothCapturesInOrder() {
        byte[] first = {1,2}, second = {3,4}; PhotoBatch photos = new PhotoBatch();
        photos.add(first,"image/jpeg"); photos.add(second,"image/jpeg"); CaptureBuffer.put(photos);
        PhotoBatch result = CaptureBuffer.take(); assertEquals(2,result.size()); assertSame(first,result.get(0).bytes); assertSame(second,result.get(1).bytes);
        assertNull(CaptureBuffer.take()); result.clear(); assertArrayEquals(new byte[]{0,0},first); assertArrayEquals(new byte[]{0,0},second);
    }
}
