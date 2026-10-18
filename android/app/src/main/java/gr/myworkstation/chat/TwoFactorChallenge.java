package gr.myworkstation.chat;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.json.JSONObject;

/** Local restore eligibility only. The server still verifies the JWT signature and OTP. */
final class TwoFactorChallenge {
    static boolean usable(String token, long now) {
        if (token == null || token.length() < 20 || token.length() > 16384) return false;
        try {
            String[] parts = token.split("\\.", -1);
            if (parts.length != 3 || parts[0].isEmpty() || parts[2].isEmpty()) return false;
            JSONObject payload = new JSONObject(new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8));
            long seconds = payload.optLong("exp", 0);
            if (seconds <= 0 || seconds > Long.MAX_VALUE / 1000) return false;
            long remaining = seconds * 1000 - now;
            return payload.optString("purpose").equals("TOTP_CHALLENGE")
                && !payload.optString("id").isEmpty() && remaining > 0 && remaining <= 330000;
        } catch (Exception ignored) { return false; }
    }
}
