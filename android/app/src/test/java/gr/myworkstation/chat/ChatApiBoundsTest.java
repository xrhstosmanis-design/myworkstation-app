package gr.myworkstation.chat;
import java.io.ByteArrayInputStream;
import org.junit.Test;
import static org.junit.Assert.*;
public class ChatApiBoundsTest {
    @Test public void chunkedPhotoCannotExceedMemoryLimitWithoutContentLength() throws Exception {
        try { ChatApi.bounded(new ByteArrayInputStream(new byte[8193]), 8192); fail("Expected bounded read rejection"); }
        catch (ChatApi.Failure expected) { assertEquals(0, expected.status); }
    }
    @Test public void exactLimitAndEmptyResponseRemainSupported() throws Exception {
        assertEquals(8192, ChatApi.bounded(new ByteArrayInputStream(new byte[8192]), 8192).length);
        assertEquals(0, ChatApi.bounded(new ByteArrayInputStream(new byte[0]), 8192).length);
    }
}
