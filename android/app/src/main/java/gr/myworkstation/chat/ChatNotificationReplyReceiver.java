package gr.myworkstation.chat;

import android.app.KeyguardManager;
import android.app.RemoteInput;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import org.json.JSONObject;

public final class ChatNotificationReplyReceiver extends BroadcastReceiver {
    static final String ACTION = "gr.myworkstation.chat.REPLY_FROM_NOTIFICATION";
    static final String INPUT = "chatReply";

    @Override public void onReceive(Context context, Intent intent) {
        if (!ACTION.equals(intent.getAction())) return;
        String store = intent.getStringExtra("pushStore");
        String company = intent.getStringExtra("pushCompany");
        String binding = intent.getStringExtra("pushBinding");
        String message = intent.getStringExtra("messageId");
        String request = intent.getStringExtra("requestId");
        if (store == null || company == null || binding == null || request == null || !ChatInteractions.validId(message)) return;
        Bundle input = RemoteInput.getResultsFromIntent(intent);
        CharSequence value = input == null ? null : input.getCharSequence(INPUT);
        String reply = value == null ? "" : value.toString().trim();
        Context app = context.getApplicationContext();
        PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                TokenVault vault = new TokenVault(app);
                String token = vault.load();
                if (!matchesSession(app, token, binding, store, company)) return;
                boolean sent = false;
                if (!app.getSystemService(KeyguardManager.class).isDeviceLocked() && !reply.isEmpty() && reply.length() <= 5000) {
                    try {
                        JSONObject body = new JSONObject().put("body", reply).put("requestId", request);
                        String path = "/api/store-chat/stores/" + Uri.encode(store)
                            + "/messages/" + Uri.encode(message) + "/notification-reply";
                        sent = new ChatApi().notificationReply(path, body, token).optBoolean("ok");
                    } catch (Exception ignored) { /* Keep the result unconfirmed without persisting or retrying the reply. */ }
                }
                if (matchesSession(app, vault.load(), binding, store, company)) {
                    ChatMessagingService.showReplyStatus(app, store, company, binding, message, sent);
                }
            } catch (Exception ignored) { /* No payload or credential logging. */ }
            finally { pending.finish(); }
        }, "chat-notification-reply").start();
    }

    private static boolean matchesSession(Context context, String token, String binding, String store, String company) throws Exception {
        if (!NativePush.opted(context) || !NativePush.valid(token) || !binding.equals(NativePush.binding(token))) return false;
        JSONObject user = NativePush.identity(token);
        return !"STORE_CHAT_OPERATOR".equals(user.optString("tokenType"))
            || (store.equals(user.optString("storeId")) && company.equals(user.optString("companyId")));
    }
}
