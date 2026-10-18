package gr.myworkstation.chat;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

class ChatApi {
    static final String ORIGIN = "https://myworkstation-app.onrender.com";
    private final Set<HttpsURLConnection> active = Collections.synchronizedSet(new HashSet<>());
    static final class Failure extends Exception {
        final int status;
        Failure(int status, String message) { super(message); this.status = status; }
    }
    JSONObject json(String path, String method, JSONObject body, String token) throws Exception {
        byte[] result = request(path, method, body == null ? null : body.toString().getBytes(StandardCharsets.UTF_8), token, 12 * 1024 * 1024);
        return new JSONObject(new String(result, StandardCharsets.UTF_8));
    }
    byte[] image(String path, String token) throws Exception { return request(path, "GET", null, token, 7 * 1024 * 1024); }
    private byte[] request(String path, String method, byte[] body, String token, int max) throws Exception {
        if (!path.startsWith("/api/") || path.contains("\\") || path.contains("\r") || path.contains("\n")) throw new Failure(0, "Μη έγκυρο αίτημα.");
        HttpsURLConnection connection = (HttpsURLConnection) new URL(ORIGIN + path).openConnection();
        active.add(connection);
        try {
            connection.setConnectTimeout(15000); connection.setReadTimeout(75000);
            connection.setInstanceFollowRedirects(false); connection.setUseCaches(false); connection.setRequestMethod(method);
            connection.setRequestProperty("Cache-Control", "no-store"); connection.setRequestProperty("Pragma", "no-cache");
            connection.setRequestProperty("Accept", "application/json");
            if (token != null && !token.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json");
                connection.setFixedLengthStreamingMode(body.length);
                try (var stream = connection.getOutputStream()) { stream.write(body); }
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                String message = status == 401 ? "Η σύνδεση έληξε. Συνδέσου ξανά." : status == 403 ? "Δεν υπάρχει δικαίωμα για αυτή τη λειτουργία." : "Το αίτημα δεν ολοκληρώθηκε. Έλεγξε τη σύνδεση και ανανέωσε.";
                // Never turn a failed POST into an automatic replay: the server may have committed it.
                throw new Failure(status, message);
            }
            if (connection.getContentLengthLong() > max) throw new Failure(0, "Η απάντηση ξεπερνά το όριο προβολής.");
            try (InputStream input = connection.getInputStream()) { return bounded(input, max); }
        } finally { connection.disconnect(); active.remove(connection); }
    }
    static byte[] bounded(InputStream input, int max) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int n;
        while ((n = input.read(buffer)) != -1) { if (output.size() + n > max) throw new Failure(0, "Το αρχείο ξεπερνά το όριο προβολής."); output.write(buffer, 0, n); }
        return output.toByteArray();
    }
    void cancel() { synchronized (active) { for (HttpsURLConnection c : active) c.disconnect(); active.clear(); } }
}
