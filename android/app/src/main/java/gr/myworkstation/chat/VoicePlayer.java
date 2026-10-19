package gr.myworkstation.chat;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import java.util.Arrays;

/** PCM playback directly from bounded RAM; no media file or framework disk cache. */
final class VoicePlayer {
    private AudioTrack track;
    private volatile long generation;
    synchronized boolean play(byte[] data, Runnable finished) {
        stop(); if (!VoiceData.valid(data)) return false;
        final long captured = generation;
        try {
            final AudioTrack value = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(VoiceData.RATE).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setTransferMode(AudioTrack.MODE_STREAM).setBufferSizeInBytes(Math.max(8192, AudioTrack.getMinBufferSize(VoiceData.RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT))).build();
            if (value.getState() != AudioTrack.STATE_INITIALIZED) { value.release(); return false; }
            track = value; value.play();
            Thread thread = new Thread(() -> {
                short[] chunk = new short[2048];
                try {
                    for (int offset = 44; offset < data.length && captured == generation;) {
                        int count = Math.min(chunk.length, (data.length - offset) / 2);
                        for (int i = 0; i < count; i++) chunk[i] = (short) ((data[offset + i * 2] & 255) | (data[offset + i * 2 + 1] << 8));
                        int written = 0;
                        while (written < count && captured == generation) {
                            int n = value.write(chunk, written, count - written, AudioTrack.WRITE_BLOCKING);
                            if (n <= 0) throw new IllegalStateException(); written += n;
                        }
                        Arrays.fill(chunk, (short) 0); offset += count * 2;
                    }
                    // A short clip must still fill the stream start threshold; padding contains no private samples.
                    int padding = Math.max(0, value.getBufferSizeInFrames() - (data.length - 44) / 2);
                    while (padding > 0 && captured == generation) {
                        int n = value.write(chunk, 0, Math.min(chunk.length, padding), AudioTrack.WRITE_BLOCKING);
                        if (n <= 0) throw new IllegalStateException(); padding -= n;
                    }
                    long deadline = System.nanoTime() + 65_000_000_000L;
                    while (captured == generation && value.getPlaybackHeadPosition() < (data.length - 44) / 2 && System.nanoTime() < deadline) Thread.sleep(20);
                } catch (Exception ignored) { /* Owner shows no private native diagnostic. */ }
                finally {
                    Arrays.fill(chunk, (short) 0);
                    synchronized (VoicePlayer.this) {
                        if (track == value) { track = null; try { value.stop(); } catch (Exception ignored) {} value.release(); }
                    }
                    if (captured == generation && finished != null) finished.run();
                }
            }, "voice-memory-playback"); thread.setDaemon(true); thread.start(); return true;
        } catch (Exception ignored) { stop(); return false; }
    }
    synchronized void stop() {
        generation++;
        if (track != null) { AudioTrack old = track; track = null; try { old.pause(); old.flush(); old.stop(); } catch (Exception ignored) {} old.release(); }
    }
}
