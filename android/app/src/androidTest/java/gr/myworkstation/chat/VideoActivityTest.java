package gr.myworkstation.chat;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.*;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Real Android metadata, RAM proxy IO and Activity lifecycle; fixture is synthetic, not user media. */
@RunWith(AndroidJUnit4.class)
public class VideoActivityTest {
    static byte[] fixture()throws Exception{try(java.io.InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("video-one-second.mp4")){return ChatApi.bounded(in,VideoData.MAX_BYTES);}}
    private static Object get(VideoActivity a,String name)throws Exception{Field f=VideoActivity.class.getDeclaredField(name);f.setAccessible(true);return f.get(a);}
    private static void invoke(VideoActivity a,String name)throws Exception{Method m=VideoActivity.class.getDeclaredMethod(name);m.setAccessible(true);m.invoke(a);}
    @After public void cleanup(){VideoBuffer.clear();}
    @Test public void platformParsesActualH264AacAndProxyReadsWritesOnlyBoundedRam()throws Exception{
        byte[] bytes=fixture();assertTrue(VideoSource.playable(bytes));RamVideoFile ram=new RamVideoFile();
        android.os.HandlerThread thread=new android.os.HandlerThread("fixture-video");thread.start();
        try(android.os.ParcelFileDescriptor fd=ram.open(InstrumentationRegistry.getInstrumentation().getTargetContext().getSystemService(android.os.storage.StorageManager.class),new android.os.Handler(thread.getLooper()))){
            android.system.Os.pwrite(fd.getFileDescriptor(),bytes,0,bytes.length,0);assertEquals(bytes.length,ram.onGetSize());assertArrayEquals(bytes,ram.snapshot());
            byte[] read=new byte[bytes.length];assertEquals(bytes.length,android.system.Os.pread(fd.getFileDescriptor(),read,0,read.length,0));assertArrayEquals(bytes,read);
            try{ram.onWrite(VideoData.MAX_BYTES,1,new byte[1]);fail("bounded");}catch(android.system.ErrnoException expected){}
        }finally{ram.clear();thread.quitSafely();VideoData.wipe(bytes);}
    }
    @Test public void explicitUseSurvivesDestructionButBackgroundWipesUnsentDraft()throws Exception{
        byte[] bytes=fixture();try(ActivityScenario<VideoActivity> scenario=ActivityScenario.launch(VideoActivity.class)){
            scenario.onActivity(a->{try{assertNull(get(a,"recorder"));assertFalse((Boolean)get(a,"recording"));Field f=VideoActivity.class.getDeclaredField("draft");f.setAccessible(true);f.set(a,bytes);assertNull(VideoBuffer.take());invoke(a,"useVideo");assertTrue(a.isFinishing());}catch(Exception e){throw new AssertionError(e);}});
        }assertSame(bytes,VideoBuffer.take());assertNull(VideoBuffer.take());VideoData.wipe(bytes);
        byte[] pending=fixture();try(ActivityScenario<VideoActivity> scenario=ActivityScenario.launch(VideoActivity.class)){
            scenario.onActivity(a->{try{Field f=VideoActivity.class.getDeclaredField("draft");f.setAccessible(true);f.set(a,pending);}catch(Exception e){throw new AssertionError(e);}});scenario.moveToState(Lifecycle.State.CREATED);for(byte b:pending)assertEquals(0,b);assertNull(VideoBuffer.take());
        }
    }
    @Test public void emulatorCaptureProducesPlayableMp4InRamWithoutLocalVideo()throws Exception{
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        for(String permission:new String[]{android.Manifest.permission.CAMERA,android.Manifest.permission.RECORD_AUDIO}){
            try(java.io.InputStream input=new android.os.ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("pm grant "+context.getPackageName()+" "+permission))){while(input.read()!=-1){}}
        }
        try(ActivityScenario<VideoActivity> scenario=ActivityScenario.launch(VideoActivity.class)){
            Thread.sleep(1500);
            scenario.onActivity(a->{try{invoke(a,"startCapture");}catch(Exception e){throw new AssertionError(e);}});
            boolean[] recording={false};for(int i=0;i<200;i++){scenario.onActivity(a->{try{recording[0]=(Boolean)get(a,"recording");}catch(Exception e){throw new AssertionError(e);}});if(recording[0])break;Thread.sleep(50);}
            scenario.onActivity(a->{try{if(!(Boolean)get(a,"recording"))fail(TextViewStatus(a)+"\n"+recorderLog());}catch(Exception e){throw new AssertionError(e);}});
            Thread.sleep(2200);
            scenario.onActivity(a->{try{Method m=VideoActivity.class.getDeclaredMethod("stopCapture",boolean.class);m.setAccessible(true);m.invoke(a,true);}catch(Exception e){throw new AssertionError(e);}});
            boolean[] ready={false};for(int i=0;i<100;i++){scenario.onActivity(a->{try{ready[0]=get(a,"draft")!=null;}catch(Exception e){throw new AssertionError(e);}});if(ready[0])break;Thread.sleep(50);}
            scenario.onActivity(a->{try{assertTrue(TextViewStatus(a),VideoSource.playable((byte[])get(a,"draft")));assertNull(get(a,"ram"));assertNull(get(a,"recorder"));}catch(Exception e){throw new AssertionError(e);}});
        }
        assertNoVideo(context.getFilesDir());assertNoVideo(context.getCacheDir());
    }
    private static String recorderLog()throws Exception{
        try(java.io.InputStream input=new android.os.ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("logcat -b main -b system -d -v brief -s MediaRecorder:V MediaRecorderJNI:V MPEG4Writer:V CameraSource:V CameraClient:V StagefrightRecorder:V Camera3-Device:V AudioSource:V ACodec:V"))){byte[] bytes=ChatApi.bounded(input,65536);String log=new String(bytes,java.nio.charset.StandardCharsets.UTF_8);return log.substring(Math.max(0,log.length()-6000)).replace("\n"," | ").replace("\r","");}
    }
    private static String TextViewStatus(VideoActivity a)throws Exception{return ((android.widget.TextView)get(a,"status")).getText().toString()+" phase="+get(a,"capturePhase")+" error="+get(a,"captureFailure");}
    private static void assertNoVideo(java.io.File root){java.io.File[] files=root.listFiles();if(files!=null)for(java.io.File file:files){if(file.isDirectory())assertNoVideo(file);else assertFalse(file.getName(),file.getName().endsWith(".mp4"));}}
    @Test public void deniedPermissionNeverStartsCameraOrMicrophone()throws Exception{
        try(ActivityScenario<VideoActivity> scenario=ActivityScenario.launch(VideoActivity.class)){
            scenario.onActivity(a->{try{a.onRequestPermissionsResult(61,new String[]{android.Manifest.permission.CAMERA,android.Manifest.permission.RECORD_AUDIO},new int[]{-1,-1});assertNull(get(a,"recorder"));assertNull(get(a,"camera"));assertNull(get(a,"ram"));}catch(Exception e){throw new AssertionError(e);}});
        }
    }
}
