package gr.myworkstation.chat;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import org.json.JSONObject;

public final class ChatMessagingService extends FirebaseMessagingService {
    @Override public void onNewToken(String token) { NativePush.refreshed(this, token); }
    @Override public void onMessageReceived(RemoteMessage message) {
        try {
            String token = new TokenVault(this).load(); Map<String, String> data = message.getData();
            if (!NativePush.opted(this) || !NativePush.valid(token)) return;
            JSONObject user = NativePush.identity(token);
            if (!PushEnvelope.allowed(data, NativePush.binding(token), user.optString("tokenType").equals("STORE_CHAT_OPERATOR"), user.optString("storeId"), user.optString("companyId"))) return;
            String store = data.get("storeId"), company = data.get("companyId");
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
            NotificationManager manager = getSystemService(NotificationManager.class);
            NotificationChannel channel = new NotificationChannel("native-chat", "Μηνύματα MyWorkStation", NotificationManager.IMPORTANCE_HIGH);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE); manager.createNotificationChannel(channel);
            Intent intent = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("pushStore", store).putExtra("pushCompany", company).putExtra("pushBinding", data.get("binding"));
            PendingIntent action = PendingIntent.getActivity(this, 313, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification notification = new Notification.Builder(this, "native-chat").setSmallIcon(R.drawable.ic_chat)
                .setContentTitle(PushEnvelope.title(data)).setContentText("Έχεις νέο μήνυμα.")
                .setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(true).setContentIntent(action).build();
            manager.notify(313, notification);
        } catch (Exception ignored) { /* No payload, token or exception logging. */ }
    }
}
