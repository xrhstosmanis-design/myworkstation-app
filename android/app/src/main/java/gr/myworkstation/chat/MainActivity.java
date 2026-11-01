package gr.myworkstation.chat;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputFilter;
import android.text.InputType;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/** Native Android views. No WebView, message database, image cache, download or clipboard pathway. */
public final class MainActivity extends Activity {
    private static final int PURPLE = 0xff7052c8, INK = 0xff242234, MUTED = 0xff777187, PHOTO = 41, CAMERA = 42, VOICE = 43, VIDEO = 44;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newFixedThreadPool(2);
    private ChatApi api = new ChatApi();
    private final RequestEpoch epoch = new RequestEpoch();
    private TokenVault vault, pendingTwoFactor;
    private String pushStore = "", pushCompany = "";
    private String entryStore = "";
    private String token = "", challenge = "", view = "login", tab = "chat", photoBinding = "", photoToken = "";
    private JSONObject identity = new JSONObject(), selected;
    private JSONArray history = new JSONArray();
    private final PhotoBatch photos = new PhotoBatch();
    private String photoSelectionNotice = "";
    private String uncertainStoreId = "";
    private boolean foreground, busy, photosEnabled = true;
    private LinearLayout root, content, messages;
    private ScrollView scroll;
    private ScrollView contentScroll;
    private TextView notice, attachmentLabel;
    private EditText composer;
    private Button chatSendButton;
    private AlertDialog imageDialog, replyDialog;
    private final VoicePlayer voicePlayer = new VoicePlayer();
    private byte[] voiceDraft, playingVoice;
    private String voiceBinding = "", voiceToken = "";
    private boolean voiceAvailable;
    private Button voiceButton;
    private TextView voiceLabel;
    private byte[] videoDraft, playingVideo;
    private String videoBinding = "", videoToken = "";
    private boolean videoAvailable;
    private Button videoButton;
    private TextView videoLabel;
    private boolean searchForwardReady, chatCanForward;
    private Button historySearchButton;
    private int searchGeneration;
    private String uncertainForwardStoreId = "";
    private boolean interactionsReady, chatCanPin, chatCanManageSettings, acknowledgementRequired;
    private JSONObject quotedMessage;
    private String quoteToken = "", quoteStore = "", quoteCompany = "", messageCategory = "GENERAL";
    private long quoteEpoch;
    private JSONArray pinnedAnnouncements = new JSONArray();
    private TextView quoteLabel;
    private Button categoryButton, announcementsButton, announcementSettingsButton;
    private final VideoPlayer videoPlayer = new VideoPlayer();
    private Bitmap preview;
    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            if (foreground && needsChatRenewal() && selected != null && view.equals("conversation") && !busy)
                call("/api/store-chat/stores/" + enc(identity.optString("storeId")) + "/mobile-renew", "POST", object(), false, MainActivity.this::saveRenewedConnection);
            if (foreground && !token.isEmpty() && selected != null && view.equals("conversation") && tab.equals("chat") && !busy) loadMessages(false);
            if (foreground) ui.postDelayed(this, 10000);
        }
    };
    interface Success { void run(JSONObject value) throws Exception; }

    @Override public void onCreate(Bundle state) {
        super.onCreate(null); // Deliberately do not restore text fields or private saved view state.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if (android.os.Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(false);
        vault = new TokenVault(this); pendingTwoFactor = TokenVault.pendingTwoFactor(this); token = vault.load();
        if (token.isEmpty()) restoreTwoFactor(); else clearTwoFactor();
        receivePushIntent(getIntent());
        receiveStoreEntry(getIntent());
        if (!token.isEmpty()) {
            try { identity = claims(token); if (identity.optLong("exp") * 1000L <= System.currentTimeMillis()) clearSession(); }
            catch (Exception ignored) { clearSession(); }
        }
    }
    @Override protected void onResume() {
        super.onResume(); foreground = true;
        if (!token.isEmpty() && NativePush.opted(this) && !needsChatRenewal()) NativePush.register(this, token, ok -> {});
        if (token.isEmpty()) { restoreTwoFactor(); if (!entryStore.isEmpty()) openEntryStore(); else loginScreen(); }
        else if (needsChatRenewal()) renewChatConnection();
        else if (!pushStore.isEmpty()) stores();
        else if (selected != null) conversation();
        else stores();
        ui.removeCallbacks(refresh); ui.postDelayed(refresh, 10000);
    }
    @Override protected void onStop() {
        foreground = false; epoch.invalidate(); api.cancel(); busy = false; ui.removeCallbacks(refresh);
        history = new JSONArray(); clearPhoto(); clearVoice(); clearVideo(); clearChatInteractions(); dismissImage(); dismissReplies();
        if (root != null) {
            wipeViews(root);
            root.removeAllViews();
            TextView cover = text("MyWorkStation", 24, INK); cover.setGravity(Gravity.CENTER); root.addView(cover);
        }
        messages = null; content = null; contentScroll = null; scroll = null;
        composer = null; notice = null; attachmentLabel = null; chatSendButton = null; voiceButton = null; voiceLabel = null; videoButton = null; videoLabel = null;
        super.onStop();
    }
    @Override protected void onSaveInstanceState(Bundle state) { /* No private UI state in Android's saved-state storage. */ }
    @Override protected void onDestroy() { epoch.invalidate(); api.cancel(); worker.shutdownNow(); clearPhoto(); clearVoice(); clearVideo(); clearChatInteractions(); dismissImage(); dismissReplies(); super.onDestroy(); }
    private JSONObject claims(String value) throws Exception {
        String[] parts = value.split("\\."); if (parts.length != 3) throw new IllegalArgumentException();
        return new JSONObject(new String(Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_WRAP), StandardCharsets.UTF_8));
    }
    private boolean staff() { return identity.optString("tokenType").equals("STORE_CHAT_OPERATOR"); }
    private boolean platform() { return SessionAccess.platform(identity) && !identity.optBoolean("supportContext"); }
    private String id(JSONObject value, String key) { return value == null ? "" : value.optString(key); }
    private String enc(String value) { return Uri.encode(value); }
    private String chatBase() { return "/api/store-chat/stores/" + enc(id(selected, "id")); }
    private void call(String path, String method, JSONObject body, boolean anonymous, Success success) {
        if (busy) return;
        busy = true; final long generation = epoch.capture(); final String captured = token;
        if (chatSendButton != null) chatSendButton.setEnabled(false);
        boolean messageRequest = selected != null && (path.equals(chatBase() + "/messages") || path.startsWith(chatBase() + "/messages?") || path.equals(chatBase() + "/voice-messages") || path.equals(chatBase() + "/video-messages"));
        status(messageRequest && method.equals("GET") ? "Ανανέωση μηνυμάτων…" : messageRequest && method.equals("POST") ? "Αποστολή μηνύματος…" : "Σύνδεση…");
        worker.execute(() -> {
            try {
                JSONObject result = api.json(path, method, body, anonymous ? "" : captured);
                ui.post(() -> {
                    if (!foreground || !epoch.current(generation) || !captured.equals(token)) return;
                    busy = false; if (chatSendButton != null) chatSendButton.setEnabled(true); status("");
                    try { success.run(result); } catch (Exception ignored) { status("Δεν επιβεβαιώθηκαν τα στοιχεία. Ανανέωσε ή συνδέσου ξανά."); }
                });
            } catch (Exception error) {
                ui.post(() -> {
                    if (!foreground || !epoch.current(generation) || !captured.equals(token)) return;
                    busy = false; if (chatSendButton != null) chatSendButton.setEnabled(true);
                    if (!anonymous && error instanceof ChatApi.Failure && ((ChatApi.Failure) error).status == 401) {
                        clearSession(); loginScreen(); status("Η σύνδεση έληξε. Συνδέσου ξανά.");
                    } else status(error instanceof ChatApi.Failure ? error.getMessage() : "Δεν ολοκληρώθηκε η σύνδεση. Ανανέωσε πριν ξαναστείλεις μήνυμα.");
                });
            }
        });
    }
    private JSONObject object(Object... fields) {
        JSONObject result = new JSONObject();
        try { for (int n = 0; n < fields.length; n += 2) result.put((String) fields[n], fields[n + 1]); }
        catch (Exception impossible) { throw new IllegalArgumentException(); }
        return result;
    }
    private void navigate() { epoch.invalidate(); api.cancel(); busy = false; history = new JSONArray(); clearPhoto(); clearVoice(); clearVideo(); clearChatInteractions(); dismissImage(); dismissReplies(); hideKeyboard(); }
    private void accept(JSONObject result) throws Exception {
        if (result.optBoolean("setupRequired")) { status("Ολοκλήρωσε πρώτα το 2FA από τη συνήθη είσοδο Super Admin."); return; }
        if (result.optBoolean("mfaRequired")) {
            String nextChallenge = result.getString("challengeToken");
            if (!TwoFactorChallenge.usable(nextChallenge, System.currentTimeMillis())) throw new IllegalArgumentException("Invalid 2FA challenge");
            pendingTwoFactor.save(nextChallenge); challenge = nextChallenge; loginScreen(); return;
        }
        JSONObject user = result.optJSONObject("user");
        if (user == null || user.optBoolean("mustChangePassword")) { status("Χρειάζεται αλλαγή προσωρινού κωδικού από το Backoffice."); return; }
        String next = result.getString("token"); JSONObject decoded = claims(next);
        if (!decoded.optString("tokenType").equals("BACKOFFICE_USER") && !decoded.optString("tokenType").equals("STORE_CHAT_OPERATOR")) throw new IllegalArgumentException();
        NativePush.clearNotifications(this); vault.save(next); navigate(); token = next; identity = decoded; clearTwoFactor(); entryStore = ""; selected = null; stores();
    }
    private void restoreTwoFactor() {
        String saved = pendingTwoFactor.load();
        if (TwoFactorChallenge.usable(saved, System.currentTimeMillis())) challenge = saved;
        else clearTwoFactor();
    }
    private void clearTwoFactor() { challenge = ""; pendingTwoFactor.clear(); }
    private void loginScreen() {
        view = "login"; layout("MyWorkStation Chat", "Οι συνομιλίες μένουν στον server");
        TextView heading = text(challenge.isEmpty() ? "Καλώς ήρθες" : "Επιβεβαίωση σύνδεσης", 28, INK); content.addView(heading);
        content.addView(text("Μηνύματα καταστημάτων και βοηθός AI", 17, MUTED));
        EditText email = input("Email", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, 240);
        EditText password = input(challenge.isEmpty() ? "Κωδικός" : "Κωδικός 2FA", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD, 100);
        if (challenge.isEmpty()) content.addView(email); content.addView(password);
        content.addView(button("Σύνδεση", () -> {
            if (busy) return;
            if (!challenge.isEmpty() && !TwoFactorChallenge.usable(challenge, System.currentTimeMillis())) {
                clearTwoFactor(); loginScreen(); status("Η επιβεβαίωση έληξε μετά από 5 λεπτά. Συνδέσου ξανά."); return;
            }
            String value = password.getText().toString(); password.setText("");
            JSONObject body = challenge.isEmpty() ? object("email", email.getText().toString().trim(), "password", value, "deviceName", "MW Chat Android") : object("challengeToken", challenge, "code", value, "deviceName", "MW Chat Android");
            call(challenge.isEmpty() ? "/api/auth/login" : "/api/auth/2fa/verify", "POST", body, true, this::accept);
        }));
        content.addView(button("Σύνδεση εργαζομένου με PIN", () -> { navigate(); clearTwoFactor(); operatorEntry(); }));
        if (!challenge.isEmpty()) content.addView(button("Άλλος λογαριασμός", () -> { navigate(); clearTwoFactor(); loginScreen(); }));
        content.addView(text("Χωρίς τοπικό ιστορικό, αποθήκευση φωτογραφιών ή λήψεις. Κρατούνται κρυπτογραφημένα η σύνδεση και, προσωρινά, η επιβεβαίωση 2FA. Δεν αποθηκεύονται κωδικοί πρόσβασης ή 2FA.", 14, MUTED));
        content.addView(text("Δοκιμαστική έκδοση · Οι ειδοποιήσεις με κλειστή εφαρμογή δεν έχουν ακόμη συνδεθεί.", 14, MUTED));
    }
    private void operatorEntry() {
        entryStore = "";
        view = "operator"; layout("Προσωπικό καταστήματος", "Σύνδεση μόνο στο δικό σου Chat");
        EditText link = input("Σύνδεσμος Chat από τον υπεύθυνο", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI, 500); content.addView(link);
        content.addView(button("Εύρεση καταστήματος", () -> {
            try {
                Uri uri = Uri.parse(link.getText().toString().trim());
                if (!"https".equals(uri.getScheme()) || !"myworkstation-app.onrender.com".equals(uri.getHost()) || uri.getPort() != -1 || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null || uri.getPathSegments().size() != 2 || !uri.getPathSegments().get(0).equals("chat")) throw new IllegalArgumentException();
                String storeId = uri.getPathSegments().get(1);
                call("/api/operators/stores/" + enc(storeId) + "/directory", "GET", null, true, data -> operatorPin(storeId, data));
            } catch (Exception ignored) { status("Χρειάζεται ο ακριβής σύνδεσμος Chat του καταστήματος."); }
        }));
        content.addView(button("Πίσω", this::loginScreen));
    }
    private void receiveStoreEntry(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        String hint = StoreEntry.parse(intent.getDataString());
        intent.setData(null);
        if (token.isEmpty() && challenge.isEmpty() && !hint.isEmpty()) entryStore = hint;
    }
    private void openEntryStore() {
        final String storeId = entryStore;
        view = "operator"; layout("Σύνδεση στο κατάστημα", "Επίλεξε το όνομά σου και το προσωπικό σου PIN");
        content.addView(button("Άλλος τρόπος σύνδεσης", () -> { entryStore = ""; navigate(); loginScreen(); }));
        call("/api/operators/stores/" + enc(storeId) + "/directory", "GET", null, true, data -> {
            if (entryStore.equals(storeId)) operatorPin(storeId, data);
        });
    }
    private void renewChatConnection() {
        layout("Σύνδεση Chat", "Επαναφορά της σύνδεσής σου…");
        call("/api/store-chat/stores/" + enc(identity.optString("storeId")) + "/mobile-renew", "POST", object(), false, data -> {
            saveRenewedConnection(data);
            if (selected != null) conversation(); else stores();
        });
        content.addView(button("Συνέχεια χωρίς ανανέωση", () -> { navigate(); stores(); }));
    }
    private boolean needsChatRenewal() {
        return !token.isEmpty() && staff() && identity.optLong("exp") * 1000L - System.currentTimeMillis() < 29L * 86400000L;
    }
    private void saveRenewedConnection(JSONObject data) throws Exception {
        String next = data.getString("token"); JSONObject decoded = claims(next);
        if (!decoded.optString("tokenType").equals("STORE_CHAT_OPERATOR")
            || !decoded.optString("id").equals(identity.optString("id"))
            || !decoded.optString("companyId").equals(identity.optString("companyId"))
            || !decoded.optString("chatSessionId").equals(identity.optString("chatSessionId"))
            || !decoded.optString("storeId").equals(identity.optString("storeId"))
            || decoded.optLong("exp") * 1000L <= System.currentTimeMillis()) throw new IllegalArgumentException();
        vault.save(next); token = next; identity = decoded;
        if (NativePush.opted(this)) NativePush.register(this, token, ok -> {});
    }
    private void operatorPin(String storeId, JSONObject data) {
        layout("Προσωπικό PIN", "Μόνο συνομιλία καταστήματος");
        JSONObject entry = data.optJSONObject("store");
        if (entry == null || !storeId.equals(entry.optString("id"))) { status("Δεν επιβεβαιώθηκε το κατάστημα."); return; }
        content.addView(text(entry.optString("name"), 24, INK));
        JSONArray operators = data.optJSONArray("operators"); if (operators == null) operators = data.optJSONArray("rows");
        ArrayList<String> names = new ArrayList<>(), ids = new ArrayList<>();
        if (operators != null) for (int n = 0; n < operators.length(); n++) { JSONObject row = operators.optJSONObject(n); if (row != null && row.optBoolean("hasPin")) { names.add(row.optString("displayName")); ids.add(row.optString("employeeId")); } }
        if (ids.isEmpty()) { status("Δεν υπάρχει ενεργός εργαζόμενος με PIN."); content.addView(button("Πίσω", this::operatorEntry)); return; }
        Spinner spinner = new Spinner(this); spinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, names)); spinner.setMinimumHeight(dp(56)); content.addView(spinner);
        EditText pin = input("PIN", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD, 8); content.addView(pin);
        content.addView(button("Άνοιγμα Chat", () -> { String value = pin.getText().toString(); pin.setText(""); call("/api/operators/login/chat-pin", "POST", object("storeId", storeId, "employeeId", ids.get(spinner.getSelectedItemPosition()), "pin", value), true, this::accept); }));
        content.addView(button("Πίσω", this::operatorEntry));
    }
    private void stores() {
        if (token.isEmpty()) { loginScreen(); return; }
        view = "stores"; selected = null; tab = "chat"; layout("Συνομιλίες", "MyWorkStation · Android Preview");
        content.addView(button("Αποσύνδεση", this::logout));
        content.addView(button("Ενεργοποίηση ειδοποιήσεων", this::enableNativePush));
        content.addView(text("Οι ειδοποιήσεις δείχνουν μόνο ότι υπάρχει νέο μήνυμα. Απαιτείται ενεργή σύνδεση και ρύθμιση server.", 14, MUTED));
        if (staff()) {
            JSONObject own = object("id", identity.optString("storeId"), "companyId", identity.optString("companyId"), "name", "Το κατάστημά μου");
            if (pushStore.equals(own.optString("id")) && pushCompany.equals(own.optString("companyId"))) { pushStore = ""; pushCompany = ""; chooseStore(own); return; }
            pushStore = ""; pushCompany = ""; storeRow(own); return;
        }
        call("/api/store-chat/mobile/stores", "GET", null, false, data -> {
            JSONArray rows = data.getJSONArray("stores");
            if (rows.length() == 0) status("Δεν υπάρχουν διαθέσιμα καταστήματα Chat.");
            for (int i = 0; i < rows.length(); i++) storeRow(rows.getJSONObject(i));
            if (!pushStore.isEmpty()) {
                String wanted = pushStore, company = pushCompany; pushStore = ""; pushCompany = "";
                for (int i = 0; i < rows.length(); i++) { JSONObject row = rows.getJSONObject(i); if (wanted.equals(row.optString("id")) && company.equals(row.optString("companyId"))) { chooseStore(row); return; } }
                status("Δεν υπάρχει πλέον πρόσβαση στη συνομιλία της ειδοποίησης.");
            }
        });
    }
    private void storeRow(JSONObject store) {
        String unread = store.optInt("unread") > 0 ? " · " + store.optInt("unread") + " νέα" : "";
        Button row = button("●  " + store.optString("name") + unread + "\n" + store.optString("companyName", "Συνομιλία καταστήματος"), () -> chooseStore(store));
        row.setGravity(Gravity.START | Gravity.CENTER_VERTICAL); row.setMinHeight(dp(84)); content.addView(row);
    }
    private void chooseStore(JSONObject store) {
        if (busy) return;
        navigate();
        if (SessionAccess.switchOwnerCompany(identity, store.optString("companyId"))) {
            call("/api/auth/owner-companies/select", "POST", object("companyId", store.optString("companyId")), false, result -> {
                String next = result.getString("token"); JSONObject decoded = claims(next);
                if (!decoded.optString("companyId").equals(store.optString("companyId"))) throw new IllegalArgumentException();
                vault.save(next); token = next; identity = decoded; NativePush.clearNotifications(this); if (NativePush.opted(this)) NativePush.register(this, next, ok -> {}); epoch.invalidate(); selected = store; conversation();
            });
        } else { selected = store; conversation(); }
    }
    private void conversation() {
        view = "conversation"; layout(selected.optString("name"), tab.equals("ai") ? "Βοηθός AI · επιλεγμένο κατάστημα" : "Μηνύματα καταστήματος");
        LinearLayout header = (LinearLayout) root.getChildAt(0);
        header.setPadding(dp(16), dp(12), dp(16), dp(10));
        ((TextView) header.getChildAt(0)).setTextSize(20);
        LinearLayout tabs = new LinearLayout(this); tabs.setPadding(dp(8), dp(4), dp(8), dp(4));
        tabs.addView(chatButton("‹ Συνομιλίες", () -> { navigate(); selected = null; stores(); }, false), toolParams());
        tabs.addView(chatButton(tab.equals("ai") ? "Μηνύματα" : "Βοηθός AI", () -> {
            if (busy) return; navigate(); tab = tab.equals("ai") ? "chat" : "ai"; conversation();
        }, false), toolParams());
        if (tab.equals("chat")) { Button more=chatButton("⋮", scopedChatAction(this::showChatTools), false); more.setContentDescription("Περισσότερα εργαλεία συνομιλίας"); tabs.addView(more,new LinearLayout.LayoutParams(dp(48),dp(48))); }
        root.addView(tabs, 1);
        if (tab.equals("chat")) {
            LinearLayout options = new LinearLayout(this);
            categoryButton = chatButton("Γενικό", scopedChatAction(() -> { if (!chatCanPin) return; messageCategory = messageCategory.equals("GENERAL") ? "ANNOUNCEMENT" : "GENERAL"; categoryButton.setText(messageCategory.equals("GENERAL") ? "Γενικό" : "Ανακοίνωση"); }), false);
            categoryButton.setContentDescription("Κατηγορία νέου μηνύματος"); categoryButton.setVisibility(View.GONE); options.addView(categoryButton, toolParams());
            announcementSettingsButton = chatButton("Ρυθμίσεις", scopedChatAction(this::showAnnouncementSettings), false); announcementSettingsButton.setVisibility(View.GONE); options.addView(announcementSettingsButton, toolParams());
            announcementsButton = chatButton("Ανακοινώσεις", scopedChatAction(this::showPinnedAnnouncements), false); announcementsButton.setVisibility(View.GONE); options.addView(announcementsButton, toolParams()); options.setVisibility(View.GONE); root.addView(options, 2);
            historySearchButton = chatButton("Αναζήτηση μηνυμάτων", scopedChatAction(this::showHistorySearch), false); historySearchButton.setVisibility(View.GONE); options.addView(historySearchButton);
        }

        root.removeView(contentScroll); scroll = new ScrollView(this); scroll.setFillViewport(false); scroll.setBackgroundColor(0xfff4f1f8);
        messages = new LinearLayout(this); messages.setOrientation(LinearLayout.VERTICAL); messages.setPadding(dp(12), dp(8), dp(12), dp(8)); scroll.addView(messages);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        root.removeView(notice); root.addView(notice);
        if (tab.equals("ai") && (staff() || (!platform() && !identity.optString("role").equals("OWNER")))) {
            bubble("Ο βοηθός δεν είναι διαθέσιμος με τα δικαιώματα αυτού του λογαριασμού.", false, "", null); return;
        }
        attachmentLabel = text("", 14, MUTED); attachmentLabel.setVisibility(View.GONE); root.addView(attachmentLabel);
        if (tab.equals("chat")) {
            LinearLayout extras = new LinearLayout(this); extras.setTag("chat-tools"); extras.setPadding(dp(8), dp(6), dp(8), 0);
            Button replies = chatButton("Έτοιμες", this::pickReply, false); replies.setContentDescription("Έτοιμες απαντήσεις"); extras.addView(replies, toolParams());
            voiceButton = chatButton("Φωνητικό", this::recordVoice, false); voiceButton.setContentDescription("Μικρόφωνο · εγγραφή φωνητικού"); voiceButton.setEnabled(false); extras.addView(voiceButton, toolParams());
            videoButton = chatButton("Βίντεο", this::recordVideo, false); videoButton.setContentDescription("Βίντεο · κάμερα / συλλογή"); videoButton.setEnabled(false); extras.addView(videoButton, toolParams()); extras.setVisibility(View.GONE); root.addView(extras);
            voiceLabel = text("", 14, MUTED); voiceLabel.setVisibility(View.GONE); voiceLabel.setOnClickListener(v -> reviewVoice()); root.addView(voiceLabel);
            videoLabel = text("", 14, MUTED); videoLabel.setVisibility(View.GONE); videoLabel.setOnClickListener(v -> reviewVideo()); root.addView(videoLabel);
        }
        LinearLayout bar = new LinearLayout(this); bar.setTag("chat-composer"); bar.setGravity(Gravity.CENTER_VERTICAL); bar.setPadding(dp(10), dp(8), dp(10), dp(8));
        if (tab.equals("chat")) { Button add = chatButton("＋", this::showAttachmentTools, false); add.setContentDescription("Προσθήκη συνημμένου και έτοιμες απαντήσεις"); bar.addView(add, new LinearLayout.LayoutParams(dp(48), dp(48))); }
        composer = input(tab.equals("ai") ? "Ρώτησε τον βοηθό…" : "Γράψε μήνυμα…", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS, tab.equals("ai") ? 600 : 5000);
        composer.setMaxLines(4); composer.setMinHeight(dp(48)); composer.setBackground(round(0xfff4f1f8, 24)); composer.setPadding(dp(14), dp(10), dp(14), dp(10)); LinearLayout.LayoutParams field = new LinearLayout.LayoutParams(0, -2, 1); field.setMargins(dp(6), 0, dp(6), 0); bar.addView(composer, field);
        Button send = chatButton("➤", this::send, true); send.setContentDescription("Αποστολή μηνύματος");
        if (tab.equals("chat")) { chatSendButton = send; send.setEnabled(!busy); }
        bar.addView(send, new LinearLayout.LayoutParams(dp(48), dp(48))); root.addView(bar);
        quoteLabel = text("", 14, PURPLE); quoteLabel.setMaxLines(3); quoteLabel.setMinHeight(dp(44)); quoteLabel.setVisibility(View.GONE); quoteLabel.setContentDescription("Ακύρωση απάντησης"); quoteLabel.setOnClickListener(v -> { if (!busy) clearQuote(); }); root.addView(quoteLabel, root.getChildCount() - 1);
        updatePhotoLabel();
        updateVoiceLabel(); updateVideoLabel();
        if (tab.equals("chat")) loadMessages(true); else checkAssistant();
    }
    private void loadMessages(boolean initial) {
        if (selected == null || busy) return;
        call(chatBase() + "/messages?limit=100", "GET", null, false, data -> {
            JSONObject store = data.getJSONObject("store");
            if (!id(store, "id").equals(id(selected, "id")) || !id(store, "companyId").equals(id(selected, "companyId"))) throw new IllegalArgumentException();
            photosEnabled = data.optJSONObject("settings") == null || data.getJSONObject("settings").optBoolean("photosEnabled", true);
            videoAvailable = data.optBoolean("videoMessagesAvailable", false);
            if (videoButton != null) videoButton.setEnabled(videoAvailable);
            voiceAvailable = data.optBoolean("voiceMessagesAvailable", false);
            if (voiceButton != null) voiceButton.setEnabled(voiceAvailable);
            interactionsReady = data.optBoolean("interactionsAvailable", false);
            JSONObject permissions = data.optJSONObject("permissions"), settings = data.optJSONObject("settings");
            searchForwardReady = data.optBoolean("searchForwardAvailable"); chatCanForward = searchForwardReady && permissions != null && permissions.optBoolean("canForward");
            if (historySearchButton != null) historySearchButton.setVisibility(searchForwardReady ? View.VISIBLE : View.GONE);
            chatCanPin = interactionsReady && permissions != null && permissions.optBoolean("canPin");
            chatCanManageSettings = interactionsReady && permissions != null && permissions.optBoolean("canManageSettings");
            if (announcementSettingsButton != null) announcementSettingsButton.setVisibility(chatCanManageSettings ? View.VISIBLE : View.GONE);
            acknowledgementRequired = interactionsReady && settings != null && settings.optBoolean("announcementAcknowledgementRequired");
            if (categoryButton != null) categoryButton.setVisibility(chatCanPin ? View.VISIBLE : View.GONE);
            if (!chatCanPin) { messageCategory = "GENERAL"; if (categoryButton != null) categoryButton.setText("Γενικό"); }
            pinnedAnnouncements = new JSONArray(); JSONArray suppliedPins = data.optJSONArray("pinnedAnnouncements");
            if (interactionsReady && suppliedPins != null) for (int i = 0; i < suppliedPins.length() && pinnedAnnouncements.length() < 20; i++) { JSONObject item = suppliedPins.optJSONObject(i); if (item != null && item.optBoolean("pinned") && item.optString("category").equals("ANNOUNCEMENT") && ChatInteractions.validId(item.optString("id"))) pinnedAnnouncements.put(item); }
            if (announcementsButton != null) { announcementsButton.setText("Ανακοινώσεις (" + pinnedAnnouncements.length() + ")"); announcementsButton.setVisibility(pinnedAnnouncements.length() == 0 ? View.GONE : View.VISIBLE); }
            JSONArray rows = data.getJSONArray("rows"); ArrayList<JSONObject> sorted = new ArrayList<>();
            for (int n = 0; n < rows.length(); n++) sorted.add(rows.getJSONObject(n));
            sorted.sort(Comparator.comparing(row -> row.optString("createdAt")));
            int oldY = scroll.getScrollY(); boolean atBottom = scroll.getChildAt(0).getHeight() - scroll.getHeight() - oldY < dp(90);
            messages.removeAllViews();
            if (sorted.isEmpty()) bubble("Δεν υπάρχουν ακόμη μηνύματα.", false, "", null);
            for (JSONObject row : sorted) {
                boolean own = row.optString("senderId").equals(identity.optString("id"));
                String meta = row.optString("senderName") + " · " + time(row.optString("createdAt"));
                bubble(row.optString("body", ""), own, meta, row);
            }
            if (uncertainStoreId.equals(id(selected, "id"))) {
                bubble("Η τελευταία αποστολή μπορεί να έχει ολοκληρωθεί. Έλεγξε τα μηνύματα πριν συντάξεις νέα αποστολή.", false, "Έλεγχος αποστολής", null);
                messages.addView(button("Απόρριψη παλιού προσχεδίου · νέα σύνταξη", () -> {
                    uncertainStoreId = ""; composer.setText(""); clearQuote(); messageCategory = "GENERAL"; clearPhoto(); clearVoice(); clearVideo(); updatePhotoLabel(); updateVoiceLabel(); updateVideoLabel(); loadMessages(false);
                }));
            }
            scroll.post(() -> { if (initial || atBottom) scroll.fullScroll(View.FOCUS_DOWN); else scroll.scrollTo(0, oldY); });
            if (interactionsReady) {
                JSONArray received = new JSONArray(); for (JSONObject row : sorted) received.put(row); for (int i = 0; i < pinnedAnnouncements.length(); i++) received.put(pinnedAnnouncements.optJSONObject(i));
                JSONArray ids = ChatInteractions.deliveryIds(received, identity.optString("id"));
                if (ids.length() > 0) call(chatBase() + "/messages/delivered", "POST", object("messageIds", ids), false, receipt -> { if (!receipt.optBoolean("ok")) throw new IllegalArgumentException(); });
            }

        });
    }
    private String assistantBase() { return platform() ? "/api/platform/ai-command-center" : "/api/owner-assistant/stores/" + enc(id(selected, "id")); }
    private String assistantQuery() { return "?readScope=selected_store" + (platform() ? "&companyId=" + enc(id(selected, "companyId")) + "&storeId=" + enc(id(selected, "id")) : ""); }
    private void checkAssistant() {
        call(assistantBase() + "/status" + assistantQuery(), "GET", null, false, value -> {
            if (!value.optBoolean("available") || !sameScope(value.optJSONObject("scope"))) { status("Ο βοηθός δεν είναι διαθέσιμος για αυτό το κατάστημα."); composer.setEnabled(false); return; }
            bubble("Τι θέλεις να ελέγξουμε στο «" + selected.optString("name") + "»;", false, "Βοηθός MyWorkStation", null);
        });
    }
    private boolean sameScope(JSONObject scope) { return EvidenceScope.matches(scope, id(selected, "companyId"), id(selected, "id")); }
    private boolean validEvidence(JSONObject answer) throws Exception {
        return EvidenceScope.valid(answer, id(selected, "companyId"), id(selected, "id"), platform());
    }
    private void send() {
        if (busy || composer == null || !composer.isEnabled()) return;
        if (tab.equals("chat") && uncertainStoreId.equals(id(selected, "id"))) { status("Έλεγξε το ιστορικό και απόρριψε το παλιό προσχέδιο πριν από νέα αποστολή."); loadMessages(true); return; }
        String value = composer.getText().toString().trim(); if (value.isEmpty() && photos.size() == 0 && voiceDraft == null && videoDraft == null) return;
        if (tab.equals("ai")) {
            if (value.length() < 3) { status("Γράψε τουλάχιστον τρεις χαρακτήρες."); return; }
            JSONArray previous = new JSONArray();
            try { for (int n = Math.max(0, history.length() - 10); n < history.length(); n++) previous.put(history.get(n)); } catch (Exception ignored) { return; }
            JSONObject body = object("question", value, "inputChannel", "text", "readScope", "selected_store", "history", previous);
            if (platform()) { try { body.put("selection", object("companyId", id(selected, "companyId"), "storeId", id(selected, "id"))); body.put("snapshot", JSONObject.NULL); } catch (Exception ignored) { return; } }
            call(assistantBase() + "/ask", "POST", body, false, answer -> {
                if (!validEvidence(answer)) throw new IllegalArgumentException();
                bubble(value, true, "Εσύ", null); composer.setText("");
                String result = answer.optString("answer") + (answer.optString("limitations").isEmpty() ? "" : "\n\n" + answer.optString("limitations"));
                bubble(result, false, "Βοηθός · " + time(answer.optString("generatedAt")), null);
                JSONArray evidence = answer.optJSONArray("evidence");
                if (evidence != null && evidence.length() > 0) {
                    Button sources = button("Προβολή αναγνωσμένων στοιχείων", () -> showEvidence(evidence)); messages.addView(sources);
                }
                history.put(object("role", "user", "content", value)); history.put(object("role", "assistant", "content", answer.optString("answer").substring(0, Math.min(2000, answer.optString("answer").length()))));
                while (history.length() > 10) history.remove(0);
                scroll.post(() -> scroll.fullScroll(View.FOCUS_DOWN));
            });
        } else {
            if (videoDraft != null) sendVideoMessage(value); else if (voiceDraft != null) sendVoiceMessage(value); else sendPhotoMessage(value);
        }
    }
    private void sendPhotoMessage(String value) {
        if (busy || !foreground || selected == null || !tab.equals("chat")) return;
        JSONObject body = object("body", value, "category", messageCategory);
        if (!attachQuote(body)) return;
        final PhotoBatch.Photo first = photos.size() == 0 ? null : photos.get(0);
        if (first != null) {
            if (!photosEnabled) { status("Οι φωτογραφίες είναι ανενεργές για αυτό το κατάστημα."); return; }
            try { body.put("attachment", object("name", first.mime.equals("image/png") ? "photo.png" : first.mime.equals("image/webp") ? "photo.webp" : "photo.jpg", "mimeType", first.mime, "dataUrl", "data:" + first.mime + ";base64," + Base64.encodeToString(first.bytes, Base64.NO_WRAP))); }
            catch (Exception ignored) { return; }
        }
        uncertainStoreId = id(selected, "id");
        call(chatBase() + "/messages", "POST", body, false, result -> {
            // A 2xx without an explicit receipt is still an unknown outcome. Never advance/replay.
            if (!result.optBoolean("ok") || result.optString("id").trim().isEmpty()) throw new IllegalArgumentException();
            uncertainStoreId = ""; clearQuote(); messageCategory = "GENERAL"; if (categoryButton != null) categoryButton.setText("Γενικό");
            if (composer.getText().toString().trim().equals(value)) composer.setText("");
            if (first != null) photos.remove(0);
            updatePhotoLabel();
            if (photos.size() > 0) sendPhotoMessage(""); else loadMessages(true);
        });
    }
    private void bubble(String body, boolean own, String meta, JSONObject row) {
        final ArrayList<String> readers = own && row != null ? ReadReceipts.names(row.optJSONArray("readers"), row.optString("senderId")) : new ArrayList<>();
        LinearLayout card = new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(14), dp(10), dp(14), dp(10)); card.setBackground(round(own ? 0xffe8defc : Color.WHITE, 18));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2); lp.gravity = own ? Gravity.END : Gravity.START; lp.setMargins(own ? dp(28) : 0, dp(5), own ? 0 : dp(28), dp(5));
        if (row != null && !row.optString("replyToId").isEmpty() && !row.isNull("replyToId")) {
            JSONObject quote = row.optJSONObject("replyTo");
            card.addView(text(quote == null ? "Το αρχικό μήνυμα δεν είναι διαθέσιμο." : "↪ " + quote.optString("senderName", "Χρήστης") + " · " + ChatInteractions.preview(quote), 14, PURPLE));
        }
        if (row != null && row.optBoolean("pinned")) card.addView(text("ΚΑΡΦΙΤΣΩΜΕΝΗ ΑΝΑΚΟΙΝΩΣΗ", 12, PURPLE));
        if (row != null && row.optBoolean("forwarded")) card.addView(text("Προωθημένο μήνυμα", 12, PURPLE));
        if (!body.isEmpty()) card.addView(text(body, 17, INK));
        if (row != null && row.optBoolean("hasAttachment")) {
            if (row.optString("attachmentMimeType").startsWith("image/")) card.addView(chatButton("▧ Φωτογραφία · προβολή", () -> viewPhoto(row), false));
            else if (row.optString("attachmentMimeType").equals("video/mp4")) card.addView(chatButton("▶ Βίντεο · αναπαραγωγή", () -> viewVideo(row), false));
            else if (row.optString("attachmentMimeType").equals("audio/wav")) card.addView(chatButton("▶ Φωνητικό · αναπαραγωγή", () -> viewVoice(row), false));
            else card.addView(text("Συνημμένο · Η λήψη αρχείων είναι απενεργοποιημένη σε αυτή την εφαρμογή.", 14, MUTED));
        }
        if (!readers.isEmpty()) meta += " · Διαβάστηκε";
        if (!meta.isEmpty()) card.addView(text(meta, 12, MUTED));
        LinearLayout actions=new LinearLayout(this); actions.setOrientation(LinearLayout.VERTICAL); actions.setTag("message-actions");
        if (own && row != null && selected != null) {
            final long generation = epoch.capture();
            final String capturedToken = token, storeId = id(selected, "id"), companyId = id(selected, "companyId");
            if (!readers.isEmpty()) actions.addView(button("Διαβάστηκε από " + readers.size(), scopedMessageAction(() -> {
                if (!foreground || !epoch.current(generation) || !capturedToken.equals(token)
                    || storeId.isEmpty() || companyId.isEmpty()
                    || !storeId.equals(id(selected, "id")) || !companyId.equals(id(selected, "companyId"))) return;
                dismissImage();
                imageDialog = new AlertDialog.Builder(this).setTitle("Διαβάστηκε από")
                    .setItems(readers.toArray(new String[0]), null).setPositiveButton("Κλείσιμο", null).create();
                imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); imageDialog.show();
            })));
        }
        if (row != null && interactionsReady && ChatInteractions.validId(row.optString("id"))) {
            actions.addView(button("Απάντηση", scopedMessageAction(() -> chooseChatReply(row))));
            if (searchForwardReady && chatCanForward) actions.addView(button("Προώθηση", scopedMessageAction(() -> showForwardTargets(row))));
            LinearLayout reactions = new LinearLayout(this); final String mine = ChatInteractions.mine(row, identity.optString("id"));
            for (String emoji : ChatInteractions.REACTIONS) {
                int count = ChatInteractions.count(row, emoji); Button reaction = chatButton(emoji + (count == 0 ? "" : " " + count), scopedMessageAction(() -> updateReaction(row, mine.equals(emoji) ? null : emoji)), mine.equals(emoji));
                reaction.setContentDescription("Αντίδραση " + emoji + (mine.equals(emoji) ? " · αφαίρεση" : "")); reactions.addView(reaction, toolParams());
            }
            actions.addView(reactions);
            if (own) { ArrayList<String> delivered = ReadReceipts.names(row.optJSONArray("deliveries"), row.optString("senderId")); if (!delivered.isEmpty()) actions.addView(button("Παραδόθηκε σε " + delivered.size(), scopedMessageAction(() -> showChatPeople("Παραδόθηκε σε εφαρμογή", row.optJSONArray("deliveries"), row.optString("senderId"))))); }
            if (row.optString("category").equals("ANNOUNCEMENT")) {
                if (chatCanPin) actions.addView(button(row.optBoolean("pinned") ? "Ξεκαρφίτσωμα" : "Καρφίτσωμα", scopedMessageAction(() -> pinAnnouncement(row))));
                if (acknowledgementRequired && !row.optBoolean("acknowledgedByMe")) actions.addView(button("Το διάβασα", scopedMessageAction(() -> acknowledgeAnnouncement(row))));
                ArrayList<String> acknowledgements = ReadReceipts.names(row.optJSONArray("acknowledgements"), row.optString("senderId"));
                if (!acknowledgements.isEmpty()) actions.addView(button("Επιβεβαίωσαν " + acknowledgements.size(), scopedMessageAction(() -> showChatPeople("Επιβεβαίωσαν την ανακοίνωση", row.optJSONArray("acknowledgements"), row.optString("senderId")))));
            }
        }
        if (row != null && !row.optBoolean("readByMe")) actions.addView(button("Σημείωση ως διαβασμένο", scopedMessageAction(() -> call(chatBase() + "/messages/" + enc(row.optString("id")) + "/read", "POST", object(), false, ignored -> loadMessages(false)))));
        actions.setVisibility(View.GONE); card.addView(actions);
        if (row != null) {
            StringBuilder summary=new StringBuilder();
            for(String emoji:ChatInteractions.REACTIONS){int count=ChatInteractions.count(row,emoji);if(count>0)summary.append(emoji).append(" ").append(count).append("  ");}
            if(summary.length()>0)card.addView(text(summary.toString(),14,PURPLE));
            card.setContentDescription("Μήνυμα · πάτησε για ενέργειες");
            Runnable open=scopedMessageAction(() -> showMessageActions(card,actions));
            card.setOnClickListener(v -> open.run());card.setOnLongClickListener(v -> {open.run();return true;});
        }
        messages.addView(card, lp);
    }
    private Runnable scopedMessageAction(Runnable action) {
        final long generation=epoch.capture();final String captured=token,store=id(selected,"id"),company=id(selected,"companyId");
        return ()->{if(!busy&&chatScope(generation,captured,store,company)){dismissImage();action.run();}};
    }
    private void showMessageActions(LinearLayout card, LinearLayout actions) {
        dismissImage(); card.removeView(actions); actions.setVisibility(View.VISIBLE);
        ScrollView list=new ScrollView(this);list.addView(actions);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Ενέργειες μηνύματος").setView(list).setNegativeButton("Κλείσιμο",null).create();
        imageDialog=dialog;dialog.setOnDismissListener(d -> {list.removeView(actions);actions.setVisibility(View.GONE);card.addView(actions);if(imageDialog==dialog)imageDialog=null;});
        dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);dialog.show();
    }
    private void showChatTools() {
        ArrayList<Button> available=new ArrayList<>();
        for(Button b:new Button[]{historySearchButton,announcementsButton,categoryButton,announcementSettingsButton})if(b!=null&&b.getVisibility()==View.VISIBLE)available.add(b);
        String[] names=new String[available.size()];for(int i=0;i<names.length;i++)names[i]=available.get(i).getText().toString();
        dismissImage();imageDialog=new AlertDialog.Builder(this).setTitle("Εργαλεία συνομιλίας").setItems(names,(d,i)->{dismissImage();available.get(i).performClick();if(available.get(i)==categoryButton)status("Νέο μήνυμα: "+categoryButton.getText());}).setNegativeButton("Κλείσιμο",null).create();
        imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);imageDialog.show();
    }
    private void showAttachmentTools() {
        if(!foreground||busy||selected==null)return;
        final long generation=epoch.capture();final String captured=token,store=id(selected,"id"),company=id(selected,"companyId");
        ArrayList<String> names=new ArrayList<>();ArrayList<Runnable> choices=new ArrayList<>();
        if(photosEnabled){names.add("Φωτογραφία");choices.add(this::pickPhoto);}
        if(voiceAvailable){names.add("Φωνητικό");choices.add(this::recordVoice);}
        if(videoAvailable){names.add("Βίντεο");choices.add(this::recordVideo);}
        names.add("Έτοιμες απαντήσεις");choices.add(this::pickReply);
        dismissImage();imageDialog=new AlertDialog.Builder(this).setTitle("Προσθήκη").setItems(names.toArray(new String[0]),(d,i)->{dismissImage();if(!busy&&chatScope(generation,captured,store,company))choices.get(i).run();}).setNegativeButton("Κλείσιμο",null).create();
        imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);imageDialog.show();
    }
    private void showFullPhoto(String title, Bitmap bitmap) {
        ZoomPhotoView image=new ZoomPhotoView(this);image.setImageBitmap(bitmap);
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setBackgroundColor(0xff111111);
        TextView caption=text(title,16,Color.WHITE);box.addView(caption);
        LinearLayout controls=new LinearLayout(this);Button zoomOut=chatButton("−",image::zoomOut,false),zoomIn=chatButton("＋",image::zoomIn,false);zoomOut.setContentDescription("Σμίκρυνση φωτογραφίας");zoomIn.setContentDescription("Μεγέθυνση φωτογραφίας");controls.addView(zoomOut,new LinearLayout.LayoutParams(dp(48),dp(48)));controls.addView(zoomIn,new LinearLayout.LayoutParams(dp(48),dp(48)));controls.addView(chatButton("Επαναφορά ζουμ",image::resetZoom,false),toolParams());controls.addView(chatButton("Κλείσιμο",this::dismissImage,false),toolParams());box.addView(controls);
        box.addView(image,new LinearLayout.LayoutParams(-1,0,1));
        AlertDialog dialog=new AlertDialog.Builder(this).create();imageDialog=dialog;
        dialog.setOnDismissListener(d->{image.setImageDrawable(null);if(preview==bitmap)preview=null;if(!bitmap.isRecycled())bitmap.recycle();if(imageDialog==dialog)imageDialog=null;});
        dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);dialog.show();dialog.getWindow().setContentView(box);dialog.getWindow().setLayout(-1,-1);image.post(image::resetZoom);
    }
    private boolean chatScope(long generation, String captured, String store, String company) {
        return foreground && tab.equals("chat") && epoch.current(generation) && captured.equals(token) && !store.isEmpty() && !company.isEmpty() && store.equals(id(selected, "id")) && company.equals(id(selected, "companyId"));
    }
    private Runnable scopedChatAction(Runnable action) {
        final long generation = epoch.capture(); final String captured = token, store = id(selected, "id"), company = id(selected, "companyId");
        return () -> { if (!busy && interactionsReady && chatScope(generation, captured, store, company)) action.run(); };
    }
    private void clearQuote() { quotedMessage = null; quoteToken = ""; quoteStore = ""; quoteCompany = ""; if (quoteLabel != null) { quoteLabel.setText(""); quoteLabel.setVisibility(View.GONE); } }
    private void clearChatInteractions() { searchGeneration++; searchForwardReady = false; chatCanForward = false; historySearchButton = null; clearQuote(); pinnedAnnouncements = new JSONArray(); interactionsReady = false; chatCanPin = false; chatCanManageSettings = false; acknowledgementRequired = false; messageCategory = "GENERAL"; quoteLabel = null; categoryButton = null; announcementsButton = null; announcementSettingsButton = null; }
    private boolean attachQuote(JSONObject body) {
        if (quotedMessage == null) return true;
        if (!interactionsReady || !chatScope(quoteEpoch, quoteToken, quoteStore, quoteCompany) || !ChatInteractions.validId(quotedMessage.optString("id"))) { clearQuote(); status("Η απάντηση έληξε. Επίλεξε ξανά μήνυμα στο σωστό κατάστημα."); return false; }
        try { body.put("replyToId", quotedMessage.getString("id")); return true; } catch (Exception ignored) { return false; }
    }
    private void updateReaction(JSONObject row, String emoji) {
        call(chatBase() + "/messages/" + enc(row.optString("id")) + "/reaction", "PUT", object("reaction", emoji == null ? JSONObject.NULL : emoji), false, result -> { if (!result.optBoolean("ok")) throw new IllegalArgumentException(); loadMessages(false); });
    }
    private void pinAnnouncement(JSONObject row) {
        if (!chatCanPin) return;
        call(chatBase() + "/messages/" + enc(row.optString("id")), "PATCH", object("pinned", !row.optBoolean("pinned")), false, ignored -> loadMessages(false));
    }
    private void acknowledgeAnnouncement(JSONObject row) {
        if (!acknowledgementRequired || row.optBoolean("acknowledgedByMe")) return;
        call(chatBase() + "/messages/" + enc(row.optString("id")) + "/acknowledge", "POST", object(), false, ignored -> loadMessages(false));
    }

    private void chooseChatReply(JSONObject row) {
        quotedMessage = row; quoteEpoch = epoch.capture(); quoteToken = token; quoteStore = id(selected, "id"); quoteCompany = id(selected, "companyId");
        if (quoteLabel != null) { quoteLabel.setText("× Ακύρωση απάντησης\n" + row.optString("senderName", "Χρήστης") + ": " + ChatInteractions.preview(row)); quoteLabel.setVisibility(View.VISIBLE); }
        if (composer != null) composer.requestFocus();
    }
    private void showHistorySearch() {
        if (!searchForwardReady) return;
        dismissImage(); searchGeneration++;
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(16), dp(8), dp(16), dp(8));
        EditText query = input("Κείμενο ή όνομα αρχείου (2-120 χαρακτήρες)", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS, 120);
        box.addView(query); LinearLayout resultRows = new LinearLayout(this); resultRows.setOrientation(LinearLayout.VERTICAL);
        ScrollView results = new ScrollView(this); results.addView(resultRows);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Αναζήτηση μηνυμάτων").setView(box).setNegativeButton("Κλείσιμο", (d,w) -> dismissImage()).create();
        box.addView(chatButton("Αναζήτηση ιστορικού", scopedChatAction(() -> fetchHistory(query, "", resultRows, dialog, null)), false));
        box.addView(results, new LinearLayout.LayoutParams(-1, dp(280)));
        query.addTextChangedListener(new android.text.TextWatcher() {
            public void beforeTextChanged(CharSequence v,int a,int c,int f) {}
            public void onTextChanged(CharSequence v,int a,int b,int c) { searchGeneration++; resultRows.removeAllViews(); }
            public void afterTextChanged(android.text.Editable v) {}
        });
        imageDialog = dialog; dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); dialog.show();
    }
    private void fetchHistory(EditText query, String before, LinearLayout results, AlertDialog dialog, String expected) {
        if (!searchForwardReady || imageDialog != dialog) return;
        String term = java.text.Normalizer.normalize(query.getText().toString().trim(), java.text.Normalizer.Form.NFC);
        if (expected != null && !expected.equals(term)) return;
        if (term.codePointCount(0,term.length()) < 2 || term.codePointCount(0,term.length()) > 120) { status("Γράψε 2 έως 120 χαρακτήρες."); return; }
        InputMethodManager keyboard = (InputMethodManager)getSystemService(INPUT_METHOD_SERVICE); if (keyboard != null) keyboard.hideSoftInputFromWindow(query.getWindowToken(), 0);
        final int generation = ++searchGeneration; final long scope = epoch.capture(); final String captured = token, storeId = id(selected,"id"), companyId = id(selected,"companyId");
        results.removeAllViews(); results.addView(text("Αναζήτηση…", 15, MUTED));
        call(chatBase() + "/messages/search?q=" + enc(term) + (before.isEmpty() ? "" : "&before=" + enc(before)), "GET", null, false, data -> {
            if (imageDialog != dialog || generation != searchGeneration || !chatScope(scope,captured,storeId,companyId)
                || !term.equals(java.text.Normalizer.normalize(query.getText().toString().trim(),java.text.Normalizer.Form.NFC))) return;
            JSONObject store = data.getJSONObject("store");
            if (!storeId.equals(store.getString("id")) || !companyId.equals(store.getString("companyId")) || !term.equals(data.getString("q"))) throw new IllegalArgumentException();
            JSONArray rows = data.getJSONArray("rows"); if (rows.length() > 20) throw new IllegalArgumentException();
            String cursor = data.isNull("nextCursor") ? "" : data.optString("nextCursor");
            if (!cursor.isEmpty() && (rows.length() == 0 || !cursor.equals(rows.getJSONObject(rows.length()-1).getString("id")))) throw new IllegalArgumentException();
            for (int i=0;i<rows.length();i++) { JSONObject row=rows.getJSONObject(i); if (!ChatInteractions.validId(row.optString("id")) || row.optString("body").length()>5000) throw new IllegalArgumentException(); }
            results.removeAllViews(); if (rows.length()==0) results.addView(text("Δεν βρέθηκαν μηνύματα.",15,MUTED));
            for (int i=0;i<rows.length();i++) {
                final JSONObject row=rows.getJSONObject(i);
                results.addView(button(row.optString("senderName","Χρήστης") + "\n" + ChatInteractions.preview(row), scopedChatAction(() -> showSearchMessage(row))));
            }
            if (!cursor.isEmpty()) results.addView(chatButton("Επόμενα αποτελέσματα",scopedChatAction(() -> fetchHistory(query,cursor,results,dialog,term)),false));
        });
    }
    private void showSearchMessage(JSONObject row) {
        if (!searchForwardReady) return; dismissImage();
        Runnable reply = scopedChatAction(() -> { chooseChatReply(row); dismissImage(); });
        AlertDialog.Builder builder = new AlertDialog.Builder(this).setTitle("Μήνυμα αναζήτησης")
            .setMessage(row.optString("senderName","Χρήστης") + "\n" + row.optString("body") + (row.optBoolean("hasAttachment") ? "\nΣυνημμένο: " + row.optString("attachmentName") : ""))
            .setNegativeButton("Κλείσιμο",(d,w)->dismissImage()).setPositiveButton("Απάντηση",(d,w)->reply.run());
        if (chatCanForward) { Runnable forward = scopedChatAction(() -> showForwardTargets(row)); builder.setNeutralButton("Προώθηση",(d,w)->forward.run()); }
        imageDialog = builder.create(); imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); imageDialog.show();
    }
    private void showForwardTargets(JSONObject row) {
        if (!searchForwardReady || !chatCanForward || !ChatInteractions.validId(row.optString("id"))) return;
        if (uncertainForwardStoreId.equals(id(selected,"id"))) {
            Runnable checked = scopedChatAction(() -> { uncertainForwardStoreId=""; showForwardTargets(row); });
            dismissImage(); imageDialog=new AlertDialog.Builder(this).setTitle("Έλεγχος προηγούμενης προώθησης")
                .setMessage("Η προηγούμενη προώθηση δεν επιβεβαιώθηκε. Έλεγξε τη συνομιλία προορισμού πριν κάνεις νέα προώθηση.")
                .setPositiveButton("Έλεγξα τον προορισμό",(d,w)->checked.run()).setNegativeButton("Ακύρωση",null).create();
            imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); imageDialog.show(); return;
        }
        final long scope=epoch.capture();final String captured=token,storeId=id(selected,"id"),companyId=id(selected,"companyId");
        call(chatBase()+"/forward-targets","GET",null,false,data->{
            if (!chatScope(scope,captured,storeId,companyId)) return;
            JSONObject source=data.getJSONObject("store");if(!storeId.equals(source.getString("id"))||!companyId.equals(source.getString("companyId")))throw new IllegalArgumentException();
            JSONArray targets=data.getJSONArray("stores");if(targets.length()==0){status("Δεν υπάρχουν άλλες διαθέσιμες εξουσιοδοτημένες συνομιλίες.");return;}
            String[] titles=new String[targets.length()];final Runnable[] choices=new Runnable[targets.length()];
            for(int i=0;i<targets.length();i++){final JSONObject target=targets.getJSONObject(i);if(!ChatInteractions.validId(target.optString("id"))||storeId.equals(target.optString("id"))||target.optString("companyId").isEmpty())throw new IllegalArgumentException();
                titles[i]=target.optString("companyName")+" · "+target.optString("name");choices[i]=scopedChatAction(()->confirmForward(row,target));}
            dismissImage();imageDialog=new AlertDialog.Builder(this).setTitle("Συνομιλία προορισμού").setItems(titles,(d,which)->choices[which].run()).setNegativeButton("Ακύρωση",(d,w)->dismissImage()).create();
            imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);imageDialog.show();
        });
    }
    private void confirmForward(JSONObject row,JSONObject target) {
        if(!chatCanForward||!searchForwardReady)return;
        final String requestId=java.util.UUID.randomUUID().toString(),storeId=id(selected,"id"),companyId=id(selected,"companyId"),captured=token;
        final long scope=epoch.capture();
        dismissImage();final AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Επιβεβαίωση προώθησης")
            .setMessage("Προορισμός: "+target.optString("companyName")+" · "+target.optString("name")+"\n\n"+ChatInteractions.preview(row)+(row.optBoolean("hasAttachment")?"\nΘα συμπεριληφθεί το συνημμένο.":"")+"\n\nΘα σταλεί νέο μήνυμα με ένδειξη «Προωθημένο».")
            .setPositiveButton("Προώθηση",null).setNegativeButton("Κλείσιμο",(d,w)->{dismissImage();if(uncertainForwardStoreId.equals(storeId))status("Έλεγξε τη συνομιλία προορισμού πριν κάνεις νέα προώθηση.");}).create();
        imageDialog=dialog;dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);dialog.setCanceledOnTouchOutside(false);dialog.show();
        final Runnable confirm = scopedChatAction(()->{
            if(imageDialog!=dialog||!searchForwardReady||!chatCanForward)return;uncertainForwardStoreId=storeId;
            call(chatBase()+"/messages/"+enc(row.optString("id"))+"/forward","POST",object("targetStoreId",target.optString("id"),"targetCompanyId",target.optString("companyId"),"requestId",requestId),false,result->{
                if(!chatScope(scope,captured,storeId,companyId))return;
                if(!result.optBoolean("ok")||!ChatInteractions.validId(result.optString("id"))||!target.optString("id").equals(result.optString("targetStoreId")))throw new IllegalArgumentException();
                uncertainForwardStoreId="";if(imageDialog==dialog){dismissImage();status("Προωθήθηκε στο "+target.optString("name"));}
            });
        });
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->confirm.run());
    }
    private void showChatPeople(String title, JSONArray people, String sender) {
        ArrayList<String> names = ReadReceipts.names(people, sender); if (names.isEmpty()) return; dismissImage();
        imageDialog = new AlertDialog.Builder(this).setTitle(title).setItems(names.toArray(new String[0]), null).setPositiveButton("Κλείσιμο", null).create();
        imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); imageDialog.show();
    }
    private void showAnnouncementSettings() {
        if (!chatCanManageSettings) return; final boolean required = !acknowledgementRequired;
        Runnable change = scopedChatAction(() -> { if (chatCanManageSettings) call(chatBase() + "/settings", "PUT", object("announcementAcknowledgementRequired", required), false, ignored -> loadMessages(false)); });
        dismissImage(); imageDialog = new AlertDialog.Builder(this).setTitle("Επιβεβαίωση ανακοινώσεων").setMessage(acknowledgementRequired ? "Η ρητή επιβεβαίωση ανάγνωσης είναι ενεργή." : "Η ρητή επιβεβαίωση ανάγνωσης είναι ανενεργή.")
            .setPositiveButton(required ? "Ενεργοποίηση" : "Απενεργοποίηση", (d, w) -> change.run()).setNegativeButton("Ακύρωση", null).create();
        imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); imageDialog.show();
    }
    private void showPinnedAnnouncements() {
        if (pinnedAnnouncements.length() == 0) return; final JSONArray items = pinnedAnnouncements;
        String[] titles = new String[items.length()]; for (int i = 0; i < items.length(); i++) titles[i] = ChatInteractions.preview(items.optJSONObject(i));
        final Runnable[] actions = new Runnable[items.length()]; for (int i = 0; i < items.length(); i++) { final JSONObject row = items.optJSONObject(i); actions[i] = scopedChatAction(() -> showAnnouncement(row)); }
        dismissImage(); imageDialog = new AlertDialog.Builder(this).setTitle("Καρφιτσωμένες ανακοινώσεις").setItems(titles, (d, which) -> actions[which].run()).setPositiveButton("Κλείσιμο", null).create();
        imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); imageDialog.show();
    }
    private void showAnnouncement(JSONObject row) {
        dismissImage(); AlertDialog.Builder builder = new AlertDialog.Builder(this).setTitle("Καρφιτσωμένη ανακοίνωση").setMessage(row.optString("body", "") + (row.optBoolean("hasAttachment") ? "\nΣυνημμένο: προβολή μέσα στη συνομιλία." : "")).setNegativeButton("Κλείσιμο", null);
        if (acknowledgementRequired && !row.optBoolean("acknowledgedByMe")) { Runnable acknowledge = scopedChatAction(() -> acknowledgeAnnouncement(row)); builder.setPositiveButton("Το διάβασα", (d, w) -> acknowledge.run()); }
        if (chatCanPin) { Runnable unpin = scopedChatAction(() -> pinAnnouncement(row)); builder.setNeutralButton("Ξεκαρφίτσωμα", (d, w) -> unpin.run()); }
        imageDialog = builder.create(); imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); imageDialog.show();
    }
    private void showEvidence(JSONArray evidence) {
        try {
            TextView report = text(ReportText.render(evidence), 15, INK); ScrollView box = new ScrollView(this); box.addView(report);
            imageDialog = new AlertDialog.Builder(this).setTitle("Στοιχεία πηγής · μόνο προβολή").setView(box).setPositiveButton("Κλείσιμο", null).create();
            imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); imageDialog.show();
        } catch (Exception ignored) { status("Δεν είναι διαθέσιμη η προβολή πηγής."); }
    }
    private void dismissReplies() {
        if (replyDialog != null) { replyDialog.dismiss(); replyDialog = null; }
    }
    private boolean replyScope(long generation, String capturedToken, String storeId, EditText target) {
        return foreground && epoch.current(generation) && capturedToken.equals(token) && !token.isEmpty()
            && selected != null && storeId.equals(id(selected, "id")) && view.equals("conversation")
            && tab.equals("chat") && composer == target && target != null && target.isEnabled()
            && !busy && !uncertainStoreId.equals(storeId);
    }
    private void pickReply() {
        final long generation = epoch.capture(); final String capturedToken = token, storeId = id(selected, "id");
        final EditText target = composer;
        if (!replyScope(generation, capturedToken, storeId, target)) {
            status("Περίμενε την ανανέωση και έλεγξε τυχόν αβέβαιη αποστολή."); return;
        }
        dismissReplies();
        replyDialog = new AlertDialog.Builder(this).setTitle("Έτοιμες απαντήσεις")
            .setItems(QuickReplies.choices(), (dialog, which) -> {
                if (!replyScope(generation, capturedToken, storeId, target)) return;
                final String choice = QuickReplies.choices()[which];
                if (target.getText().length() == 0) {
                    applyReply(generation, capturedToken, storeId, target, choice, false); return;
                }
                replyDialog = new AlertDialog.Builder(this).setTitle("Υπάρχει ήδη πρόχειρο μήνυμα")
                    .setMessage("Προσθήκη στο τέλος ή αντικατάσταση του κειμένου; Η επιλογή δεν στέλνει μήνυμα.")
                    .setPositiveButton("Προσθήκη", (d, w) -> applyReply(generation, capturedToken, storeId, target, choice, true))
                    .setNeutralButton("Αντικατάσταση", (d, w) -> applyReply(generation, capturedToken, storeId, target, choice, false))
                    .setNegativeButton("Ακύρωση", null).create();
                replyDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); replyDialog.show();
            }).setNegativeButton("Ακύρωση", null).create();
        replyDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); replyDialog.show();
    }
    private void applyReply(long generation, String capturedToken, String storeId, EditText target, String choice, boolean append) {
        if (!replyScope(generation, capturedToken, storeId, target)) return;
        try {
            target.setText(QuickReplies.compose(target.getText().toString(), choice, append));
            target.setSelection(target.length()); target.requestFocus();
        } catch (IllegalArgumentException tooLong) { status("Το μήνυμα ξεπερνά τους 5.000 χαρακτήρες. Μίκρυνε πρώτα το πρόχειρο."); }
    }
    private void pickPhoto() {
        if (busy || !photosEnabled || uncertainStoreId.equals(id(selected, "id"))) { status("Έλεγξε πρώτα τη σύνδεση και τυχόν αβέβαιη αποστολή."); return; }
        if ((voiceDraft != null || videoDraft != null) && !busy) {
            final long generation = epoch.capture(); final String captured = token, store = id(selected, "id");
            imageDialog = new AlertDialog.Builder(this).setTitle("Αλλαγή συνημμένου")
                .setMessage("Το πρόχειρο φωνητικό / βίντεο θα καθαριστεί πριν επιλέξεις φωτογραφίες.")
                .setPositiveButton("Συνέχεια", (d, w) -> { if (!foreground || busy || !epoch.current(generation) || !captured.equals(token) || !store.equals(id(selected, "id"))) return; clearVoice(); clearVideo(); updateVoiceLabel(); updateVideoLabel(); pickPhoto(); })
                .setNegativeButton("Ακύρωση", null).create();
            imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); imageDialog.show(); return;
        }
        if (busy || !photosEnabled || uncertainStoreId.equals(id(selected, "id"))) { status("Έλεγξε πρώτα τη σύνδεση και τυχόν αβέβαιη αποστολή."); return; }
        new AlertDialog.Builder(this).setTitle("Φωτογραφία").setItems(new String[]{"Κάμερα · χωρίς αποθήκευση", "Έως 5 υπάρχουσες φωτογραφίες"}, (dialog, choice) -> {
            if (choice == 0) openCamera(); else choosePhoto();
        }).show();
    }
    private void openCamera() {
        photoBinding = id(selected, "id"); photoToken = token;
        if (checkSelfPermission(android.Manifest.permission.CAMERA) != android.content.pm.PackageManager.PERMISSION_GRANTED) { requestPermissions(new String[]{android.Manifest.permission.CAMERA}, CAMERA); return; }
        startActivityForResult(new Intent(this, CameraActivity.class), CAMERA);
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == 733 && results.length > 0 && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) enableNativePush();
        if (request == CAMERA && results.length > 0 && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED && photoToken.equals(token) && photoBinding.equals(id(selected, "id"))) openCamera();
    }
    private void choosePhoto() {
        photoBinding = id(selected, "id"); photoToken = token;
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT); intent.setType("image/*"); intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/jpeg", "image/png", "image/webp"});
        startActivityForResult(Intent.createChooser(intent, "Επιλογή φωτογραφίας"), PHOTO);
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == VIDEO) {
            byte[] captured = VideoBuffer.take();
            if (result == RESULT_OK && VideoData.valid(captured) && videoToken.equals(token) && !token.isEmpty()
                && videoBinding.equals(id(selected, "id")) && videoAvailable && tab.equals("chat") && view.equals("conversation")) {
                clearVideo(); clearVoice(); clearPhoto(); videoDraft = captured;
            } else VideoData.wipe(captured);
            videoBinding = ""; videoToken = ""; updateVideoLabel(); updateVoiceLabel(); updatePhotoLabel(); return;
        }
        if (request == VOICE) {
            byte[] captured = VoiceBuffer.take();
            if (result == RESULT_OK && VoiceData.valid(captured) && voiceToken.equals(token) && !token.isEmpty()
                && voiceBinding.equals(id(selected, "id")) && voiceAvailable && tab.equals("chat") && view.equals("conversation")) {
                clearVideo(); clearVoice(); clearPhoto(); voiceDraft = captured;
            } else VoiceData.wipe(captured);
            voiceBinding = ""; voiceToken = ""; updateVoiceLabel(); updatePhotoLabel(); return;
        }
        if (request == CAMERA) {
            PhotoBatch captured = CaptureBuffer.take();
            if (result == RESULT_OK && captured != null && photoToken.equals(token) && photoBinding.equals(id(selected, "id"))) {
                photos.takeFrom(captured); photoSelectionNotice = "";
            }
            else if (captured != null) captured.clear();
            photoBinding = ""; photoToken = ""; updatePhotoLabel(); return;
        }
        if (request != PHOTO || result != RESULT_OK || data == null || !photoToken.equals(token) || !photoBinding.equals(id(selected, "id"))) return;
        PhotoBatch candidate = new PhotoBatch();
        try {
            int count = data.getClipData() == null ? (data.getData() == null ? 0 : 1) : data.getClipData().getItemCount();
            if (count < 1 || count > PhotoBatch.MAX_COUNT) throw new IllegalArgumentException();
            for (int i = 0; i < count; i++) {
                Uri uri = data.getClipData() == null ? data.getData() : data.getClipData().getItemAt(i).getUri();
                String mime = uri == null ? null : getContentResolver().getType(uri);
                if (uri == null || !"content".equals(uri.getScheme()) || !("image/jpeg".equals(mime) || "image/png".equals(mime) || "image/webp".equals(mime))) throw new IllegalArgumentException();
                // Transient read only: no persistable grant, copied file, filename or gallery write.
                try (InputStream input = getContentResolver().openInputStream(uri)) {
                    candidate.add(ChatApi.bounded(input, Math.min(PhotoBatch.MAX_IMAGE_BYTES, PhotoBatch.MAX_TOTAL_BYTES - candidate.bytes())), mime);
                }
            }
            photos.takeFrom(candidate); photoSelectionNotice = "";
        } catch (Exception ignored) { candidate.clear(); photoSelectionNotice = "Επίλεξε έως 5 JPG/PNG/WEBP, έως 7 MB η καθεμία και 14 MB συνολικά. Η επιλογή δεν ολοκληρώθηκε."; }
        finally { photoBinding = ""; photoToken = ""; }
    }
    private void updatePhotoLabel() {
        if (attachmentLabel != null) {
            setChatLabel(attachmentLabel, photos.size() == 0 ? photoSelectionNotice : "▧ " + photos.size() + " φωτογραφίες · έλεγχος / αφαίρεση · χωριστά μηνύματα");
            attachmentLabel.setOnClickListener(v -> reviewPhotos());
        }
    }
    private void reviewPhotos() {
        if (busy || photos.size() == 0) return;
        String[] names = new String[photos.size()]; for (int i = 0; i < names.length; i++) names[i] = "Φωτογραφία " + (i + 1);
        dismissImage();
        imageDialog = new AlertDialog.Builder(this).setTitle("Πριν την αποστολή · " + photos.size() + " φωτογραφίες")
            .setItems(names, (dialog, index) -> photoOptions(index)).setNegativeButton("Κλείσιμο", null).create();
        imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); imageDialog.show();
    }
    private void photoOptions(int index) {
        if (busy || index < 0 || index >= photos.size()) return;
        imageDialog = new AlertDialog.Builder(this).setTitle("Φωτογραφία " + (index + 1))
            .setItems(new String[]{"Προεπισκόπηση", "Αφαίρεση"}, (dialog, choice) -> {
                if (busy || index >= photos.size()) return;
                if (choice == 1) { photos.remove(index); updatePhotoLabel(); }
                else previewSelectedPhoto(index);
            }).create();
        imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); imageDialog.show();
    }
    private void previewSelectedPhoto(int index) {
        if (busy || index >= photos.size()) return;
        PhotoBatch.Photo photo = photos.get(index); dismissImage();
        BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(photo.bytes, 0, photo.bytes.length, options); options.inSampleSize = 1;
        while (options.outWidth / options.inSampleSize > 1200 || options.outHeight / options.inSampleSize > 1200) options.inSampleSize *= 2;
        options.inJustDecodeBounds = false; preview = BitmapFactory.decodeByteArray(photo.bytes, 0, photo.bytes.length, options);
        if (preview == null) { status("Δεν είναι έγκυρη εικόνα για προεπισκόπηση."); return; }
        showFullPhoto("Φωτογραφία " + (index + 1), preview);
    }
    private void viewPhoto(JSONObject row) {
        if (busy) return; busy = true; long generation = epoch.capture(); String captured = token, path = chatBase() + "/messages/" + enc(row.optString("id")) + "/attachment";
        worker.execute(() -> {
            try {
                byte[] bytes = api.image(path, captured); BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true; BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                options.inSampleSize = 1;
                while (options.outWidth / options.inSampleSize > 1800 || options.outHeight / options.inSampleSize > 1800) {
                    options.inSampleSize *= 2;
                }
                options.inJustDecodeBounds = false; Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options); Arrays.fill(bytes, (byte) 0);
                ui.post(() -> {
                    if (!foreground || !epoch.current(generation) || !captured.equals(token)) { if (bitmap != null) bitmap.recycle(); return; }
                    busy = false; dismissImage(); if (bitmap == null) { status("Δεν άνοιξε η φωτογραφία."); return; }
                    preview = bitmap; showFullPhoto("Φωτογραφία · προσωρινή προβολή", bitmap);
                });
            } catch (Exception ignored) {
                ui.post(() -> {
                    if (foreground && epoch.current(generation) && captured.equals(token)) {
                        busy = false;
                        status("Δεν άνοιξε η φωτογραφία. Ανανέωσε τη συνομιλία.");
                    }
                });
            }
        });
    }
    private void recordVideo() {
        if (!foreground || busy || selected == null || token.isEmpty() || !videoAvailable || uncertainStoreId.equals(id(selected,"id"))) { status("Περίμενε την ανανέωση και έλεγξε τη διαθεσιμότητα βίντεο."); return; }
        final long generation=epoch.capture(); final String captured=token, store=id(selected,"id");
        Runnable open=()->{if(!foreground||busy||!epoch.current(generation)||!captured.equals(token)||!store.equals(id(selected,"id"))||!videoAvailable)return;videoBinding=store;videoToken=token;startActivityForResult(new Intent(this,VideoActivity.class),VIDEO);};
        if(photos.size()==0&&voiceDraft==null&&videoDraft==null&&(composer==null||composer.length()==0)){open.run();return;}
        dismissImage();imageDialog=new AlertDialog.Builder(this).setTitle("Άνοιγμα βίντεο").setMessage("Η ξεχωριστή οθόνη καθαρίζει το πρόχειρο κείμενο και τα συνημμένα. Συνέχεια;").setPositiveButton("Συνέχεια",(d,w)->open.run()).setNegativeButton("Ακύρωση",null).create();imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);imageDialog.show();
    }
    private void updateVideoLabel(){setChatLabel(videoLabel,videoDraft==null?"":"▶ Βίντεο · έλεγχος / αφαίρεση");}
    private void reviewVideo(){
        if(busy||videoDraft==null)return;dismissImage();imageDialog=new AlertDialog.Builder(this).setTitle("Πρόχειρο βίντεο").setItems(new String[]{"Προεπισκόπηση","Αφαίρεση"},(d,which)->{if(busy||videoDraft==null)return;if(which==0)showVideo(videoDraft,false);else{clearVideo();updateVideoLabel();}}).setNegativeButton("Κλείσιμο",null).create();imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);imageDialog.show();
    }
    private void showVideo(byte[] bytes,boolean owned){
        dismissImage();if(!VideoData.valid(bytes)){if(owned)VideoData.wipe(bytes);status("Δεν άνοιξε το βίντεο.");return;}if(owned)playingVideo=bytes;
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);
        android.view.SurfaceView surface=new android.view.SurfaceView(this);box.addView(surface,new LinearLayout.LayoutParams(-1,dp(260)));
        surface.getHolder().addCallback(new android.view.SurfaceHolder.Callback(){public void surfaceCreated(android.view.SurfaceHolder h){}public void surfaceChanged(android.view.SurfaceHolder h,int f,int w,int height){}public void surfaceDestroyed(android.view.SurfaceHolder h){videoPlayer.stop();}});
        box.addView(button("▶ Αναπαραγωγή / από την αρχή",()->{if(!videoPlayer.play(bytes,surface.getHolder().getSurface()))status("Δεν ξεκίνησε η αναπαραγωγή.");}));box.addView(button("Διακοπή",videoPlayer::stop));
        final AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Βίντεο · προσωρινή προβολή").setView(box).setNegativeButton("Κλείσιμο",null).create();imageDialog=dialog;
        dialog.setOnDismissListener(d->{if(imageDialog==dialog){videoPlayer.stop();VideoData.wipe(playingVideo);playingVideo=null;imageDialog=null;}});dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);dialog.show();
    }
    private void viewVideo(JSONObject row){
        if(busy||!foreground||selected==null)return;dismissImage();busy=true;if(chatSendButton!=null)chatSendButton.setEnabled(false);
        final long generation=epoch.capture();final String captured=token,store=id(selected,"id"),path=chatBase()+"/messages/"+enc(row.optString("id"))+"/attachment";status("Φόρτωση βίντεο…");
        worker.execute(()->{try{final byte[] bytes=api.video(path,captured);ui.post(()->{if(!foreground||!epoch.current(generation)||!captured.equals(token)||!store.equals(id(selected,"id"))){VideoData.wipe(bytes);return;}busy=false;if(chatSendButton!=null)chatSendButton.setEnabled(true);status("");showVideo(bytes,true);});}catch(Exception error){ui.post(()->{if(!foreground||!epoch.current(generation)||!captured.equals(token))return;busy=false;if(chatSendButton!=null)chatSendButton.setEnabled(true);if(error instanceof ChatApi.Failure&&((ChatApi.Failure)error).status==401){clearSession();loginScreen();}else status("Δεν φορτώθηκε το βίντεο. Έλεγξε σύνδεση και δικαιώματα.");});}});
    }
    private void sendVideoMessage(String value){
        if(busy||!foreground||selected==null||!tab.equals("chat")||!videoAvailable||!VideoData.valid(videoDraft)||voiceDraft!=null||photos.size()!=0){status("Το βίντεο δεν μπορεί να σταλεί τώρα.");return;}
        dismissImage();final byte[] first=videoDraft;
        JSONObject body=object("body",value,"category","GENERAL","attachment",object("name","video.mp4","mimeType","video/mp4","dataUrl","data:video/mp4;base64,"+Base64.encodeToString(first,Base64.NO_WRAP)));
        if (!attachQuote(body)) return;
        uncertainStoreId=id(selected,"id");call(chatBase()+"/video-messages","POST",body,false,result->{if(!result.optBoolean("ok")||result.optString("id").trim().isEmpty())throw new IllegalArgumentException();uncertainStoreId="";clearQuote();if(composer.getText().toString().trim().equals(value))composer.setText("");VideoData.wipe(first);if(videoDraft==first)videoDraft=null;updateVideoLabel();loadMessages(true);});
    }
    private void clearVideo(){videoPlayer.stop();VideoData.wipe(videoDraft);videoDraft=null;VideoData.wipe(playingVideo);playingVideo=null;}
    private void recordVoice() {
        if (!foreground || busy || selected == null || token.isEmpty() || !voiceAvailable || uncertainStoreId.equals(id(selected, "id"))) {
            status("Περίμενε την ανανέωση και έλεγξε τη διαθεσιμότητα ή τυχόν αβέβαιη αποστολή."); return;
        }
        final long generation = epoch.capture(); final String captured = token, store = id(selected, "id");
        Runnable open = () -> {
            if (!foreground || busy || !epoch.current(generation) || !captured.equals(token) || !store.equals(id(selected, "id")) || !voiceAvailable) return;
            voiceBinding = store; voiceToken = token; startActivityForResult(new Intent(this, VoiceActivity.class), VOICE);
        };
        if (photos.size() == 0 && voiceDraft == null && videoDraft == null && (composer == null || composer.length() == 0)) { open.run(); return; }
        dismissImage();
        imageDialog = new AlertDialog.Builder(this).setTitle("Άνοιγμα εγγραφής")
            .setMessage("Η ξεχωριστή οθόνη εγγραφής καθαρίζει το πρόχειρο κείμενο και τα συνημμένα της συνομιλίας. Συνέχεια;")
            .setPositiveButton("Συνέχεια", (d, w) -> open.run()).setNegativeButton("Ακύρωση", null).create();
        imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); imageDialog.show();
    }
    private void updateVoiceLabel() {
        setChatLabel(voiceLabel, voiceDraft == null ? "" : "▶ Φωνητικό · " + VoiceData.seconds(voiceDraft) + " δευτ. · έλεγχος / αφαίρεση");
    }
    private void reviewVoice() {
        if (busy || voiceDraft == null) return;
        dismissImage();
        imageDialog = new AlertDialog.Builder(this).setTitle("Πρόχειρο φωνητικό")
            .setItems(new String[]{"Αναπαραγωγή", "Αφαίρεση"}, (d, which) -> {
                if (busy || voiceDraft == null) return;
                if (which == 0) showVoice(voiceDraft, false); else { clearVoice(); updateVoiceLabel(); }
            }).setNegativeButton("Κλείσιμο", null).create();
        imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); imageDialog.show();
    }
    private void showVoice(byte[] bytes, boolean ownedPlayback) {
        dismissImage();
        if (!VoiceData.valid(bytes)) { if (ownedPlayback) VoiceData.wipe(bytes); status("Δεν άνοιξε το φωνητικό."); return; }
        if (ownedPlayback) playingVoice = bytes;
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL);
        box.addView(text(VoiceData.seconds(bytes) + " δευτερόλεπτα · προσωρινή αναπαραγωγή", 17, INK));
        box.addView(button("▶ Αναπαραγωγή / από την αρχή", () -> { if (!voicePlayer.play(bytes, null)) status("Δεν ξεκίνησε η αναπαραγωγή."); }));
        box.addView(button("Διακοπή", voicePlayer::stop));
        final AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Φωνητικό").setView(box).setNegativeButton("Κλείσιμο", null).create();
        imageDialog = dialog;
        dialog.setOnDismissListener(d -> { if (imageDialog == dialog) { voicePlayer.stop(); VoiceData.wipe(playingVoice); playingVoice = null; imageDialog = null; } });
        dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); dialog.show();
    }
    private void viewVoice(JSONObject row) {
        if (busy || !foreground || selected == null) return;
        dismissImage(); busy = true; if (chatSendButton != null) chatSendButton.setEnabled(false);
        final long generation = epoch.capture(); final String captured = token, store = id(selected, "id");
        final String path = chatBase() + "/messages/" + enc(row.optString("id")) + "/attachment"; status("Φόρτωση φωνητικού…");
        worker.execute(() -> {
            try {
                final byte[] bytes = api.voice(path, captured);
                ui.post(() -> {
                    if (!foreground || !epoch.current(generation) || !captured.equals(token) || !store.equals(id(selected, "id"))) { VoiceData.wipe(bytes); return; }
                    busy = false; if (chatSendButton != null) chatSendButton.setEnabled(true); status(""); showVoice(bytes, true);
                });
            } catch (Exception error) {
                ui.post(() -> {
                    if (!foreground || !epoch.current(generation) || !captured.equals(token)) return;
                    busy = false; if (chatSendButton != null) chatSendButton.setEnabled(true);
                    if (error instanceof ChatApi.Failure && ((ChatApi.Failure) error).status == 401) { clearSession(); loginScreen(); }
                    else status("Δεν φορτώθηκε το φωνητικό. Έλεγξε τη σύνδεση και τα δικαιώματα.");
                });
            }
        });
    }
    private void sendVoiceMessage(String value) {
        if (busy || !foreground || selected == null || !tab.equals("chat") || !voiceAvailable || !VoiceData.valid(voiceDraft) || photos.size() != 0) {
            status("Το φωνητικό δεν μπορεί να σταλεί τώρα. Έλεγξε την ανανέωση και τη διαθεσιμότητα."); return;
        }
        dismissImage(); final byte[] first = voiceDraft;
        JSONObject body = object("body", value, "category", "GENERAL", "attachment", object("name", "voice.wav", "mimeType", "audio/wav", "dataUrl", "data:audio/wav;base64," + Base64.encodeToString(first, Base64.NO_WRAP)));
        if (!attachQuote(body)) return;
        uncertainStoreId = id(selected, "id");
        call(chatBase() + "/voice-messages", "POST", body, false, result -> {
            if (!result.optBoolean("ok") || result.optString("id").trim().isEmpty()) throw new IllegalArgumentException();
            uncertainStoreId = "";
            if (composer.getText().toString().trim().equals(value)) composer.setText("");
            clearQuote();
            VoiceData.wipe(first); if (voiceDraft == first) voiceDraft = null; updateVoiceLabel(); loadMessages(true);
        });
    }
    private void clearVoice() { voicePlayer.stop(); VoiceData.wipe(voiceDraft); voiceDraft = null; VoiceData.wipe(playingVoice); playingVoice = null; }
    private void clearPhoto() { photos.clear(); photoSelectionNotice = ""; }
    private void wipeViews(View view) {
        if (view instanceof EditText) ((EditText) view).getText().clear();
        else if (view instanceof TextView) ((TextView) view).setText("");
        if (view instanceof ImageView) ((ImageView) view).setImageDrawable(null);
        if (view instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) wipeViews(group.getChildAt(i));
        }
    }
    private void dismissImage() { videoPlayer.stop(); VideoData.wipe(playingVideo); playingVideo = null; voicePlayer.stop(); VoiceData.wipe(playingVoice); playingVoice = null; if (imageDialog != null) { imageDialog.dismiss(); imageDialog = null; } if (preview != null) { preview.recycle(); preview = null; } }
    private void logout() {
        if (busy) return;
        String path = staff() ? "/api/store-chat/stores/" + enc(identity.optString("storeId")) + "/mobile-logout" : "/api/auth/logout";
        String captured = token;
        // Clear local content/token immediately even when the server is unreachable. Native receipt rejects missing/changed local session; server logout revokes delivery.
        clearSession(); loginScreen();
        worker.execute(() -> { try { api.json(path, "POST", object(), captured); } catch (Exception ignored) { /* Never retain content or credential to retry later. */ } });
    }
    private void clearSession() { uncertainForwardStoreId = ""; entryStore = ""; NativePush.logout(this); pushStore = ""; pushCompany = ""; navigate(); token = ""; identity = new JSONObject(); selected = null; uncertainStoreId = ""; try { clearTwoFactor(); vault.clear(); } catch (Exception ignored) { finishAndRemoveTask(); } }
    private void enableNativePush() {
        if (busy || token.isEmpty()) return;
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 733); return;
        }
        String captured = token; long generation = epoch.capture(); status("Έλεγχος ειδοποιήσεων…");
        NativePush.register(this, captured, ok -> ui.post(() -> { if (foreground && epoch.current(generation) && token.equals(captured)) status(ok ? "Η συσκευή καταχωρίστηκε. Η παραλαβή χρειάζεται δοκιμή." : "Οι ειδοποιήσεις δεν ενεργοποιήθηκαν. Απαιτείται σύνδεση και ρύθμιση server."); }));
    }
    private void receivePushIntent(Intent intent) {
        if (intent == null) return;
        try { if (NativePush.valid(token) && NativePush.binding(token).equals(intent.getStringExtra("pushBinding"))) { pushStore = intent.getStringExtra("pushStore"); pushCompany = intent.getStringExtra("pushCompany"); if (pushStore == null || pushCompany == null) { pushStore = ""; pushCompany = ""; } } } catch (Exception ignored) { pushStore = ""; pushCompany = ""; }
        intent.removeExtra("pushStore"); intent.removeExtra("pushCompany"); intent.removeExtra("pushBinding");
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); receivePushIntent(intent);
        receiveStoreEntry(intent);
        if (token.isEmpty() && foreground && !entryStore.isEmpty()) { navigate(); openEntryStore(); return; }
        if (!pushStore.isEmpty() && foreground) { navigate(); selected = null; stores(); }
    }
    @Override public void onBackPressed() {
        if (busy) { navigate(); if (selected != null) conversation(); else if (token.isEmpty()) loginScreen(); else stores(); return; }
        if (selected != null) { navigate(); selected = null; stores(); }
        else if (!token.isEmpty()) super.onBackPressed();
        else if (!view.equals("login")) { navigate(); loginScreen(); } else super.onBackPressed();
    }
    private void layout(String title, String subtitle) {
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.WHITE); root.setSaveEnabled(false);
        if (android.os.Build.VERSION.SDK_INT >= 30) root.setImportantForContentCapture(View.IMPORTANT_FOR_CONTENT_CAPTURE_NO_EXCLUDE_DESCENDANTS);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets system = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.ime()); v.setPadding(system.left, system.top, system.right, system.bottom);
            } else v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        LinearLayout header = new LinearLayout(this); header.setOrientation(LinearLayout.VERTICAL); header.setBackgroundColor(PURPLE); header.setPadding(dp(20), dp(16), dp(20), dp(14)); header.addView(text(title, 23, Color.WHITE)); header.addView(text(subtitle, 13, 0xffeee6ff)); root.addView(header);
        content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(18), dp(20), dp(18), dp(12)); contentScroll = new ScrollView(this); contentScroll.setFillViewport(true); contentScroll.addView(content); root.addView(contentScroll, new LinearLayout.LayoutParams(-1, 0, 1));
        notice = text("", 14, 0xffa12b49); notice.setPadding(dp(16), dp(4), dp(16), dp(4)); notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); notice.setVisibility(View.GONE); root.addView(notice);
        composer = null; attachmentLabel = null; chatSendButton = null; voiceButton = null; voiceLabel = null; videoButton = null; videoLabel = null; setContentView(root); root.requestApplyInsets();
    }
    private TextView text(String value, int size, int color) { TextView v = new TextView(this); v.setText(value); v.setTextSize(size); v.setTextColor(color); v.setTextIsSelectable(false); v.setSaveEnabled(false); v.setPadding(0, dp(4), 0, dp(4)); return v; }
    private Button button(String label, Runnable action) { Button b = new Button(this); b.setText(label); b.setTextColor(PURPLE); b.setAllCaps(false); b.setTextSize(15); b.setMinHeight(dp(52)); b.setMinimumWidth(0); b.setPadding(dp(10), dp(5), dp(10), dp(5)); b.setSaveEnabled(false); b.setOnClickListener(v -> action.run()); return b; }
    private LinearLayout.LayoutParams toolParams() { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, -2, 1); p.setMargins(dp(3), 0, dp(3), 0); return p; }
    private Button chatButton(String label, Runnable action, boolean primary) {
        Button b = button(label, action); b.setTextSize(14); b.setMinHeight(dp(48)); b.setMinimumHeight(dp(48)); b.setMaxLines(2); b.setGravity(Gravity.CENTER); b.setPadding(dp(8), dp(8), dp(8), dp(8));
        int[][] states = new int[][] { new int[] {-android.R.attr.state_enabled}, new int[] {} };
        b.setTextColor(new android.content.res.ColorStateList(states, new int[] {0xff938b9c, primary ? Color.WHITE : PURPLE}));
        android.graphics.drawable.StateListDrawable fill = new android.graphics.drawable.StateListDrawable();
        fill.addState(states[0], round(0xffeeebf2, 22)); fill.addState(states[1], round(primary ? PURPLE : 0xfff0e9fc, 22));
        b.setBackground(new android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(0x226d28d9), fill, round(Color.WHITE, 22)));
        return b;
    }
    private void setChatLabel(TextView label, String value) { if (label != null) { label.setText(value); label.setVisibility(value == null || value.isEmpty() ? View.GONE : View.VISIBLE); } }
    private EditText input(String hint, int type, int limit) {
        EditText input = new PrivateEditText(this); input.setHint(hint); input.setTextSize(17); input.setInputType(type); input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(limit)}); input.setMinHeight(dp(56)); input.setSaveEnabled(false); input.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS); input.setImeOptions(android.view.inputmethod.EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING); input.setPadding(dp(10), dp(8), dp(10), dp(8)); return input;
    }
    private GradientDrawable round(int color, int radius) { GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(radius)); return d; }
    private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    private void status(String value) { setChatLabel(notice, value); }
    private void hideKeyboard() { View focus = getCurrentFocus(); if (focus != null) ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(focus.getWindowToken(), 0); }
    private String time(String date) { try { return DateTimeFormatter.ofPattern("dd/MM HH:mm", Locale.forLanguageTag("el-GR")).withZone(ZoneId.of("Europe/Athens")).format(Instant.parse(date)); } catch (Exception ignored) { return ""; } }
}
