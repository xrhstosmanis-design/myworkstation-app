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
    private static final int PURPLE = 0xff7052c8, INK = 0xff242234, MUTED = 0xff777187, PHOTO = 41, CAMERA = 42;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newFixedThreadPool(2);
    private ChatApi api = new ChatApi();
    private final RequestEpoch epoch = new RequestEpoch();
    private TokenVault vault, pendingTwoFactor;
    private String pushStore = "", pushCompany = "";
    private String token = "", challenge = "", view = "login", tab = "chat", photoBinding = "", photoToken = "";
    private JSONObject identity = new JSONObject(), selected;
    private JSONArray history = new JSONArray();
    private byte[] photo;
    private String photoMime = "";
    private String uncertainStoreId = "";
    private boolean foreground, busy, photosEnabled = true;
    private LinearLayout root, content, messages;
    private ScrollView scroll;
    private ScrollView contentScroll;
    private TextView notice, attachmentLabel;
    private EditText composer;
    private AlertDialog imageDialog;
    private Bitmap preview;
    private final Runnable refresh = new Runnable() {
        @Override public void run() {
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
        if (!token.isEmpty()) {
            try { identity = claims(token); if (identity.optLong("exp") * 1000L <= System.currentTimeMillis()) clearSession(); }
            catch (Exception ignored) { clearSession(); }
        }
    }
    @Override protected void onResume() {
        super.onResume(); foreground = true;
        if (!token.isEmpty() && NativePush.opted(this)) NativePush.register(this, token, ok -> {});
        if (token.isEmpty()) { restoreTwoFactor(); loginScreen(); }
        else if (!pushStore.isEmpty()) stores();
        else if (selected != null) conversation();
        else stores();
        ui.removeCallbacks(refresh); ui.postDelayed(refresh, 10000);
    }
    @Override protected void onStop() {
        foreground = false; epoch.invalidate(); api.cancel(); busy = false; ui.removeCallbacks(refresh);
        history = new JSONArray(); clearPhoto(); dismissImage();
        if (root != null) {
            wipeViews(root);
            root.removeAllViews();
            TextView cover = text("MyWorkStation", 24, INK); cover.setGravity(Gravity.CENTER); root.addView(cover);
        }
        messages = null; content = null; contentScroll = null; scroll = null;
        composer = null; notice = null; attachmentLabel = null;
        super.onStop();
    }
    @Override protected void onSaveInstanceState(Bundle state) { /* No private UI state in Android's saved-state storage. */ }
    @Override protected void onDestroy() { epoch.invalidate(); api.cancel(); worker.shutdownNow(); clearPhoto(); dismissImage(); super.onDestroy(); }
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
        status("Σύνδεση…");
        worker.execute(() -> {
            try {
                JSONObject result = api.json(path, method, body, anonymous ? "" : captured);
                ui.post(() -> {
                    if (!foreground || !epoch.current(generation) || !captured.equals(token)) return;
                    busy = false; status("");
                    try { success.run(result); } catch (Exception ignored) { status("Δεν επιβεβαιώθηκαν τα στοιχεία. Ανανέωσε ή συνδέσου ξανά."); }
                });
            } catch (Exception error) {
                ui.post(() -> {
                    if (!foreground || !epoch.current(generation) || !captured.equals(token)) return;
                    busy = false;
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
    private void navigate() { epoch.invalidate(); api.cancel(); busy = false; history = new JSONArray(); clearPhoto(); dismissImage(); hideKeyboard(); }
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
        NativePush.clearNotifications(this); vault.save(next); navigate(); token = next; identity = decoded; clearTwoFactor(); selected = null; stores();
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
    private void operatorPin(String storeId, JSONObject data) {
        layout("Προσωπικό PIN", "Μόνο συνομιλία καταστήματος");
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
        LinearLayout tabs = new LinearLayout(this);
        tabs.addView(button("‹ Συνομιλίες", () -> { navigate(); selected = null; stores(); }), new LinearLayout.LayoutParams(0, dp(54), 1));
        tabs.addView(button(tab.equals("ai") ? "Μηνύματα" : "Βοηθός AI", () -> {
            if (busy) return; navigate(); tab = tab.equals("ai") ? "chat" : "ai"; conversation();
        }), new LinearLayout.LayoutParams(0, dp(54), 1));
        root.addView(tabs, 1);
        root.removeView(contentScroll); scroll = new ScrollView(this); scroll.setFillViewport(false); scroll.setBackgroundColor(0xfff4f1f8);
        messages = new LinearLayout(this); messages.setOrientation(LinearLayout.VERTICAL); messages.setPadding(dp(12), dp(8), dp(12), dp(8)); scroll.addView(messages);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        root.removeView(notice); root.addView(notice);
        if (tab.equals("ai") && (staff() || (!platform() && !identity.optString("role").equals("OWNER")))) {
            bubble("Ο βοηθός δεν είναι διαθέσιμος με τα δικαιώματα αυτού του λογαριασμού.", false, "", null); return;
        }
        attachmentLabel = text("", 14, MUTED); root.addView(attachmentLabel);
        LinearLayout bar = new LinearLayout(this); bar.setGravity(Gravity.BOTTOM); bar.setPadding(dp(6), dp(4), dp(6), dp(4));
        if (tab.equals("chat")) bar.addView(button("＋", this::pickPhoto), new LinearLayout.LayoutParams(dp(52), dp(56)));
        composer = input(tab.equals("ai") ? "Ρώτησε τον βοηθό…" : "Γράψε μήνυμα…", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS, tab.equals("ai") ? 600 : 5000);
        composer.setMaxLines(4); bar.addView(composer, new LinearLayout.LayoutParams(0, -2, 1));
        Button send = button("➤", this::send); send.setContentDescription("Αποστολή μηνύματος"); bar.addView(send, new LinearLayout.LayoutParams(dp(56), dp(56))); root.addView(bar);
        updatePhotoLabel();
        if (tab.equals("chat")) loadMessages(true); else checkAssistant();
    }
    private void loadMessages(boolean initial) {
        if (selected == null || busy) return;
        call(chatBase() + "/messages?limit=100", "GET", null, false, data -> {
            JSONObject store = data.getJSONObject("store");
            if (!id(store, "id").equals(id(selected, "id")) || !id(store, "companyId").equals(id(selected, "companyId"))) throw new IllegalArgumentException();
            photosEnabled = data.optJSONObject("settings") == null || data.getJSONObject("settings").optBoolean("photosEnabled", true);
            JSONArray rows = data.getJSONArray("rows"); ArrayList<JSONObject> sorted = new ArrayList<>();
            for (int n = 0; n < rows.length(); n++) sorted.add(rows.getJSONObject(n));
            sorted.sort(Comparator.comparing(row -> row.optString("createdAt")));
            int oldY = scroll.getScrollY(); boolean atBottom = scroll.getChildAt(0).getHeight() - scroll.getHeight() - oldY < dp(90);
            messages.removeAllViews();
            if (sorted.isEmpty()) bubble("Δεν υπάρχουν ακόμη μηνύματα.", false, "", null);
            for (JSONObject row : sorted) {
                boolean own = row.optString("senderId").equals(identity.optString("id"));
                String meta = row.optString("senderName") + " · " + time(row.optString("createdAt"));
                JSONArray readers = row.optJSONArray("readers");
                if (own && readers != null && readers.length() > 0) meta += " · Διαβάστηκε";
                bubble(row.optString("body", ""), own, meta, row);
            }
            if (uncertainStoreId.equals(id(selected, "id"))) {
                bubble("Η τελευταία αποστολή μπορεί να έχει ολοκληρωθεί. Έλεγξε τα μηνύματα πριν συντάξεις νέα αποστολή.", false, "Έλεγχος αποστολής", null);
                messages.addView(button("Απόρριψη παλιού προσχεδίου · νέα σύνταξη", () -> {
                    uncertainStoreId = ""; composer.setText(""); clearPhoto(); updatePhotoLabel(); loadMessages(false);
                }));
            }
            scroll.post(() -> { if (initial || atBottom) scroll.fullScroll(View.FOCUS_DOWN); else scroll.scrollTo(0, oldY); });
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
        String value = composer.getText().toString().trim(); if (value.isEmpty() && photo == null) return;
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
            JSONObject body = object("body", value, "category", "GENERAL");
            if (photo != null) { if (!photosEnabled) { status("Οι φωτογραφίες είναι ανενεργές για αυτό το κατάστημα."); return; } try { body.put("attachment", object("name", photoMime.equals("image/png") ? "photo.png" : photoMime.equals("image/webp") ? "photo.webp" : "photo.jpg", "mimeType", photoMime, "dataUrl", "data:" + photoMime + ";base64," + Base64.encodeToString(photo, Base64.NO_WRAP))); } catch (Exception ignored) { return; } }
            uncertainStoreId = id(selected, "id");
            call(chatBase() + "/messages", "POST", body, false, result -> { uncertainStoreId = ""; composer.setText(""); clearPhoto(); updatePhotoLabel(); loadMessages(true); });
        }
    }
    private void bubble(String body, boolean own, String meta, JSONObject row) {
        LinearLayout card = new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(14), dp(10), dp(14), dp(10)); card.setBackground(round(own ? 0xffe8defc : Color.WHITE, 18));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2); lp.gravity = own ? Gravity.END : Gravity.START; lp.setMargins(own ? dp(28) : 0, dp(5), own ? 0 : dp(28), dp(5));
        if (!body.isEmpty()) card.addView(text(body, 17, INK));
        if (row != null && row.optBoolean("hasAttachment")) {
            if (row.optString("attachmentMimeType").startsWith("image/")) card.addView(button("▧ Φωτογραφία · προβολή", () -> viewPhoto(row)));
            else card.addView(text("Συνημμένο · Η λήψη αρχείων είναι απενεργοποιημένη σε αυτή την εφαρμογή.", 14, MUTED));
        }
        if (!meta.isEmpty()) card.addView(text(meta, 12, MUTED));
        if (row != null && !row.optBoolean("readByMe")) card.addView(button("Σημείωση ως διαβασμένο", () -> call(chatBase() + "/messages/" + enc(row.optString("id")) + "/read", "POST", object(), false, ignored -> loadMessages(false))));
        messages.addView(card, lp);
    }
    private void showEvidence(JSONArray evidence) {
        try {
            TextView report = text(ReportText.render(evidence), 15, INK); ScrollView box = new ScrollView(this); box.addView(report);
            imageDialog = new AlertDialog.Builder(this).setTitle("Στοιχεία πηγής · μόνο προβολή").setView(box).setPositiveButton("Κλείσιμο", null).create();
            imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); imageDialog.show();
        } catch (Exception ignored) { status("Δεν είναι διαθέσιμη η προβολή πηγής."); }
    }
    private void pickPhoto() {
        if (busy || !photosEnabled) { status("Οι φωτογραφίες δεν είναι διαθέσιμες αυτή τη στιγμή."); return; }
        new AlertDialog.Builder(this).setTitle("Φωτογραφία").setItems(new String[]{"Κάμερα · χωρίς αποθήκευση", "Υπάρχουσα φωτογραφία"}, (dialog, choice) -> {
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
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/jpeg", "image/png", "image/webp"});
        startActivityForResult(Intent.createChooser(intent, "Επιλογή φωτογραφίας"), PHOTO);
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == CAMERA) {
            byte[] captured = CaptureBuffer.take();
            if (result == RESULT_OK && photoToken.equals(token) && photoBinding.equals(id(selected, "id"))) { clearPhoto(); photo = captured; photoMime = "image/jpeg"; }
            else if (captured != null) Arrays.fill(captured, (byte) 0);
            photoBinding = ""; photoToken = ""; return;
        }
        if (request != PHOTO || result != RESULT_OK || data == null || data.getData() == null || !photoToken.equals(token) || !photoBinding.equals(id(selected, "id"))) return;
        Uri uri = data.getData(); String mime = getContentResolver().getType(uri);
        if (!"content".equals(uri.getScheme()) || !("image/jpeg".equals(mime) || "image/png".equals(mime) || "image/webp".equals(mime))) return;
        // A transient read grant only: no persistable URI, original filename, gallery write or local copy.
        try (InputStream input = getContentResolver().openInputStream(uri)) { clearPhoto(); photo = ChatApi.bounded(input, 7 * 1024 * 1024); photoMime = mime; }
        catch (Exception ignored) { clearPhoto(); }
        photoBinding = ""; photoToken = "";
    }
    private void updatePhotoLabel() {
        if (attachmentLabel != null) { attachmentLabel.setText(photo == null ? "" : "▧ Φωτογραφία επιλεγμένη · πάτησε για αφαίρεση"); attachmentLabel.setOnClickListener(v -> { clearPhoto(); updatePhotoLabel(); }); }
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
                    preview = bitmap; ImageView image = new ImageView(this); image.setAdjustViewBounds(true); image.setImageBitmap(bitmap);
                    imageDialog = new AlertDialog.Builder(this).setTitle("Προσωρινή προβολή").setView(image).setPositiveButton("Κλείσιμο", null).create();
                    imageDialog.setOnDismissListener(dialog -> { image.setImageDrawable(null); if (preview != null) { preview.recycle(); preview = null; } }); imageDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); imageDialog.show();
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
    private void clearPhoto() { if (photo != null) Arrays.fill(photo, (byte) 0); photo = null; photoMime = ""; }
    private void wipeViews(View view) {
        if (view instanceof EditText) ((EditText) view).getText().clear();
        else if (view instanceof TextView) ((TextView) view).setText("");
        if (view instanceof ImageView) ((ImageView) view).setImageDrawable(null);
        if (view instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) wipeViews(group.getChildAt(i));
        }
    }
    private void dismissImage() { if (imageDialog != null) { imageDialog.dismiss(); imageDialog = null; } if (preview != null) { preview.recycle(); preview = null; } }
    private void logout() {
        if (busy) return;
        String path = staff() ? "/api/store-chat/stores/" + enc(identity.optString("storeId")) + "/mobile-logout" : "/api/auth/logout";
        String captured = token;
        // Clear local content/token immediately even when the server is unreachable. Native receipt rejects missing/changed local session; server logout revokes delivery.
        clearSession(); loginScreen();
        worker.execute(() -> { try { api.json(path, "POST", object(), captured); } catch (Exception ignored) { /* Never retain content or credential to retry later. */ } });
    }
    private void clearSession() { NativePush.logout(this); pushStore = ""; pushCompany = ""; navigate(); token = ""; identity = new JSONObject(); selected = null; uncertainStoreId = ""; try { clearTwoFactor(); vault.clear(); } catch (Exception ignored) { finishAndRemoveTask(); } }
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
        notice = text("", 14, 0xffa12b49); notice.setPadding(dp(16), dp(4), dp(16), dp(4)); notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); root.addView(notice);
        composer = null; attachmentLabel = null; setContentView(root); root.requestApplyInsets();
    }
    private TextView text(String value, int size, int color) { TextView v = new TextView(this); v.setText(value); v.setTextSize(size); v.setTextColor(color); v.setTextIsSelectable(false); v.setSaveEnabled(false); v.setPadding(0, dp(4), 0, dp(4)); return v; }
    private Button button(String label, Runnable action) { Button b = new Button(this); b.setText(label); b.setTextColor(PURPLE); b.setAllCaps(false); b.setTextSize(15); b.setMinHeight(dp(52)); b.setMinimumWidth(0); b.setPadding(dp(10), dp(5), dp(10), dp(5)); b.setSaveEnabled(false); b.setOnClickListener(v -> action.run()); return b; }
    private EditText input(String hint, int type, int limit) {
        EditText input = new PrivateEditText(this); input.setHint(hint); input.setTextSize(17); input.setInputType(type); input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(limit)}); input.setMinHeight(dp(56)); input.setSaveEnabled(false); input.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS); input.setImeOptions(android.view.inputmethod.EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING); input.setPadding(dp(10), dp(8), dp(10), dp(8)); return input;
    }
    private GradientDrawable round(int color, int radius) { GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(radius)); return d; }
    private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    private void status(String value) { if (notice != null) notice.setText(value); }
    private void hideKeyboard() { View focus = getCurrentFocus(); if (focus != null) ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(focus.getWindowToken(), 0); }
    private String time(String date) { try { return DateTimeFormatter.ofPattern("dd/MM HH:mm", Locale.forLanguageTag("el-GR")).withZone(ZoneId.of("Europe/Athens")).format(Instant.parse(date)); } catch (Exception ignored) { return ""; } }
}
