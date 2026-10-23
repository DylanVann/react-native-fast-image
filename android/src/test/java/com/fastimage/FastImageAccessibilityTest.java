package com.fastimage;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import android.view.View;

import androidx.core.view.ViewCompat;
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat;

import com.facebook.react.uimanager.ReactAccessibilityDelegate;
import com.facebook.react.uimanager.ViewManagerDelegate;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

// `accessible`, `screenReaderFocusable` and `focusable`, as Fabric sets them
// through the view manager's delegate, each in its own transaction (set()
// ends it): the first two make the image a TalkBack stop, and only
// `focusable` gives it keyboard and D-pad focus.
// `accessible` and `focusable` aren't Codegen props, and React Native's base
// delegate drops them.
@RunWith(RobolectricTestRunner.class)
public class FastImageAccessibilityTest {
    private FastImageViewWithUrl view;
    private FastImageViewManager manager;
    private ViewManagerDelegate<FastImageViewWithUrl> delegate;

    @Before
    public void setUp() {
        view = new FastImageViewWithUrl(RuntimeEnvironment.getApplication(), null);
        manager = new FastImageViewManager();
        delegate = manager.getDelegate();
    }

    private void set(String name, Object value) {
        delegate.setProperty(view, name, value);
        manager.onAfterUpdateTransaction(view);
    }

    @Test
    public void accessibleMakesTheImageAScreenReaderStop() {
        set("accessible", true);
        assertTrue(view.isScreenReaderFocusable());
        // Not a keyboard or D-pad stop.
        assertFalse(view.isFocusable());
        assertEquals(View.FOCUSABLE_AUTO, view.getFocusable());
        set("accessible", null);
        assertFalse(view.isScreenReaderFocusable());
    }

    // Before API 28, which has no screenReaderFocusable: the view's
    // accessibility info says it, and React Native still adds its delegate
    // for a role set after `accessible`.
    @Test
    @Config(sdk = 27)
    public void accessibleMakesTheImageAScreenReaderStopBeforeApi28() {
        set("accessible", true);
        assertTrue(screenReaderFocusable());
        set("role", "button");
        assertSame(ReactAccessibilityDelegate.class, ViewCompat.getAccessibilityDelegate(view).getClass());
        assertTrue(screenReaderFocusable());
        set("accessible", false);
        assertFalse(screenReaderFocusable());
    }

    private boolean screenReaderFocusable() {
        return AccessibilityNodeInfoCompat.wrap(view.createAccessibilityNodeInfo()).isScreenReaderFocusable();
    }

    // Either one keeps it a TalkBack stop: one set false doesn't undo the
    // other.
    @Test
    public void accessibleAndScreenReaderFocusableDontUndoEachOther() {
        set("accessible", true);
        set("screenReaderFocusable", false);
        assertTrue(view.isScreenReaderFocusable());
        set("accessible", false);
        assertFalse(view.isScreenReaderFocusable());
        set("screenReaderFocusable", true);
        set("accessible", false);
        assertTrue(view.isScreenReaderFocusable());
    }

    @Test
    public void focusableMakesTheImageFocusable() {
        set("focusable", true);
        assertTrue(view.isFocusable());
        assertFalse(view.isScreenReaderFocusable());
        // False: not focusable, even if it becomes clickable.
        set("focusable", false);
        view.setClickable(true);
        assertFalse(view.isFocusable());
        view.setClickable(false);
        // Removed: back to Android's default, focusable if clickable.
        set("focusable", null);
        assertEquals(View.FOCUSABLE_AUTO, view.getFocusable());
    }
}
