package gr.myworkstation.chat;

import java.net.URI;

/** A store hint only. The server still authenticates the employee with their PIN. */
final class StoreEntry {
    static String parse(String value) {
        if (value == null || value.length() > 512) return "";
        try {
            URI uri = new URI(value);
            if (!"myworkstation-chat".equals(uri.getScheme()) || !"store".equals(uri.getRawAuthority())
                || uri.getRawQuery() != null || uri.getRawFragment() != null) return "";
            String path = uri.getRawPath();
            if (path == null || !path.matches("/[A-Za-z0-9_-]{2,128}")) return "";
            return path.substring(1);
        } catch (Exception ignored) { return ""; }
    }
}
