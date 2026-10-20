package gr.myworkstation.chat;

import java.util.Arrays;

/** Bounded ISO-BMFF envelope; codecs/duration are additionally checked by platform metadata and server. */
final class VideoData {
    static final int MAX_BYTES = 12 * 1024 * 1024, MAX_MS = 30000;
    static boolean valid(byte[] data) {
        if (data == null || data.length < 32 || data.length > MAX_BYTES) return false;
        boolean ftyp = false, moov = false, mdat = false;
        int offset = 0, boxes = 0;
        while (offset < data.length) {
            if (++boxes > 128 || data.length - offset < 8) return false;
            long size = ((long)(data[offset]&255)<<24)|((long)(data[offset+1]&255)<<16)|((long)(data[offset+2]&255)<<8)|(data[offset+3]&255);
            int header = 8;
            if (size == 1) {
                if (data.length - offset < 16) return false;
                size = 0; for (int i=8;i<16;i++) { if (size > MAX_BYTES) return false; size=(size<<8)|(data[offset+i]&255); } header=16;
            }
            if (size == 0) size=data.length-offset;
            if (size < header || size > data.length-offset) return false;
            int type = ((data[offset+4]&255)<<24)|((data[offset+5]&255)<<16)|((data[offset+6]&255)<<8)|(data[offset+7]&255);
            if (type == 0x66747970) { if (ftyp || offset != 0 || size < 16) return false; ftyp=true; }
            else if (type == 0x6d6f6f76) { if (moov) return false; moov=true; }
            else if (type == 0x6d646174) { if (size <= header) return false; mdat=true; }
            else if (type != 0x66726565 && type != 0x736b6970 && type != 0x77696465) return false;
            offset += (int)size;
        }
        return ftyp && moov && mdat;
    }
    static void wipe(byte[] bytes) { if(bytes!=null) Arrays.fill(bytes,(byte)0); }
    private VideoData() {}
}
