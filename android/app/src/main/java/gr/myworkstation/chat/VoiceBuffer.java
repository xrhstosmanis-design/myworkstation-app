package gr.myworkstation.chat;

/** Single-use RAM handoff; audio is never in an Intent, Bundle, file or persisted URI. */
final class VoiceBuffer {
    private static byte[] value;
    private static long created;
    private static final java.util.concurrent.ScheduledExecutorService expiry = java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "voice-expiry"); t.setDaemon(true); return t; });
    static synchronized void put(byte[] next) {
        clear();
        if (!VoiceData.valid(next)) { VoiceData.wipe(next); return; }
        value = next; created = System.nanoTime();
        expiry.schedule(() -> { synchronized (VoiceBuffer.class) { if (value == next) clear(); } }, 30, java.util.concurrent.TimeUnit.SECONDS);
    }
    static synchronized byte[] take() {
        if (System.nanoTime() - created > 30_000_000_000L) { clear(); return null; }
        byte[] result = value; value = null; created = 0; return result;
    }
    static synchronized void clear() { VoiceData.wipe(value); value = null; created = 0; }
}
