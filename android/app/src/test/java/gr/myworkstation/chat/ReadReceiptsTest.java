package gr.myworkstation.chat;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Arrays;

public class ReadReceiptsTest {
    private JSONObject reader(String id, String name) throws Exception { return new JSONObject().put("id", id).put("name", name); }
    @Test public void senderIsNotARecipientAndDuplicateIdsDoNotInflateReadCount() throws Exception {
        JSONArray rows = new JSONArray().put(reader("sender", "Owner")).put(reader("A", "Λεωνίδας"))
            .put(reader("A", "Duplicate")).put(reader("B", "Μαρία")).put(reader("C", "Μαρία"));
        assertEquals(Arrays.asList("Λεωνίδας", "Μαρία", "Μαρία"), ReadReceipts.names(rows, "sender"));
        assertTrue(ReadReceipts.names(new JSONArray().put(reader("sender", "Owner")), "sender").isEmpty());
    }
    @Test public void missingOrMalformedReadDataNeverInventsAReadRecipient() throws Exception {
        assertTrue(ReadReceipts.names(null, "sender").isEmpty());
        assertTrue(ReadReceipts.names(new JSONArray().put(JSONObject.NULL).put("wrong").put(new JSONObject())
            .put(new JSONObject().put("id", 9)).put(reader(" ", "Unknown")), "sender").isEmpty());
    }
    @Test public void displayNamesArePlainBoundedTextAndOpaqueIdsAreNotShown() throws Exception {
        JSONArray rows = new JSONArray().put(reader("A", "  Μαρία\n  Παππά  ")).put(reader("opaque-id", "opaque-id"))
            .put(reader("C", "👩".repeat(200))).put(new JSONObject().put("id", "D").put("name", new JSONObject()));
        java.util.List<String> names = ReadReceipts.names(rows, "sender");
        assertEquals("Μαρία Παππά", names.get(0)); assertEquals("Χρήστης", names.get(1));
        assertEquals(161, names.get(2).codePointCount(0, names.get(2).length())); assertTrue(names.get(2).endsWith("…"));
        assertEquals("Χρήστης", names.get(3));
    }
}
