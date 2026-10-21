package gr.myworkstation.chat;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.util.DisplayMetrics;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Synthetic conversation only: no media, production transport, read receipt or send. */
@RunWith(AndroidJUnit4.class)
public class ConversationAppearanceTest {
    private static Object get(MainActivity a,String key)throws Exception{Field f=MainActivity.class.getDeclaredField(key);f.setAccessible(true);return f.get(a);}
    private static void set(MainActivity a,String key,Object value)throws Exception{Field f=MainActivity.class.getDeclaredField(key);f.setAccessible(true);f.set(a,value);}
    private static void call(MainActivity a,String key)throws Exception{Method m=MainActivity.class.getDeclaredMethod(key);m.setAccessible(true);m.invoke(a);}
    private static JSONObject store()throws Exception{return new JSONObject().put("id","appearance-fixture").put("companyId","fixture-company").put("name","ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ");}
    private static final class Api extends ChatApi {
        @Override JSONObject json(String path,String method,JSONObject body,String token)throws Exception{
            assertEquals("GET",method);assertTrue(path.startsWith("/api/store-chat/stores/appearance-fixture/messages"));
            JSONArray rows=new JSONArray();
            for(int i=0;i<2;i++)rows.put(new JSONObject().put("id","appearance-message-"+i).put("senderId","fixture-owner").put("senderName","Δοκιμή εμφάνισης").put("createdAt","2026-10-22T09:00:00Z").put("body","").put("hasAttachment",true).put("attachmentMimeType",i==0?"audio/wav":"video/mp4").put("readByMe",true));
            return new JSONObject().put("store",store()).put("rows",rows).put("voiceMessagesAvailable",true).put("videoMessagesAvailable",true).put("settings",new JSONObject().put("photosEnabled",true));
        }
    }
    @SuppressWarnings("deprecation")
    @Test public void compactControlsRemainReadableAtPhoneWidthAndLargeFont()throws Exception{
        Context context=ApplicationProvider.getApplicationContext();new TokenVault(context).clear();TokenVault.pendingTwoFactor(context).clear();
        Configuration original=new Configuration(context.getResources().getConfiguration());DisplayMetrics originalMetrics=new DisplayMetrics();originalMetrics.setTo(context.getResources().getDisplayMetrics());
        try{
            for(float scale:new float[]{1f,1.3f}){
                try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
                    scenario.onActivity(a->{try{
                        Configuration config=new Configuration(original);config.fontScale=scale;DisplayMetrics metrics=new DisplayMetrics();metrics.setTo(originalMetrics);metrics.scaledDensity=metrics.density*scale;a.getResources().updateConfiguration(config,metrics);
                        set(a,"api",new Api());set(a,"token","appearance-fixture-token");set(a,"selected",store());set(a,"identity",new JSONObject().put("id","fixture-owner").put("role","OWNER").put("tokenType","BACKOFFICE_USER"));call(a,"conversation");
                    }catch(Exception e){throw new AssertionError(e);}});
                    boolean ready=false;for(int n=0;n<100;n++){boolean[] idle={false};scenario.onActivity(a->{try{idle[0]=!(Boolean)get(a,"busy");}catch(Exception e){throw new AssertionError(e);}});if(idle[0]){ready=true;break;}Thread.sleep(50);}assertTrue(ready);
                    Bitmap[] proof={null};
                    scenario.onActivity(a->{try{
                        View root=(View)get(a,"root");float density=a.getResources().getDisplayMetrics().density;
                        for(int width:new int[]{320,360}){
                            int w=Math.round(width*density),h=Math.round(720*density);root.measure(View.MeasureSpec.makeMeasureSpec(w,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(h,View.MeasureSpec.EXACTLY));root.layout(0,0,w,h);
                            LinearLayout tools=root.findViewWithTag("chat-tools");assertEquals(3,tools.getChildCount());assertTrue(tools.getHeight()<=Math.round(100*density));
                            for(int i=0;i<3;i++){Button b=(Button)tools.getChildAt(i);assertTrue(b.getWidth()>=Math.round(48*density));assertTrue(b.getHeight()>=Math.round(48*density));assertNotNull(b.getLayout());assertTrue("Clipped action caption",b.getLayout().getHeight()<=b.getHeight()-b.getCompoundPaddingTop()-b.getCompoundPaddingBottom());}
                            assertTrue("Messages lose too much phone height",((View)get(a,"scroll")).getHeight()>=Math.round(280*density));
                            for(String label:new String[]{"attachmentLabel","voiceLabel","videoLabel","notice"})assertEquals(label,View.GONE,((View)get(a,label)).getVisibility());
                        }
                        Method status=MainActivity.class.getDeclaredMethod("status",String.class);status.setAccessible(true);status.invoke(a,"Δοκιμαστική ενημέρωση");assertEquals(View.VISIBLE,((TextView)get(a,"notice")).getVisibility());status.invoke(a,"");assertEquals(View.GONE,((View)get(a,"notice")).getVisibility());
                        set(a,"voiceDraft",VoiceData.fromPcm(new short[]{1,2},2));call(a,"updateVoiceLabel");assertEquals(View.VISIBLE,((View)get(a,"voiceLabel")).getVisibility());call(a,"clearVoice");call(a,"updateVoiceLabel");assertEquals(View.GONE,((View)get(a,"voiceLabel")).getVisibility());
                        int w=Math.round(360*density),h=Math.round(720*density);root.measure(View.MeasureSpec.makeMeasureSpec(w,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(h,View.MeasureSpec.EXACTLY));root.layout(0,0,w,h);
                        // Paint the actual synthetic View tree, keeping FLAG_SECURE unchanged.
                        proof[0]=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);root.draw(new android.graphics.Canvas(proof[0]));
                    }catch(Exception e){throw new AssertionError(e);}});
                    Bitmap bitmap=proof[0];assertNotNull(bitmap);
                    File dir=new File(context.getExternalMediaDirs()[0],"ui-proof");assertTrue(dir.isDirectory()||dir.mkdirs());try(FileOutputStream out=new FileOutputStream(new File(dir,scale==1f?"conversation-normal.png":"conversation-large-font.png"))){assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG,100,out));}finally{bitmap.recycle();}
                }
            }
        }finally{context.getResources().updateConfiguration(original,originalMetrics);new TokenVault(context).clear();TokenVault.pendingTwoFactor(context).clear();VoiceBuffer.clear();VideoBuffer.clear();}
    }
}
