package gr.myworkstation.chat;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.Camera;
import android.media.MediaRecorder;
import android.os.*;
import android.os.storage.StorageManager;
import android.view.*;
import android.widget.*;
import java.io.InputStream;
import java.util.concurrent.*;

/** Explicit foreground capture/gallery, RAM preview, then one-use handoff. Never creates a local video. */
@SuppressWarnings("deprecation")
public final class VideoActivity extends Activity implements SurfaceHolder.Callback {
    private final Handler ui=new Handler(Looper.getMainLooper());
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final RequestEpoch epoch=new RequestEpoch();
    private final VideoPlayer player=new VideoPlayer();
    private HandlerThread io;
    private Camera camera;
    private MediaRecorder recorder;
    private RamVideoFile ram;
    private ParcelFileDescriptor fd;
    private SurfaceView surface;
    private byte[] draft;
    private boolean active,recording,returning,loading;
    private String capturePhase="idle", captureFailure="";
    private long started,permissionEpoch;
    private TextView status;
    private Button capture,stop,gallery,play,use;
    private final Runnable tick=new Runnable(){public void run(){if(active&&recording){status.setText("Εγγραφή · "+(SystemClock.elapsedRealtime()-started)/1000+" / 30 δευτ.");ui.postDelayed(this,300);}}};
    @Override public void onCreate(Bundle state){
        super.onCreate(null);getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if(Build.VERSION.SDK_INT>=33)setRecentsScreenshotEnabled(false);
        VideoBuffer.clear();io=new HandlerThread("video-ram-io");io.start();
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(16,32,16,16);
        status=new TextView(this);status.setText("Βίντεο MP4 έως 30 δευτ. / 12 MB · προσωρινά στη μνήμη");box.addView(status);
        surface=new SurfaceView(this);surface.getHolder().addCallback(this);box.addView(surface,new LinearLayout.LayoutParams(-1,0,1));
        capture=button("Λήψη από κάμερα",this::requestCapture);box.addView(capture);
        stop=button("Διακοπή λήψης",()->stopCapture(true));box.addView(stop);
        gallery=button("Επιλογή υπάρχοντος MP4",this::choose);box.addView(gallery);
        play=button("▶ Προεπισκόπηση",()->{if(!player.play(draft,surface.getHolder().getSurface()))status.setText("Δεν άνοιξε το βίντεο.");});box.addView(play);
        use=button("Χρήση βίντεο",this::useVideo);box.addView(use);box.addView(button("Ακύρωση",this::finish));setContentView(box);controls();
    }
    private Button button(String text,Runnable action){Button b=new Button(this);b.setText(text);b.setMinHeight(58);b.setOnClickListener(v->action.run());return b;}
    @Override protected void onResume(){super.onResume();active=true;controls();}
    @Override protected void onStop(){active=false;epoch.invalidate();loading=false;stopCapture(false);player.stop();clearDraft();ui.removeCallbacks(tick);if(!returning)VideoBuffer.clear();status.setText("Βίντεο");super.onStop();}
    @Override protected void onDestroy(){stopCapture(false);player.stop();clearDraft();if(!returning)VideoBuffer.clear();worker.shutdownNow();io.quitSafely();super.onDestroy();}
    @Override protected void onSaveInstanceState(Bundle state){}
    private void controls(){if(capture==null)return;boolean idle=active&&!loading&&!returning&&!recording;capture.setEnabled(idle);gallery.setEnabled(idle);stop.setEnabled(active&&recording);play.setEnabled(idle&&draft!=null);use.setEnabled(idle&&draft!=null);}
    private void requestCapture(){
        if(!active||recording||loading||returning)return;
        if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){permissionEpoch=epoch.capture();requestPermissions(new String[]{Manifest.permission.CAMERA,Manifest.permission.RECORD_AUDIO},61);return;}
        startCapture();
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){super.onRequestPermissionsResult(code,permissions,results);if(code!=61||!active||!epoch.current(permissionEpoch))return;if(results.length==2&&results[0]==PackageManager.PERMISSION_GRANTED&&results[1]==PackageManager.PERMISSION_GRANTED)startCapture();else status.setText("Η κάμερα/το μικρόφωνο δεν επιτράπηκε. Μπορείς να επιλέξεις υπάρχον MP4.");}
    @SuppressWarnings("MissingPermission")
    private void startCapture(){
        if(!active||recording||loading||returning||!surface.getHolder().getSurface().isValid())return;
        player.stop();clearDraft();
        try{
            capturePhase="camera-open";captureFailure="";int cameraId=-1;Camera.CameraInfo info=new Camera.CameraInfo();
            for(int i=0;i<Camera.getNumberOfCameras();i++){Camera.getCameraInfo(i,info);if(info.facing==Camera.CameraInfo.CAMERA_FACING_BACK){cameraId=i;break;}}
            if(cameraId<0)throw new IllegalStateException();camera=Camera.open(cameraId);Camera.Parameters params=camera.getParameters();
            java.util.List<Camera.Size> sizes=params.getSupportedVideoSizes();if(sizes==null)sizes=params.getSupportedPreviewSizes();
            Camera.Size selected=null;for(Camera.Size s:sizes)if(s.width<=640&&s.height<=480&&(selected==null||s.width*s.height>selected.width*selected.height))selected=s;
            if(selected==null)throw new IllegalStateException();
            capturePhase="camera-preview";params.setPreviewSize(selected.width,selected.height);camera.setParameters(params);
            int rotation=getWindowManager().getDefaultDisplay().getRotation()*90;int orientation=(info.orientation-rotation+360)%360;
            camera.setDisplayOrientation(orientation);camera.setPreviewDisplay(surface.getHolder());camera.startPreview();camera.unlock();
            capturePhase="ram-descriptor";ram=new RamVideoFile();fd=ram.open(getSystemService(StorageManager.class),new Handler(io.getLooper()));
            capturePhase="recorder-config";recorder=new MediaRecorder();recorder.setCamera(camera);recorder.setAudioSource(MediaRecorder.AudioSource.CAMCORDER);recorder.setVideoSource(MediaRecorder.VideoSource.CAMERA);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setVideoSize(selected.width,selected.height);recorder.setVideoFrameRate(24);recorder.setVideoEncodingBitRate(900000);recorder.setAudioEncodingBitRate(64000);recorder.setAudioSamplingRate(44100);
            recorder.setOrientationHint(orientation);recorder.setMaxDuration(29000);recorder.setMaxFileSize(VideoData.MAX_BYTES-262144);recorder.setOutputFile(fd.getFileDescriptor());recorder.setPreviewDisplay(surface.getHolder().getSurface());
            recorder.setOnInfoListener((r,what,extra)->{if(what==MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED||what==MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED)stopCapture(true);});
            recorder.setOnErrorListener((r,what,extra)->{stopCapture(false);status.setText("Η λήψη δεν ολοκληρώθηκε. Δεν αποθηκεύτηκε τοπικό αρχείο.");});
            capturePhase="recorder-prepare";recorder.prepare();capturePhase="recorder-start";recorder.start();capturePhase="recording";recording=true;started=SystemClock.elapsedRealtime();controls();ui.post(tick);
        }catch(Exception error){captureFailure=error.getClass().getSimpleName();stopCapture(false);status.setText("Δεν ξεκίνησε η λήψη στη μνήμη. Έλεγξε κάμερα/μικρόφωνο ή επίλεξε MP4.");}
    }
    private void stopCapture(boolean keep){
        boolean wasRecording=recording;recording=false;ui.removeCallbacks(tick);boolean success=false;
        if(recorder!=null){if(wasRecording)try{recorder.stop();success=true;}catch(Exception ignored){}recorder.reset();recorder.release();recorder=null;}
        if(camera!=null){try{camera.release();}catch(Exception ignored){}camera=null;}
        if(fd!=null){try{fd.close();}catch(Exception ignored){}fd=null;}
        byte[] bytes=keep&&success&&active&&ram!=null?ram.snapshot():null;if(ram!=null){ram.clear();ram=null;}
        if(bytes!=null)validate(bytes);else controls();
    }
    private void choose(){if(!active||recording||loading||returning)return;player.stop();clearDraft();Intent intent=new Intent(Intent.ACTION_GET_CONTENT).setType("video/mp4").addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(Intent.createChooser(intent,"Επιλογή βίντεο MP4"),62);}
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);if(request!=62||result!=RESULT_OK||data==null||data.getData()==null)return;
        android.net.Uri uri=data.getData();if(!"content".equals(uri.getScheme()))return;
        // onActivityResult precedes onResume. Queue the bounded read after foreground resume.
        ui.post(()->{if(!active||returning||loading)return;loading=true;controls();final long generation=epoch.capture();worker.execute(()->{
            byte[] bytes=null;try(InputStream input=getContentResolver().openInputStream(uri)){bytes=ChatApi.bounded(input,VideoData.MAX_BYTES);}catch(Exception ignored){}
            final byte[] value=bytes;ui.post(()->{if(!active||!epoch.current(generation)){VideoData.wipe(value);return;}loading=false;validate(value);});
        });});
    }
    private void validate(byte[] bytes){
        loading=true;controls();final long generation=epoch.capture();worker.execute(()->{
            boolean valid=VideoSource.playable(bytes);ui.post(()->{if(!active||!epoch.current(generation)||returning){VideoData.wipe(bytes);return;}loading=false;clearDraft();if(valid){draft=bytes;status.setText("Έτοιμο · έλεγξε την προεπισκόπηση και πάτησε Χρήση βίντεο.");}else{VideoData.wipe(bytes);status.setText("Επιτρέπεται MP4 H.264/AAC έως 30 δευτ. / 12 MB. Το βίντεο δεν στάλθηκε.");}controls();});
        });
    }
    private void useVideo(){if(!active||loading||recording||returning||!VideoData.valid(draft))return;player.stop();byte[] value=draft;draft=null;VideoBuffer.put(value);returning=true;epoch.invalidate();setResult(RESULT_OK);finish();}
    private void clearDraft(){VideoData.wipe(draft);draft=null;}
    @Override public void surfaceCreated(SurfaceHolder holder){}
    @Override public void surfaceChanged(SurfaceHolder holder,int format,int width,int height){}
    @Override public void surfaceDestroyed(SurfaceHolder holder){stopCapture(false);player.stop();}
}
