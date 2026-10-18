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
import java.util.Collections;

/** Direct Camera2 capture into RAM; no external camera app, MediaStore or filesystem output. */
public final class CameraActivity extends Activity {
    private CameraDevice device;
    private CameraCaptureSession session;
    private ImageReader reader;
    private HandlerThread thread;
    private Handler camera;
    private TextureView texture;
    private TextView status;
    private boolean active, capturing;
    private int sensorOrientation = 90;
    @Override public void onCreate(Bundle state) {
        super.onCreate(null); getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if (android.os.Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(false);
        CaptureBuffer.clear();
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL);
        status = new TextView(this); status.setText("Λήψη φωτογραφίας · χωρίς αποθήκευση στη συλλογή"); status.setPadding(20, 40, 20, 16); layout.addView(status);
        texture = new TextureView(this); layout.addView(texture, new LinearLayout.LayoutParams(-1, 0, 1));
        Button take = new Button(this); take.setText("Λήψη"); take.setMinHeight(64); take.setOnClickListener(v -> capture()); layout.addView(take);
        Button cancel = new Button(this); cancel.setText("Ακύρωση"); cancel.setOnClickListener(v -> finish()); layout.addView(cancel); setContentView(layout);
        texture.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            @Override public void onSurfaceTextureAvailable(SurfaceTexture surface, int w, int h) { open(); }
            @Override public void onSurfaceTextureSizeChanged(SurfaceTexture s, int w, int h) { }
            @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture surface) { close(); return true; }
            @Override public void onSurfaceTextureUpdated(SurfaceTexture surface) { }
        });
    }
    @Override protected void onResume() {
        super.onResume(); active = true; thread = new HandlerThread("camera-memory"); thread.start(); camera = new Handler(thread.getLooper());
        if (texture.isAvailable()) open();
    }
    @SuppressWarnings("MissingPermission")
    private void open() {
        if (!active || device != null || reader != null || camera == null) return;
        try {
            CameraManager manager = (CameraManager) getSystemService(CAMERA_SERVICE); String chosen = null;
            for (String id : manager.getCameraIdList()) { CameraCharacteristics info = manager.getCameraCharacteristics(id); if (Integer.valueOf(CameraCharacteristics.LENS_FACING_BACK).equals(info.get(CameraCharacteristics.LENS_FACING))) { chosen = id; break; } }
            if (chosen == null) { fail(); return; }
            CameraCharacteristics info = manager.getCameraCharacteristics(chosen); Integer orientation = info.get(CameraCharacteristics.SENSOR_ORIENTATION); sensorOrientation = orientation == null ? 90 : orientation;
            StreamConfigurationMap map = info.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP); if (map == null) { fail(); return; }
            Size[] sizes = map.getOutputSizes(ImageFormat.JPEG); if (sizes == null || sizes.length == 0) { fail(); return; }
            Size size = Arrays.stream(sizes).filter(s -> s.getWidth() <= 1600 && s.getHeight() <= 1600).max(java.util.Comparator.comparingLong(s -> (long) s.getWidth() * s.getHeight())).orElse(sizes[sizes.length - 1]);
            reader = ImageReader.newInstance(size.getWidth(), size.getHeight(), ImageFormat.JPEG, 2);
            reader.setOnImageAvailableListener(source -> {
                try (Image image = source.acquireLatestImage()) {
                    if (!active || image == null) return; java.nio.ByteBuffer buffer = image.getPlanes()[0].getBuffer();
                    if (buffer.remaining() > 7 * 1024 * 1024) { fail(); return; }
                    byte[] bytes = new byte[buffer.remaining()]; buffer.get(bytes); CaptureBuffer.put(bytes);
                    runOnUiThread(() -> { if (active) { setResult(RESULT_OK); finish(); } else CaptureBuffer.clear(); });
                } catch (Exception ignored) { fail(); }
            }, camera);
            manager.openCamera(chosen, new CameraDevice.StateCallback() {
                @Override public void onOpened(CameraDevice value) { if (!active) { value.close(); return; } device = value; preview(); }
                @Override public void onDisconnected(CameraDevice value) { value.close(); device = null; fail(); }
                @Override public void onError(CameraDevice value, int error) { value.close(); device = null; fail(); }
            }, camera);
        } catch (Exception ignored) { fail(); }
    }
    private void preview() {
        try {
            SurfaceTexture surfaceTexture = texture.getSurfaceTexture(); if (surfaceTexture == null) { fail(); return; }
            surfaceTexture.setDefaultBufferSize(640, 480); Surface surface = new Surface(surfaceTexture);
            CaptureRequest.Builder request = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW); request.addTarget(surface);
            device.createCaptureSession(Arrays.asList(surface, reader.getSurface()), new CameraCaptureSession.StateCallback() {
                @Override public void onConfigured(CameraCaptureSession value) {
                    if (!active || device == null) { value.close(); return; } session = value;
                    try { request.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE); value.setRepeatingRequest(request.build(), null, camera); }
                    catch (Exception ignored) { fail(); }
                }
                @Override public void onConfigureFailed(CameraCaptureSession value) { fail(); }
            }, camera);
        } catch (Exception ignored) { fail(); }
    }
    private void capture() {
        if (capturing || !active || session == null || device == null || reader == null) return;
        capturing = true;
        try {
            CaptureRequest.Builder request = device.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE); request.addTarget(reader.getSurface());
            int rotation = getWindowManager().getDefaultDisplay().getRotation(); int degrees = rotation == Surface.ROTATION_90 ? 90 : rotation == Surface.ROTATION_180 ? 180 : rotation == Surface.ROTATION_270 ? 270 : 0;
            request.set(CaptureRequest.JPEG_ORIENTATION, (sensorOrientation - degrees + 360) % 360);
            session.capture(request.build(), null, camera);
        } catch (Exception ignored) { capturing = false; fail(); }
    }
    private void fail() { runOnUiThread(() -> { if (active) status.setText("Η κάμερα δεν άνοιξε. Κλείσε και δοκίμασε ξανά ή επίλεξε υπάρχουσα φωτογραφία."); }); }
    private void close() {
        if (session != null) { session.close(); session = null; } if (device != null) { device.close(); device = null; } if (reader != null) { reader.close(); reader = null; }
    }
    @Override protected void onStop() { active = false; close(); if (thread != null) { thread.quitSafely(); thread = null; } super.onStop(); }
    @Override protected void onSaveInstanceState(Bundle state) { }
}
