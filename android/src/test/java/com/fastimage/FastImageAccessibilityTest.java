package com.fastimage;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.view.View;

import com.facebook.react.uimanager.ViewManagerDelegate;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;

// `accessible`, `screenReaderFocusable` and `focusable`, as Fabric sets them
// through the view manager's delegate: the first two make the image a
// TalkBack stop, and only `focusable` gives it keyboard and D-pad focus.
// `accessible` and `focusable` aren't Codegen props, and React Native's base
// delegate drops them.
@RunWith(RobolectricTestRunner.class)
public class FastImageAccessibilityTest {
    private FastImageViewWithUrl view;
    private ViewManagerDelegate<FastImageViewWithUrl> delegate;

    @Before
    public void setUp() {
        view = new FastImageViewWithUrl(RuntimeEnvironment.getApplication(), null);
        delegate = new FastImageViewManager().getDelegate();
    }

    @Test
    public void accessibleMakesTheImageAScreenReaderStop() {
        delegate.setProperty(view, "accessible", true);
        assertTrue(view.isScreenReaderFocusable());
        // Not a keyboard or D-pad stop.
        assertFalse(view.isFocusable());
        assertEquals(View.FOCUSABLE_AUTO, view.getFocusable());
        delegate.setProperty(view, "accessible", null);
        assertFalse(view.isScreenReaderFocusable());
    }

    // Either one keeps it a TalkBack stop: one set false doesn't undo the
    // other.
    @Test
    public void accessibleAndScreenReaderFocusableDontUndoEachOther() {
        delegate.setProperty(view, "accessible", true);
        delegate.setProperty(view, "screenReaderFocusable", false);
        assertTrue(view.isScreenReaderFocusable());
        delegate.setProperty(view, "accessible", false);
        assertFalse(view.isScreenReaderFocusable());
        delegate.setProperty(view, "screenReaderFocusable", true);
        delegate.setProperty(view, "accessible", false);
        assertTrue(view.isScreenReaderFocusable());
    }

    @Test
    public void focusableMakesTheImageFocusable() {
        delegate.setProperty(view, "focusable", true);
        assertTrue(view.isFocusable());
        assertFalse(view.isScreenReaderFocusable());
        // False: not focusable, even if it becomes clickable.
        delegate.setProperty(view, "focusable", false);
        view.setClickable(true);
        assertFalse(view.isFocusable());
        view.setClickable(false);
        // Removed: back to Android's default, focusable if clickable.
        delegate.setProperty(view, "focusable", null);
        assertEquals(View.FOCUSABLE_AUTO, view.getFocusable());
    }
}
