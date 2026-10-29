package gr.myworkstation.chat;

import org.junit.Test;
import static org.junit.Assert.*;

public class StoreEntryTest {
    @Test public void storeHintHasNoCredentialOrAuthority() {
        assertEquals("store-123", StoreEntry.parse("myworkstation-chat://store/store-123"));
        for (String value : new String[]{null, "", "https://store/store-123", "myworkstation-chat://evil/store-123",
            "myworkstation-chat://user@store/store-123", "myworkstation-chat://store:443/store-123",
            "myworkstation-chat://store/store-123?token=secret", "myworkstation-chat://store/store-123#secret",
            "myworkstation-chat://store/%2e%2e", "myworkstation-chat://store/store-123/extra",
            "myworkstation-chat://store/", "myworkstation-chat://store/" + "x".repeat(129)})
            assertEquals("", StoreEntry.parse(value));
    }
}
