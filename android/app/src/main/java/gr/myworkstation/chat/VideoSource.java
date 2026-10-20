package gr.myworkstation.chat;

import android.media.MediaDataSource;
import android.media.MediaExtractor;
import android.media.MediaFormat;

/** Reads existing bounded RAM; close does not own/wipe the caller's draft. */
final class VideoSource extends MediaDataSource {
    private byte[] bytes;
    VideoSource(byte[] value){bytes=value;}
    @Override public synchronized int readAt(long position,byte[] target,int offset,int size){
        if(bytes==null||position<0||position>=bytes.length)return -1;
        int count=Math.min(size,bytes.length-(int)position);System.arraycopy(bytes,(int)position,target,offset,count);return count;
    }
    @Override public synchronized long getSize(){return bytes==null?0:bytes.length;}
    @Override public synchronized void close(){bytes=null;}
    static boolean playable(byte[] bytes){
        if(!VideoData.valid(bytes))return false;
        MediaExtractor extractor=new MediaExtractor();VideoSource source=new VideoSource(bytes);
        try{
            extractor.setDataSource(source);boolean video=false;
            if(extractor.getTrackCount()<1||extractor.getTrackCount()>2)return false;
            for(int i=0;i<extractor.getTrackCount();i++){
                MediaFormat f=extractor.getTrackFormat(i);String mime=f.getString(MediaFormat.KEY_MIME);
                if(!f.containsKey(MediaFormat.KEY_DURATION)||f.getLong(MediaFormat.KEY_DURATION)<=0||f.getLong(MediaFormat.KEY_DURATION)>30_000_000L)return false;
                if("video/avc".equals(mime)){
                    if(video||f.getInteger(MediaFormat.KEY_WIDTH)>1920||f.getInteger(MediaFormat.KEY_HEIGHT)>1920)return false;video=true;
                }else if(!"audio/mp4a-latm".equals(mime))return false;
            }
            return video;
        }catch(Exception ignored){return false;}finally{extractor.release();source.close();}
    }
}
