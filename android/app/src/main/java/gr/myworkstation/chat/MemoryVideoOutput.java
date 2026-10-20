package gr.myworkstation.chat;

import android.annotation.TargetApi;
import android.system.Os;
import java.io.FileDescriptor;

/** Anonymous kernel RAM descriptor, never a pathname, cache file or MediaStore entry. Android 11+. */
@TargetApi(30)
final class MemoryVideoOutput {
    // Linux UAPI constants, also documented in AOSP libartbase/base/memfd.h.
    private static final int MFD_CLOEXEC=1, MFD_ALLOW_SEALING=2, F_ADD_SEALS=1033, F_SEAL_GROW=4, F_SEAL_SEAL=1;
    private FileDescriptor fd;
    MemoryVideoOutput()throws Exception { fd=Os.memfd_create("mw-chat-video",MFD_CLOEXEC|MFD_ALLOW_SEALING); }
    synchronized FileDescriptor descriptor(){if(fd==null)throw new IllegalStateException();return fd;}
    /** Recorder.prepare first installs/clears the output. Then make capacity a kernel-enforced bound. */
    synchronized void sealForRecording()throws Exception{
        Os.ftruncate(descriptor(),VideoData.MAX_BYTES);
        Os.fcntlInt(fd,F_ADD_SEALS,F_SEAL_GROW|F_SEAL_SEAL);
    }
    synchronized byte[] snapshot()throws Exception{
        long size=Os.fstat(descriptor()).st_size;if(size<1||size>VideoData.MAX_BYTES)throw new IllegalStateException();
        byte[] bytes=new byte[(int)size];int offset=0;
        try{while(offset<bytes.length){int n=Os.pread(fd,bytes,offset,bytes.length-offset,offset);if(n<=0)throw new IllegalStateException();offset+=n;}return bytes;}
        catch(Exception error){VideoData.wipe(bytes);throw error;}
    }
    synchronized void clear(){
        FileDescriptor old=fd;fd=null;if(old==null)return;
        try{long size=Math.min(VideoData.MAX_BYTES,Math.max(0,Os.fstat(old).st_size));byte[] zero=new byte[65536];long offset=0;
            while(offset<size){int n=Os.pwrite(old,zero,0,(int)Math.min(zero.length,size-offset),offset);if(n<=0)break;offset+=n;}
            Os.ftruncate(old,0);
        }catch(Exception ignored){}finally{try{Os.close(old);}catch(Exception ignored){}}
    }
}
