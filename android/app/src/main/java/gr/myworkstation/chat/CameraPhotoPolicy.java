package gr.myworkstation.chat;

/** Bounded still-image selection; never changes the RAM-only photo handoff. */
final class CameraPhotoPolicy {
    static int select(int[][] sizes) {
        if (sizes == null || sizes.length == 0) throw new IllegalArgumentException("No camera sizes");
        int best = -1, smallest = 0; long area = 0, minimum = Long.MAX_VALUE;
        for (int i = 0; i < sizes.length; i++) {
            int w = sizes[i][0], h = sizes[i][1]; if (w <= 0 || h <= 0) continue;
            long pixels = (long) w * h;
            if (pixels < minimum) { minimum = pixels; smallest = i; }
            if (Math.max(w, h) <= 3264 && pixels <= 8_000_000 && pixels > area) { best = i; area = pixels; }
        }
        if (minimum == Long.MAX_VALUE) throw new IllegalArgumentException("Invalid camera sizes");
        return best < 0 ? smallest : best;
    }
}
