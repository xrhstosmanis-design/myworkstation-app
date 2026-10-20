package gr.myworkstation.chat;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;

/** The one canonical voice container accepted by the scoped server endpoint. */
final class VoiceData {
    static final int RATE = 16000, MAX_SAMPLES = RATE * 60, MAX_BYTES = 44 + MAX_SAMPLES * 2;
    private VoiceData() {}
    static byte[] fromPcm(short[] samples, int count) {
        if (samples == null || count < 1 || count > samples.length || count > MAX_SAMPLES) throw new IllegalArgumentException();
        ByteBuffer b = ByteBuffer.allocate(44 + count * 2).order(ByteOrder.LITTLE_ENDIAN);
        b.putInt(0x46464952).putInt(b.capacity() - 8).putInt(0x45564157).putInt(0x20746d66).putInt(16);
        b.putShort((short) 1).putShort((short) 1).putInt(RATE).putInt(RATE * 2).putShort((short) 2).putShort((short) 16);
        b.putInt(0x61746164).putInt(count * 2);
        for (int n = 0; n < count; n++) b.putShort(samples[n]);
        return b.array();
    }
    static boolean valid(byte[] data) {
        if (data == null || data.length < 46 || data.length > MAX_BYTES || data.length % 2 != 0) return false;
        ByteBuffer b = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
        return b.getInt(0) == 0x46464952 && b.getInt(4) == data.length - 8 && b.getInt(8) == 0x45564157
            && b.getInt(12) == 0x20746d66 && b.getInt(16) == 16 && b.getShort(20) == 1 && b.getShort(22) == 1
            && b.getInt(24) == RATE && b.getInt(28) == RATE * 2 && b.getShort(32) == 2 && b.getShort(34) == 16
            && b.getInt(36) == 0x61746164 && b.getInt(40) == data.length - 44;
    }
    static void wipe(byte[] bytes) { if (bytes != null) Arrays.fill(bytes, (byte) 0); }
    static int seconds(byte[] bytes) { return valid(bytes) ? Math.max(1, (bytes.length - 44 + 31999) / 32000) : 0; }
}
