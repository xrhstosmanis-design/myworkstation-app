package gr.myworkstation.chat;

import android.content.Context;
import android.net.Uri;
import android.util.Base64;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** Only technical opt-in/FCM installation identifiers may persist; never chat content. */
final class NativePush {
    private static final ExecutorService WORK = Executors.newSingleThreadExecutor();
    private static final java.util.concurrent.atomic.AtomicLong GENERATION = new java.util.concurrent.atomic.AtomicLong();
    interface Result { void done(boolean ok); }
    static JSONObject identity(String token) throws Exception {
        return new JSONObject(new String(Base64.decode(token.split("\\.")[1], Base64.URL_SAFE | Base64.NO_WRAP), StandardCharsets.UTF_8));
    }
    static String binding(String token) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder(); for (byte b : hash) out.append(String.format(java.util.Locale.ROOT, "%02x", b & 255)); return out.toString();
    }
    static boolean valid(String token) {
        try { return !token.isEmpty() && identity(token).optLong("exp") * 1000L > System.currentTimeMillis(); } catch (Exception ignored) { return false; }
    }
    static String path(String token) throws Exception {
        JSONObject user = identity(token);
        return user.optString("tokenType").equals("STORE_CHAT_OPERATOR")
            ? "/api/store-chat/stores/" + Uri.encode(user.getString("storeId")) + "/native-push"
            : "/api/store-chat/mobile/native-push";
    }
    static boolean opted(Context context) { return context.getSharedPreferences("native-push", Context.MODE_PRIVATE).getBoolean("enabled", false); }
    static void register(Context context, String token, Result result) {
        Context app = context.getApplicationContext();
        final long generation = GENERATION.get();
        WORK.execute(() -> {
            try {
                if (generation != GENERATION.get() || !valid(token) || !token.equals(new TokenVault(app).load())) { result.done(false); return; }
                if (!new ChatApi().json(path(token), "GET", null, token).optBoolean("configured")) { result.done(false); return; }
                FirebaseApp.initializeApp(app);
                FirebaseMessaging messaging = FirebaseMessaging.getInstance();
                messaging.setAutoInitEnabled(true);
                messaging.getToken().addOnCompleteListener(task -> {
                    if (!task.isSuccessful()) { result.done(false); return; }
                    send(app, token, task.getResult(), generation, result);
                });
            } catch (Exception ignored) { result.done(false); }
        });
    }
    private static void send(Context app, String token, String fcm, long generation, Result result) {
        WORK.execute(() -> {
            try {
                if (generation != GENERATION.get() || !valid(token) || !token.equals(new TokenVault(app).load())) { result.done(false); return; }
                JSONObject body = new JSONObject(); body.put("token", fcm); body.put("notificationVersion", 2);
                JSONObject response = new ChatApi().json(path(token), "POST", body, token);
                boolean ok = response.optBoolean("ok") && response.optString("binding").equals(binding(token));
                synchronized (NativePush.class) {
                    if (ok && generation == GENERATION.get() && token.equals(new TokenVault(app).load())) app.getSharedPreferences("native-push", Context.MODE_PRIVATE).edit().putBoolean("enabled", true).apply();
                }
                result.done(ok);
            } catch (Exception ignored) { result.done(false); }
        });
    }
    static void refreshed(Context context, String fcm) {
        String token = new TokenVault(context).load();
        if (opted(context) && valid(token)) send(context.getApplicationContext(), token, fcm, GENERATION.get(), ok -> {});
    }
    static void clearNotifications(Context context) {
        ((android.app.NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).cancelAll();
    }
    static void logout(Context context) {
        Context app = context.getApplicationContext();
        synchronized (NativePush.class) {
            GENERATION.incrementAndGet();
            app.getSharedPreferences("native-push", Context.MODE_PRIVATE).edit().putBoolean("enabled", false).apply();
        }
        clearNotifications(app);
        if (!FirebaseApp.getApps(app).isEmpty()) {
            FirebaseMessaging messaging = FirebaseMessaging.getInstance(); messaging.setAutoInitEnabled(false); messaging.deleteToken();
        }
    }
}
