package gr.myworkstation.chat;
import java.util.Arrays;
/** A single-use, process-memory handoff. Never put JPEG bytes in an Intent, Bundle or file. */
final class CaptureBuffer {
    private static byte[] bytes;
    private static long created;
    private static final java.util.concurrent.ScheduledExecutorService expiry = java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "capture-expiry"); t.setDaemon(true); return t; });
    static synchronized void put(byte[] next) {
        clear(); bytes = next; created = System.nanoTime();
        expiry.schedule(() -> { synchronized (CaptureBuffer.class) { if (bytes == next) clear(); } }, 30, java.util.concurrent.TimeUnit.SECONDS);
    }
    static synchronized byte[] take() {
        if (System.nanoTime() - created > 30_000_000_000L) { clear(); return null; }
        byte[] value = bytes; bytes = null; return value;
    }
    static synchronized void clear() { if (bytes != null) Arrays.fill(bytes, (byte) 0); bytes = null; }
}
