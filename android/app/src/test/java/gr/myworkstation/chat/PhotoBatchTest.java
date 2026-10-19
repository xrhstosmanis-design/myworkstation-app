package gr.myworkstation.chat;
import org.junit.Test;
import static org.junit.Assert.*;

public class PhotoBatchTest {
    @Test public void limitsRejectAndEraseOnlyRejectedBytes() {
        PhotoBatch batch = new PhotoBatch();
        for (int i = 0; i < 5; i++) batch.add(new byte[]{1}, "image/jpeg");
        byte[] sixth = {9};
        try { batch.add(sixth, "image/jpeg"); fail(); } catch (IllegalArgumentException expected) { }
        assertArrayEquals(new byte[]{0}, sixth); assertEquals(5, batch.size()); assertEquals(5, batch.bytes());
        assertEquals(1, batch.get(0).bytes[0]); batch.clear(); assertEquals(0, batch.bytes());
    }
    @Test public void aggregateBoundAndWrongTypesFailClosed() {
        PhotoBatch batch = new PhotoBatch();
        batch.add(new byte[PhotoBatch.MAX_IMAGE_BYTES], "image/png");
        batch.add(new byte[PhotoBatch.MAX_IMAGE_BYTES], "image/webp");
        byte[] extra = {7};
        try { batch.add(extra, "image/jpeg"); fail(); } catch (IllegalArgumentException expected) { }
        assertEquals(0, extra[0]); assertEquals(PhotoBatch.MAX_TOTAL_BYTES, batch.bytes());
        batch.clear(); byte[] pdf = {8};
        try { batch.add(pdf, "application/pdf"); fail(); } catch (IllegalArgumentException expected) { }
        assertEquals(0, pdf[0]); assertEquals(0, batch.size());
    }
    @Test public void consumptionRemovalReplacementAndLifecycleClearEraseOwnedBuffers() {
        PhotoBatch batch = new PhotoBatch(), candidate = new PhotoBatch();
        byte[] first = {1}, second = {2}, replacement = {3};
        batch.add(first, "image/jpeg"); batch.add(second, "image/png");
        batch.remove(0); assertEquals(0, first[0]); assertSame(second, batch.get(0).bytes);
        candidate.add(replacement, "image/webp"); batch.takeFrom(candidate);
        assertEquals(0, second[0]); assertEquals(0, candidate.size()); assertSame(replacement, batch.get(0).bytes);
        batch.clear(); assertEquals(0, replacement[0]); assertEquals(0, batch.size());
    }
}
