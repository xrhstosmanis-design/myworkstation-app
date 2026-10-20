package gr.myworkstation.chat;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import android.widget.*;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Foreground-only bounded PCM recording; no file-based MediaRecorder or saved audio state. */
public final class VoiceActivity extends Activity {
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final RequestEpoch epoch = new RequestEpoch();
    private final VoicePlayer player = new VoicePlayer();
    private volatile boolean active, recording, cancelled;
    private volatile AudioRecord recorder;
    private volatile int recorded;
    private boolean returning;
    private byte[] draft;
    private long permissionEpoch;
    private TextView status;
    private Button start, stop, play, use;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!active) return;
            if (recording) status.setText("Εγγραφή · " + recorded / VoiceData.RATE + " / 60 δευτερόλεπτα");
            controls(); ui.postDelayed(this, 300);
        }
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(null); getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if (android.os.Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(false);
        VoiceBuffer.clear(); LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(24, 48, 24, 24);
        status = new TextView(this); status.setTextSize(19); status.setText("Φωνητικό έως 60 δευτερόλεπτα · δεν αποθηκεύεται αρχείο από την εφαρμογή"); box.addView(status, new LinearLayout.LayoutParams(-1, 0, 1));
        start = button("Έναρξη εγγραφής", this::requestStart); box.addView(start);
        stop = button("Διακοπή εγγραφής", this::stopRecording); box.addView(stop);
        play = button("Αναπαραγωγή / από την αρχή", () -> { if (!player.play(draft, null)) status.setText("Δεν ξεκίνησε η αναπαραγωγή."); }); box.addView(play);
        use = button("Χρήση φωνητικού", this::useVoice); box.addView(use);
        box.addView(button("Ακύρωση", this::finish)); setContentView(box); controls();
    }
    private Button button(String title, Runnable action) { Button b = new Button(this); b.setText(title); b.setMinHeight(64); b.setOnClickListener(v -> action.run()); return b; }
    @Override protected void onResume() { super.onResume(); active = true; controls(); ui.post(tick); }
    @Override protected void onStop() {
        active = false; epoch.invalidate(); cancelled = true; stopRecording(); player.stop(); clearDraft();
        ui.removeCallbacks(tick); if (!returning) VoiceBuffer.clear(); status.setText("Φωνητικό"); super.onStop();
    }
    @Override protected void onSaveInstanceState(Bundle state) { /* No audio or private UI state. */ }
    @Override protected void onDestroy() { cancelled = true; stopRecording(); player.stop(); clearDraft(); if (!returning) VoiceBuffer.clear(); worker.shutdownNow(); super.onDestroy(); }
    private void controls() {
        if (start == null) return;
        start.setEnabled(active && recorder == null && !returning); stop.setEnabled(active && recording);
        play.setEnabled(active && recorder == null && draft != null && !returning);
        use.setEnabled(active && recorder == null && draft != null && !returning);
    }
    private void requestStart() {
        if (!active || recorder != null || returning) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            permissionEpoch = epoch.capture(); requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 53); return;
        }
        startRecording();
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code != 53 || !active || !epoch.current(permissionEpoch)) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startRecording();
        else status.setText("Το μικρόφωνο δεν επιτράπηκε. Μπορείς να επιστρέψεις στα μηνύματα ή στις φωτογραφίες.");
    }
    @SuppressWarnings("MissingPermission")
    private void startRecording() {
        if (!active || recorder != null || returning || checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;
        player.stop(); clearDraft(); cancelled = false; recorded = 0;
        epoch.invalidate(); final long generation = epoch.capture();
        try {
            int minimum = AudioRecord.getMinBufferSize(VoiceData.RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            if (minimum <= 0) throw new IllegalStateException();
            final AudioRecord value = new AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.MIC)
                .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(VoiceData.RATE).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build())
                .setBufferSizeInBytes(Math.max(8192, minimum)).build();
            if (value.getState() != AudioRecord.STATE_INITIALIZED) { value.release(); throw new IllegalStateException(); }
            recorder = value; value.startRecording(); recording = true; controls();
            worker.execute(() -> capture(value, generation));
        } catch (Exception ignored) {
            AudioRecord old = recorder; recorder = null; recording = false;
            if (old != null) { try { old.stop(); } catch (Exception nothing) {} old.release(); }
            status.setText("Δεν ξεκίνησε η εγγραφή. Έλεγξε το μικρόφωνο και την άδειά του."); controls();
        }
    }
    private void capture(AudioRecord value, long generation) {
        short[] samples = new short[VoiceData.MAX_SAMPLES]; byte[] result = null;
        try {
            while (recording && !cancelled && active && epoch.current(generation) && recorded < samples.length) {
                int n = value.read(samples, recorded, Math.min(4096, samples.length - recorded), AudioRecord.READ_BLOCKING);
                if (n <= 0) { if (recording) throw new IllegalStateException(); break; }
                recorded += n;
            }
            if (!cancelled && active && epoch.current(generation) && recorded > 0) result = VoiceData.fromPcm(samples, recorded);
        } catch (Exception ignored) { /* Generic UI result; never log private PCM. */ }
        finally {
            recording = false; try { value.stop(); } catch (Exception ignored) {} value.release();
            if (recorder == value) recorder = null; Arrays.fill(samples, (short) 0);
        }
        final byte[] bytes = result; ui.post(() -> acceptVoice(bytes, generation));
    }
    private void acceptVoice(byte[] bytes, long generation) {
        if (!active || !epoch.current(generation) || returning || isFinishing()) { VoiceData.wipe(bytes); return; }
        clearDraft();
        if (VoiceData.valid(bytes)) { draft = bytes; status.setText("Έτοιμο · " + VoiceData.seconds(draft) + " δευτερόλεπτα. Έλεγξε και πάτησε Χρήση φωνητικού."); }
        else { VoiceData.wipe(bytes); status.setText("Δεν ολοκληρώθηκε η εγγραφή. Μπορείς να δοκιμάσεις ξανά ή να επιστρέψεις."); }
        controls();
    }
    private void stopRecording() { recording = false; AudioRecord value = recorder; if (value != null) try { value.stop(); } catch (Exception ignored) {} controls(); }
    private void clearDraft() { VoiceData.wipe(draft); draft = null; }
    private void useVoice() {
        if (!active || recorder != null || !VoiceData.valid(draft) || returning) return;
        player.stop(); byte[] transfer = draft; draft = null; VoiceBuffer.put(transfer); returning = true; epoch.invalidate(); setResult(RESULT_OK); finish();
    }
}
