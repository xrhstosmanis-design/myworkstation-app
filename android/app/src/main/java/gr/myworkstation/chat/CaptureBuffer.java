package gr.myworkstation.chat;
/** A single-use, bounded process-memory batch handoff. Never put JPEG bytes in an Intent, Bundle or file. */
final class CaptureBuffer {
    private static PhotoBatch batch;
    private static long created;
    private static final java.util.concurrent.ScheduledExecutorService expiry = java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "capture-expiry"); t.setDaemon(true); return t; });
    static synchronized void put(PhotoBatch next) {
        clear(); batch = next; created = System.nanoTime();
        expiry.schedule(() -> { synchronized (CaptureBuffer.class) { if (batch == next) clear(); } }, 30, java.util.concurrent.TimeUnit.SECONDS);
    }
    static synchronized PhotoBatch take() {
        if (System.nanoTime() - created > 30_000_000_000L) { clear(); return null; }
        PhotoBatch value = batch; batch = null; created = 0; return value;
    }
    static synchronized void clear() { if (batch != null) batch.clear(); batch = null; created = 0; }
}
