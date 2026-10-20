package gr.myworkstation.chat;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.camera2.*;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.util.Size;
import android.util.Range;
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
    private CameraDevice camera;
    private CameraCaptureSession cameraSession;
    private Surface recorderSurface;
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
        player.stop();clearDraft();loading=true;controls();final long generation=epoch.capture();
        try{
            capturePhase="camera-capabilities";captureFailure="";
            CameraManager manager=getSystemService(CameraManager.class);String chosen=null;CameraCharacteristics info=null;
            for(String id:manager.getCameraIdList()){CameraCharacteristics value=manager.getCameraCharacteristics(id);if(Integer.valueOf(CameraCharacteristics.LENS_FACING_BACK).equals(value.get(CameraCharacteristics.LENS_FACING))){chosen=id;info=value;break;}}
            if(chosen==null||info==null)throw new IllegalStateException();
            StreamConfigurationMap map=info.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);if(map==null)throw new IllegalStateException();
            Size[] videoSizes=map.getOutputSizes(MediaRecorder.class),previewSizes=map.getOutputSizes(SurfaceHolder.class);Size selected=null;
            if(videoSizes==null||previewSizes==null)throw new IllegalStateException();
            for(Size size:videoSizes)if(size.getWidth()<=640&&size.getHeight()<=480&&java.util.Arrays.asList(previewSizes).contains(size)&&(selected==null||size.getWidth()*size.getHeight()>selected.getWidth()*selected.getHeight()))selected=size;
            if(selected==null)throw new IllegalStateException();
            Range<Integer>[] rates=info.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES);Range<Integer> rate=null;
            if(rates!=null)for(Range<Integer> value:rates)if(value.getLower()>0&&value.getUpper()<=30&&(rate==null||value.getUpper()>rate.getUpper()||(value.getUpper().equals(rate.getUpper())&&value.getLower()>rate.getLower())))rate=value;
            if(rate==null)throw new IllegalStateException();final Range<Integer> frameRate=rate;
            Integer sensor=info.get(CameraCharacteristics.SENSOR_ORIENTATION);int rotation=getWindowManager().getDefaultDisplay().getRotation()*90,orientation=((sensor==null?90:sensor)-rotation+360)%360;
            surface.getHolder().setFixedSize(selected.getWidth(),selected.getHeight());
            capturePhase="ram-descriptor";ram=new RamVideoFile();fd=ram.open(getSystemService(StorageManager.class),new Handler(io.getLooper()));
            capturePhase="recorder-config";recorder=new MediaRecorder();recorder.setAudioSource(MediaRecorder.AudioSource.CAMCORDER);recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setVideoSize(selected.getWidth(),selected.getHeight());recorder.setVideoFrameRate(rate.getUpper());recorder.setVideoEncodingBitRate(900000);recorder.setAudioEncodingBitRate(64000);recorder.setAudioSamplingRate(44100);recorder.setAudioChannels(1);
            recorder.setOrientationHint(orientation);recorder.setMaxDuration(29000);recorder.setMaxFileSize(VideoData.MAX_BYTES-262144);recorder.setOutputFile(fd.getFileDescriptor());
            recorder.setOnInfoListener((r,what,extra)->{if(what==MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED||what==MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED)stopCapture(true);});
            recorder.setOnErrorListener((r,what,extra)->{if(recorder!=r)return;captureFailure="recorder-error-"+what;stopCapture(false);status.setText("Η λήψη δεν ολοκληρώθηκε. Δεν αποθηκεύτηκε τοπικό αρχείο.");});
            capturePhase="recorder-prepare";recorder.prepare();recorderSurface=recorder.getSurface();capturePhase="camera-open";
            manager.openCamera(chosen,new CameraDevice.StateCallback(){
                @Override public void onOpened(CameraDevice value){
                    if(!active||!epoch.current(generation)||recorder==null){value.close();return;}camera=value;
                    try{
                        capturePhase="camera-session";Surface preview=surface.getHolder().getSurface();
                        CaptureRequest.Builder request=value.createCaptureRequest(CameraDevice.TEMPLATE_RECORD);request.addTarget(preview);request.addTarget(recorderSurface);request.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,frameRate);
                        value.createCaptureSession(java.util.Arrays.asList(preview,recorderSurface),new CameraCaptureSession.StateCallback(){
                            @Override public void onConfigured(CameraCaptureSession session){
                                if(!active||!epoch.current(generation)||recorder==null||camera!=value){session.close();return;}cameraSession=session;
                                try{capturePhase="camera-repeating";session.setRepeatingRequest(request.build(),null,ui);capturePhase="recorder-start";recorder.start();capturePhase="recording";loading=false;recording=true;started=SystemClock.elapsedRealtime();controls();ui.post(tick);}catch(Exception error){captureFailed(error);}
                            }
                            @Override public void onConfigureFailed(CameraCaptureSession session){session.close();if(epoch.current(generation))captureFailed(new IllegalStateException());}
                        },ui);
                    }catch(Exception error){captureFailed(error);}
                }
                @Override public void onDisconnected(CameraDevice value){value.close();if(epoch.current(generation))captureFailed(new IllegalStateException());}
                @Override public void onError(CameraDevice value,int error){value.close();if(epoch.current(generation))captureFailed(new IllegalStateException());}
            },ui);
        }catch(Exception error){captureFailed(error);}
    }
    private void captureFailed(Exception error){captureFailure=error.getClass().getSimpleName()+"@"+(error.getStackTrace().length==0?"unknown":error.getStackTrace()[0].getMethodName());stopCapture(false);status.setText("Δεν ξεκίνησε η λήψη στη μνήμη. Έλεγξε κάμερα/μικρόφωνο ή επίλεξε MP4.");}
    private void stopCapture(boolean keep){
        epoch.invalidate();boolean wasRecording=recording;recording=false;loading=false;ui.removeCallbacks(tick);boolean success=false;
        if(cameraSession!=null){try{cameraSession.stopRepeating();}catch(Exception ignored){}cameraSession.close();cameraSession=null;}
        if(recorder!=null){if(wasRecording)try{recorder.stop();success=true;}catch(Exception ignored){}recorder.reset();recorder.release();recorder=null;}
        if(camera!=null){try{camera.close();}catch(Exception ignored){}camera=null;}
        if(recorderSurface!=null){recorderSurface.release();recorderSurface=null;}
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
