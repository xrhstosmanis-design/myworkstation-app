package gr.myworkstation.chat;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import java.util.UUID;
import org.json.JSONObject;

public final class ChatMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL = "native-chat";
    private static final int NOTIFICATION_ID = 313;

    @Override public void onNewToken(String token) { NativePush.refreshed(this, token); }
    @Override public void onMessageReceived(RemoteMessage message) {
        try {
            String token = new TokenVault(this).load(); Map<String, String> data = message.getData();
            if (!NativePush.opted(this) || !NativePush.valid(token)) return;
            JSONObject user = NativePush.identity(token);
            if (!PushEnvelope.allowed(data, NativePush.binding(token), user.optString("tokenType").equals("STORE_CHAT_OPERATOR"), user.optString("storeId"), user.optString("companyId"))) return;
            if (!canPost(this)) return;
            String store = data.get("storeId"), company = data.get("companyId"), binding = data.get("binding");
            String messageId = data.get("messageId");
            NotificationManager manager = getSystemService(NotificationManager.class);
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Μηνύματα MyWorkStation", NotificationManager.IMPORTANCE_HIGH);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            manager.createNotificationChannel(channel);
            Notification.Builder builder = notification(this, store, company, binding, messageId)
                .setContentTitle(PushEnvelope.title(data)).setContentText("Έχεις νέο μήνυμα.");
            if (messageId != null) builder.addAction(replyAction(store, company, binding, messageId));
            manager.notify(messageId, NOTIFICATION_ID, builder.build());
        } catch (Exception ignored) { /* No payload, token or exception logging. */ }
    }

    private Notification.Action replyAction(String store, String company, String binding, String messageId) {
        String requestId = UUID.randomUUID().toString();
        Intent intent = new Intent(this, ChatNotificationReplyReceiver.class).setAction(ChatNotificationReplyReceiver.ACTION)
            .setData(Uri.parse("mws-chat-notification://reply/" + requestId))
            .putExtra("pushStore", store).putExtra("pushCompany", company).putExtra("pushBinding", binding)
            .putExtra("messageId", messageId).putExtra("requestId", requestId);
        int flags = PendingIntent.FLAG_ONE_SHOT;
        if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
        PendingIntent reply = PendingIntent.getBroadcast(this, NOTIFICATION_ID, intent, flags);
        RemoteInput input = new RemoteInput.Builder(ChatNotificationReplyReceiver.INPUT).setLabel("Απάντηση").build();
        Notification.Action.Builder builder = new Notification.Action.Builder((android.graphics.drawable.Icon) null, "Απάντηση", reply)
            .addRemoteInput(input).setAllowGeneratedReplies(false);
        if (Build.VERSION.SDK_INT >= 28) builder.setSemanticAction(Notification.Action.SEMANTIC_ACTION_REPLY);
        if (Build.VERSION.SDK_INT >= 31) builder.setAuthenticationRequired(true);
        return builder.build();
    }

    private static boolean canPost(Context context) {
        return Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private static Notification.Builder notification(Context context, String store, String company, String binding, String messageId) {
        Intent intent = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("pushStore", store).putExtra("pushCompany", company).putExtra("pushBinding", binding);
        if (messageId != null) intent.setData(Uri.parse("mws-chat-notification://open/" + Uri.encode(messageId)));
        PendingIntent action = PendingIntent.getActivity(context, NOTIFICATION_ID, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(context, CHANNEL).setSmallIcon(R.drawable.ic_chat)
            .setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(true).setContentIntent(action);
    }

    static void showReplyStatus(Context context, String store, String company, String binding, String messageId, boolean sent) {
        if (!canPost(context)) return;
        Notification notification = notification(context, store, company, binding, messageId)
            .setContentTitle("MyWorkStation Chat")
            .setContentText(sent ? "Η απάντηση στάλθηκε." : "Η αποστολή δεν επιβεβαιώθηκε. Έλεγξε τη συνομιλία.")
            .setOnlyAlertOnce(true).setTimeoutAfter(30_000).build();
        context.getSystemService(NotificationManager.class).notify(messageId, NOTIFICATION_ID, notification);
    }
}
