package gr.myworkstation.chat;
import android.content.Context;
import android.widget.EditText;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;

/** Permit a user's paste, but never copy/cut a private draft into Android's clipboard. */
final class PrivateEditText extends EditText {
    PrivateEditText(Context context) {
        super(context);
        ActionMode.Callback privateMenu = new ActionMode.Callback() {
            private void restrict(Menu menu) {
                for (int i = menu.size() - 1; i >= 0; i--) {
                    int id = menu.getItem(i).getItemId();
                    if (id != android.R.id.paste && id != android.R.id.pasteAsPlainText && id != android.R.id.selectAll) menu.removeItem(id);
                }
            }
            @Override public boolean onCreateActionMode(ActionMode mode, Menu menu) { restrict(menu); return true; }
            @Override public boolean onPrepareActionMode(ActionMode mode, Menu menu) { restrict(menu); return true; }
            @Override public boolean onActionItemClicked(ActionMode mode, MenuItem item) { return false; }
            @Override public void onDestroyActionMode(ActionMode mode) { }
        };
        setCustomSelectionActionModeCallback(privateMenu); setCustomInsertionActionModeCallback(privateMenu);
    }
    @Override public boolean onTextContextMenuItem(int id) {
        if (id == android.R.id.copy || id == android.R.id.cut || id == android.R.id.shareText) return false;
        return super.onTextContextMenuItem(id);
    }
}
