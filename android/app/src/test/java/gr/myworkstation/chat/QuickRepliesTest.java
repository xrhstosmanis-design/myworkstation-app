package gr.myworkstation.chat;
import org.junit.Test;
import static org.junit.Assert.*;
public class QuickRepliesTest {
    @Test public void draftRequiresExplicitAppendOrReplaceAndChoicesCannotBeMutated() {
        String reply = QuickReplies.choices()[0];
        assertEquals("Draft\n" + reply, QuickReplies.compose("Draft", reply, true));
        assertEquals(reply, QuickReplies.compose("Draft", reply, false));
        assertEquals(reply, QuickReplies.compose("", reply, true));
        String[] copy = QuickReplies.choices(); copy[0] = "Changed";
        assertEquals(reply, QuickReplies.choices()[0]);
    }
    @Test public void oversizedAppendRejectsWithoutTruncation() {
        String draft = new String(new char[5000]).replace('\0', 'a');
        try { QuickReplies.compose(draft, QuickReplies.choices()[0], true); fail(); }
        catch (IllegalArgumentException expected) { assertEquals(5000, draft.length()); }
    }
}
