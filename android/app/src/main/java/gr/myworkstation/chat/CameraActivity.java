package gr.myworkstation.chat;

import android.app.Activity;
import android.graphics.ImageFormat;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.*;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Size;
import android.view.*;
import android.widget.*;
import java.util.Arrays;

/** Direct Camera2 capture into RAM; no external camera app, MediaStore or filesystem output. */
public final class CameraActivity extends Activity {
    private CameraDevice device;
    private CameraCaptureSession session;
    private ImageReader reader;
    private HandlerThread thread;
    private Handler camera;
    private TextureView texture;
    private TextView status;
    private volatile boolean active;
    private boolean capturing, returning;
    private final PhotoBatch captures = new PhotoBatch();
    private final RequestEpoch epoch = new RequestEpoch();
    private Button take, use;
    private int sensorOrientation = 90;
    @Override public void onCreate(Bundle state) {
        super.onCreate(null); getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if (android.os.Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(false);
        CaptureBuffer.clear();
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL);
        status = new TextView(this); status.setText("Έως 5 λήψεις · μετά πάτησε Χρήση φωτογραφιών · χωρίς αποθήκευση στη συλλογή"); status.setPadding(20, 40, 20, 16); layout.addView(status);
        texture = new TextureView(this); layout.addView(texture, new LinearLayout.LayoutParams(-1, 0, 1));
        take = new Button(this); take.setText("Λήψη"); take.setMinHeight(64); take.setOnClickListener(v -> capture()); layout.addView(take);
        use = new Button(this); use.setText("Χρήση φωτογραφιών"); use.setEnabled(false); use.setOnClickListener(v -> usePhotos()); layout.addView(use);
        take.setEnabled(false);
        Button cancel = new Button(this); cancel.setText("Ακύρωση"); cancel.setOnClickListener(v -> finish()); layout.addView(cancel); setContentView(layout);
        texture.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            @Override public void onSurfaceTextureAvailable(SurfaceTexture surface, int w, int h) { open(); }
            @Override public void onSurfaceTextureSizeChanged(SurfaceTexture s, int w, int h) { }
            @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture surface) { close(); return true; }
            @Override public void onSurfaceTextureUpdated(SurfaceTexture surface) { }
        });
    }
    @Override protected void onResume() {
        super.onResume(); active = true; status.setText("Έως 5 λήψεις · μετά πάτησε Χρήση φωτογραφιών · χωρίς αποθήκευση στη συλλογή"); updateControls(); thread = new HandlerThread("camera-memory"); thread.start(); camera = new Handler(thread.getLooper());
        if (texture.isAvailable()) open();
    }
    @SuppressWarnings("MissingPermission")
    private void open() {
        if (!active || device != null || reader != null || camera == null) return;
        final long generation = epoch.capture();
        try {
            CameraManager manager = (CameraManager) getSystemService(CAMERA_SERVICE); String chosen = null;
            for (String id : manager.getCameraIdList()) { CameraCharacteristics info = manager.getCameraCharacteristics(id); if (Integer.valueOf(CameraCharacteristics.LENS_FACING_BACK).equals(info.get(CameraCharacteristics.LENS_FACING))) { chosen = id; break; } }
            if (chosen == null) { fail(generation); return; }
            CameraCharacteristics info = manager.getCameraCharacteristics(chosen); Integer orientation = info.get(CameraCharacteristics.SENSOR_ORIENTATION); sensorOrientation = orientation == null ? 90 : orientation;
            StreamConfigurationMap map = info.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP); if (map == null) { fail(generation); return; }
            Size[] sizes = map.getOutputSizes(ImageFormat.JPEG); if (sizes == null || sizes.length == 0) { fail(generation); return; }
            Size size = Arrays.stream(sizes).filter(s -> s.getWidth() <= 1600 && s.getHeight() <= 1600).max(java.util.Comparator.comparingLong(s -> (long) s.getWidth() * s.getHeight())).orElse(sizes[sizes.length - 1]);
            reader = ImageReader.newInstance(size.getWidth(), size.getHeight(), ImageFormat.JPEG, 2);
            reader.setOnImageAvailableListener(source -> {
                try (Image image = source.acquireLatestImage()) {
                    if (!active || !epoch.current(generation) || image == null) return; java.nio.ByteBuffer buffer = image.getPlanes()[0].getBuffer();
                    if (buffer.remaining() > 7 * 1024 * 1024) { fail(generation); return; }
                    byte[] bytes = new byte[buffer.remaining()]; buffer.get(bytes);
                    runOnUiThread(() -> acceptImage(bytes, generation));
                } catch (Exception ignored) { fail(generation); }
            }, camera);
            manager.openCamera(chosen, new CameraDevice.StateCallback() {
                @Override public void onOpened(CameraDevice value) { if (!active || !epoch.current(generation)) { value.close(); return; } device = value; preview(generation); }
                @Override public void onDisconnected(CameraDevice value) { value.close(); if (!epoch.current(generation)) return; if (device == value) device = null; fail(generation); }
                @Override public void onError(CameraDevice value, int error) { value.close(); if (!epoch.current(generation)) return; if (device == value) device = null; fail(generation); }
            }, camera);
        } catch (Exception ignored) { fail(generation); }
    }
    private void preview(long generation) {
        try {
            SurfaceTexture surfaceTexture = texture.getSurfaceTexture(); if (surfaceTexture == null) { fail(generation); return; }
            surfaceTexture.setDefaultBufferSize(640, 480); Surface surface = new Surface(surfaceTexture);
            CaptureRequest.Builder request = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW); request.addTarget(surface);
            device.createCaptureSession(Arrays.asList(surface, reader.getSurface()), new CameraCaptureSession.StateCallback() {
                @Override public void onConfigured(CameraCaptureSession value) {
                    if (!active || !epoch.current(generation) || device == null) { value.close(); return; } session = value;
                    try { request.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE); value.setRepeatingRequest(request.build(), null, camera); runOnUiThread(() -> { if (active && epoch.current(generation)) updateControls(); }); }
                    catch (Exception ignored) { fail(generation); }
                }
                @Override public void onConfigureFailed(CameraCaptureSession value) { fail(generation); }
            }, camera);
        } catch (Exception ignored) { fail(generation); }
    }
    private void capture() {
        if (capturing || !active || session == null || device == null || reader == null || captures.size() >= PhotoBatch.MAX_COUNT || captures.bytes() >= PhotoBatch.MAX_TOTAL_BYTES) return;
        final long generation = epoch.capture();
        capturing = true; updateControls();
        try {
            CaptureRequest.Builder request = device.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE); request.addTarget(reader.getSurface());
            int rotation = getWindowManager().getDefaultDisplay().getRotation(); int degrees = rotation == Surface.ROTATION_90 ? 90 : rotation == Surface.ROTATION_180 ? 180 : rotation == Surface.ROTATION_270 ? 270 : 0;
            request.set(CaptureRequest.JPEG_ORIENTATION, (sensorOrientation - degrees + 360) % 360);
            session.capture(request.build(), new CameraCaptureSession.CaptureCallback() {
                @Override public void onCaptureFailed(CameraCaptureSession ignored, CaptureRequest request, CaptureFailure failure) { fail(generation); }
            }, camera);
        } catch (Exception ignored) { capturing = false; fail(generation); }
    }
    private void acceptImage(byte[] bytes, long generation) {
        if (!active || !epoch.current(generation) || returning || isFinishing()) { Arrays.fill(bytes, (byte) 0); return; }
        capturing = false;
        try {
            captures.add(bytes, "image/jpeg");
            status.setText(captures.size() + "/5 φωτογραφίες · Λήψη για επόμενη ή Χρήση φωτογραφιών");
        } catch (IllegalArgumentException refused) {
            status.setText("Η νέα λήψη ξεπερνά το όριο. Κρατήθηκαν " + captures.size() + " φωτογραφίες · έως 7 MB η καθεμία / 14 MB συνολικά.");
        }
        updateControls();
    }
    private void updateControls() {
        if (take != null) take.setEnabled(active && !capturing && session != null && device != null && captures.size() < PhotoBatch.MAX_COUNT && captures.bytes() < PhotoBatch.MAX_TOTAL_BYTES);
        if (use != null) { use.setText("Χρήση " + captures.size() + " φωτογραφιών"); use.setEnabled(active && !capturing && captures.size() > 0); }
    }
    private void usePhotos() {
        if (!active || capturing || captures.size() == 0 || returning || isFinishing()) return;
        PhotoBatch handoff = new PhotoBatch(); handoff.takeFrom(captures);
        CaptureBuffer.put(handoff); returning = true; epoch.invalidate();
        setResult(RESULT_OK); finish();
    }
    private void fail(long generation) {
        runOnUiThread(() -> {
            if (!active || !epoch.current(generation) || returning || isFinishing()) return;
            capturing = false; updateControls();
            status.setText(captures.size() == 0 ? "Η λήψη δεν ολοκληρώθηκε. Κλείσε και δοκίμασε ξανά ή επίλεξε υπάρχουσα φωτογραφία." : "Η λήψη δεν ολοκληρώθηκε. Μπορείς να χρησιμοποιήσεις τις " + captures.size() + " φωτογραφίες που κρατήθηκαν.");
        });
    }
    private void close() {
        if (session != null) { session.close(); session = null; } if (device != null) { device.close(); device = null; } if (reader != null) { reader.close(); reader = null; }
    }
    @Override protected void onStop() {
        active = false; epoch.invalidate(); capturing = false; captures.clear();
        if (!returning) CaptureBuffer.clear();
        close(); if (thread != null) { thread.quitSafely(); thread = null; } camera = null;
        super.onStop();
    }
    @Override protected void onDestroy() { epoch.invalidate(); captures.clear(); if (!returning) CaptureBuffer.clear(); super.onDestroy(); }
    @Override protected void onSaveInstanceState(Bundle state) { }
}
