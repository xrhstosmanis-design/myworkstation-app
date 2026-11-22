package gr.myworkstation.chat;

import android.content.Context;
import android.graphics.Matrix;
import android.graphics.RectF;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.widget.ImageView;

/** RAM-only photo surface. Fit first, bounded pinch/pan, double tap to zoom/reset. */
public final class ZoomPhotoView extends ImageView {
    private final Matrix transform = new Matrix();
    private final ScaleGestureDetector pinch;
    private final GestureDetector gestures;
    private float zoom = 1f, left, top, fit;
    private boolean scaled;
    public ZoomPhotoView(Context context) {
        super(context); setScaleType(ScaleType.MATRIX); setBackgroundColor(0xff111111);
        setContentDescription("Φωτογραφία · δύο δάχτυλα για ζουμ, διπλό πάτημα για μεγέθυνση ή επαναφορά");
        pinch = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector detector) { scaled = true; scaleTo(zoom * detector.getScaleFactor(), detector.getFocusX(), detector.getFocusY()); return true; }
        });
        gestures = new GestureDetector(context, new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(MotionEvent e) { return true; }
            @Override public boolean onSingleTapConfirmed(MotionEvent e) { return performClick(); }
            @Override public boolean onDoubleTap(MotionEvent e) { if (zoom > 1.01f) resetZoom(); else scaleTo(3f,e.getX(),e.getY()); return true; }
            @Override public boolean onScroll(MotionEvent first, MotionEvent current, float dx, float dy) { if (!pinch.isInProgress() && zoom > 1f && !scaled) { left -= dx; top -= dy; apply(); } return true; }
        });
    }
    @Override protected void onSizeChanged(int w,int h,int oldw,int oldh) { super.onSizeChanged(w,h,oldw,oldh); resetZoom(); }
    public void resetZoom() {
        if (getDrawable()==null || getWidth()<=0 || getHeight()<=0) return;
        fit = Math.min((float)getWidth()/getDrawable().getIntrinsicWidth(), (float)getHeight()/getDrawable().getIntrinsicHeight());
        zoom=1f;left=(getWidth()-getDrawable().getIntrinsicWidth()*fit)/2f;top=(getHeight()-getDrawable().getIntrinsicHeight()*fit)/2f;apply();
    }
    public void zoomIn() { scaleTo(zoom*1.5f,getWidth()/2f,getHeight()/2f); }
    public void zoomOut() { scaleTo(zoom/1.5f,getWidth()/2f,getHeight()/2f); }
    private void scaleTo(float next,float x,float y) {
        if (getDrawable()==null || fit<=0) return;
        next=Math.max(1f,Math.min(6f,next));float ratio=next/zoom;left=x-(x-left)*ratio;top=y-(y-top)*ratio;zoom=next;apply();
    }
    private void apply() {
        if (getDrawable()==null) return;
        float width=getDrawable().getIntrinsicWidth()*fit*zoom,height=getDrawable().getIntrinsicHeight()*fit*zoom;
        left=width<=getWidth()?(getWidth()-width)/2f:Math.max(getWidth()-width,Math.min(0,left));
        top=height<=getHeight()?(getHeight()-height)/2f:Math.max(getHeight()-height,Math.min(0,top));
        transform.setScale(fit*zoom,fit*zoom);transform.postTranslate(left,top);setImageMatrix(transform);
    }
    RectF displayedBounds() { RectF r=new RectF(0,0,getDrawable().getIntrinsicWidth(),getDrawable().getIntrinsicHeight());getImageMatrix().mapRect(r);return r; }
    @Override public boolean onTouchEvent(MotionEvent event) {
        if (event.getActionMasked()==MotionEvent.ACTION_DOWN) scaled=false;
        if (getParent()!=null) getParent().requestDisallowInterceptTouchEvent(true);
        pinch.onTouchEvent(event);gestures.onTouchEvent(event);return true;
    }
    @Override public boolean performClick() { super.performClick(); return true; }
}
