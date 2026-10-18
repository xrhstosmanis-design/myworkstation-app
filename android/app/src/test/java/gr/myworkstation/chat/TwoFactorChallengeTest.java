package gr.myworkstation.chat;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.Test;
import static org.junit.Assert.*;

public class TwoFactorChallengeTest {
    private final long now = 1800000000000L;
    private String token(String json) {
        return "header." + Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes(StandardCharsets.UTF_8)) + ".signature";
    }
    @Test public void restoringSamePendingChallengeDoesNotExtendExpiry() {
        String pending = token("{\"id\":\"owner\",\"purpose\":\"TOTP_CHALLENGE\",\"exp\":1800000300}");
        assertTrue(TwoFactorChallenge.usable(pending, now));
        assertTrue(TwoFactorChallenge.usable(pending, now + 299999));
        assertFalse(TwoFactorChallenge.usable(pending, now + 300000));
    }
    @Test public void authenticatedSessionAndOtherPurposesCannotBeRestoredAsTwoFactor() {
        assertFalse(TwoFactorChallenge.usable(token("{\"id\":\"owner\",\"tokenType\":\"BACKOFFICE_USER\",\"exp\":1800000300}"), now));
        assertFalse(TwoFactorChallenge.usable(token("{\"id\":\"owner\",\"purpose\":\"PASSWORD_RESET\",\"exp\":1800000300}"), now));
        assertFalse(TwoFactorChallenge.usable(token("{\"purpose\":\"TOTP_CHALLENGE\",\"exp\":1800000300}"), now));
    }
    @Test public void corruptExpiredAndUnboundedRecordsAreDiscarded() {
        for (String value : new String[]{null, "", "corrupt", "a.!invalid!.b", "a.b.", "x".repeat(16385),
            token("{\"id\":\"x\",\"purpose\":\"TOTP_CHALLENGE\",\"exp\":1800000000}"),
            token("{\"id\":\"x\",\"purpose\":\"TOTP_CHALLENGE\",\"exp\":1800003600}"),
            token("{\"id\":\"x\",\"purpose\":\"TOTP_CHALLENGE\",\"exp\":9223372036854775807}")})
            assertFalse(TwoFactorChallenge.usable(value, now));
    }
}
