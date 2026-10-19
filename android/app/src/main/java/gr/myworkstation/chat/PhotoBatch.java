package gr.myworkstation.chat;

import java.util.ArrayList;
import java.util.Arrays;

/** Owns private bytes only in memory. A confirmed send consumes exactly one image. */
final class PhotoBatch {
    static final int MAX_COUNT = 5, MAX_IMAGE_BYTES = 7 * 1024 * 1024, MAX_TOTAL_BYTES = 14 * 1024 * 1024;
    static final class Photo {
        final byte[] bytes;
        final String mime;
        Photo(byte[] bytes, String mime) { this.bytes = bytes; this.mime = mime; }
    }
    private final ArrayList<Photo> items = new ArrayList<>();
    private int bytes;
    int size() { return items.size(); }
    int bytes() { return bytes; }
    Photo get(int index) { return items.get(index); }
    void add(byte[] value, String mime) {
        if (value == null) throw new IllegalArgumentException();
        if (value.length == 0 || value.length > MAX_IMAGE_BYTES || items.size() >= MAX_COUNT || value.length > MAX_TOTAL_BYTES - bytes
                || !("image/jpeg".equals(mime) || "image/png".equals(mime) || "image/webp".equals(mime))) {
            Arrays.fill(value, (byte) 0);
            throw new IllegalArgumentException("Επίλεξε έως 5 φωτογραφίες, έως 7 MB η καθεμία και 14 MB συνολικά.");
        }
        items.add(new Photo(value, mime)); bytes += value.length;
    }
    void remove(int index) {
        Photo photo = items.remove(index); bytes -= photo.bytes.length; Arrays.fill(photo.bytes, (byte) 0);
    }
    void clear() { while (!items.isEmpty()) remove(items.size() - 1); }
    void takeFrom(PhotoBatch source) {
        if (source == this) return;
        clear(); items.addAll(source.items); bytes = source.bytes; source.items.clear(); source.bytes = 0;
    }
}
