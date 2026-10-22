package com.fastimage;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.facebook.react.uimanager.ViewManagerDelegate;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;

// `accessible` and `focusable`, as Fabric sets them through the view manager's
// delegate: the image takes focus (TalkBack's as its own element, and the
// keyboard's or D-pad's) while either is true, as React Native's Image does
// for `accessible` and View for `focusable`. They aren't Codegen props, and
// React Native's base delegate drops them.
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
    public void accessibleMakesTheImageFocusable() {
        delegate.setProperty(view, "accessible", true);
        assertTrue(view.isFocusable());
        // Removed: null.
        delegate.setProperty(view, "accessible", null);
        assertFalse(view.isFocusable());
    }

    @Test
    public void focusableMakesTheImageFocusable() {
        delegate.setProperty(view, "focusable", true);
        assertTrue(view.isFocusable());
        delegate.setProperty(view, "focusable", false);
        assertFalse(view.isFocusable());
    }

    // Either one keeps it focusable: focusable false doesn't take away the
    // focus `accessible` gives (as React Native's View leaves it for
    // accessibility).
    @Test
    public void eitherKeepsTheImageFocusable() {
        delegate.setProperty(view, "accessible", true);
        delegate.setProperty(view, "focusable", false);
        assertTrue(view.isFocusable());
        delegate.setProperty(view, "accessible", false);
        assertFalse(view.isFocusable());
    }
}
