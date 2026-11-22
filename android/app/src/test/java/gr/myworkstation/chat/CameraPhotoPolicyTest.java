package gr.myworkstation.chat;
import org.junit.Test;
import static org.junit.Assert.*;

public class CameraPhotoPolicyTest {
    @Test public void choosesDetailedBoundedPhotoInEitherOrientation() {
        assertEquals(1, CameraPhotoPolicy.select(new int[][]{{1280,960},{3264,2448},{4000,3000}}));
        assertEquals(1, CameraPhotoPolicy.select(new int[][]{{960,1280},{2448,3264},{3000,4000}}));
    }
    @Test public void fallbackIsSmallestRatherThanUnboundedLastEntry() {
        assertEquals(1, CameraPhotoPolicy.select(new int[][]{{8000,6000},{4000,3000},{9000,8000}}));
    }
    @Test public void invalidDimensionsCannotWin() {
        assertEquals(1, CameraPhotoPolicy.select(new int[][]{{-1,1},{640,480},{Integer.MAX_VALUE,Integer.MAX_VALUE}}));
    }
    @Test(expected=IllegalArgumentException.class) public void refusesMissingSizes() { CameraPhotoPolicy.select(new int[0][]); }
}
