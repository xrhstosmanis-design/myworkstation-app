package gr.myworkstation.chat;

import android.media.MediaPlayer;
import android.view.Surface;

final class VideoPlayer {
    private MediaPlayer player;
    private VideoSource source;
    boolean play(byte[] bytes,Surface surface){
        stop();if(!VideoData.valid(bytes)||surface==null||!surface.isValid())return false;
        try{
            source=new VideoSource(bytes);MediaPlayer next=new MediaPlayer();player=next;
            next.setDataSource(source);next.setSurface(surface);next.setOnPreparedListener(p->{if(player==p)p.start();});
            next.setOnErrorListener((p,what,extra)->{stop();return true;});next.prepareAsync();return true;
        }catch(Exception ignored){stop();return false;}
    }
    void stop(){MediaPlayer old=player;player=null;if(old!=null){try{old.stop();}catch(Exception ignored){}old.release();}if(source!=null){source.close();source=null;}}
}
