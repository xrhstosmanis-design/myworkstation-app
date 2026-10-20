package gr.myworkstation.chat;

import android.os.Handler;
import android.os.ParcelFileDescriptor;
import android.os.ProxyFileDescriptorCallback;
import android.os.storage.StorageManager;
import android.system.ErrnoException;
import android.system.OsConstants;
import java.util.Arrays;

/** Seekable recorder output backed ONLY by bounded heap memory, never a disk pathname. */
final class RamVideoFile extends ProxyFileDescriptorCallback {
    private byte[] bytes=new byte[VideoData.MAX_BYTES];
    private int length;
    ParcelFileDescriptor open(StorageManager manager,Handler handler)throws Exception{return manager.openProxyFileDescriptor(ParcelFileDescriptor.MODE_READ_WRITE,this,handler);}
    @Override public synchronized long onGetSize(){return length;}
    @Override public synchronized int onRead(long offset,int size,byte[] data)throws ErrnoException{
        if(bytes==null||offset<0)throw new ErrnoException("video",OsConstants.EBADF);
        if(offset>=length)return 0;int count=Math.min(size,length-(int)offset);System.arraycopy(bytes,(int)offset,data,0,count);return count;
    }
    @Override public synchronized int onWrite(long offset,int size,byte[] data)throws ErrnoException{
        if(bytes==null||offset<0||size<0||offset>bytes.length-size)throw new ErrnoException("video",OsConstants.ENOSPC);
        System.arraycopy(data,0,bytes,(int)offset,size);length=Math.max(length,(int)offset+size);return size;
    }
    @Override public void onFsync(){}
    @Override public void onRelease(){} // Recorder duplicates its descriptor; owner clears after recorder.release().
    synchronized byte[] snapshot(){return bytes==null?null:Arrays.copyOf(bytes,length);}
    synchronized void clear(){VideoData.wipe(bytes);bytes=null;length=0;}
}
