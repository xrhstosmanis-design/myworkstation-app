package gr.myworkstation.chat;

/** Reject every response captured before a navigation, session change or background transition. */
final class RequestEpoch {
    private long value;
    synchronized long capture() { return value; }
    synchronized void invalidate() { value++; }
    synchronized boolean current(long captured) { return value == captured; }
}
