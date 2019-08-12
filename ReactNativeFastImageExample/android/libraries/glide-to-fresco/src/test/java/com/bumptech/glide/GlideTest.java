package com.bumptech.glide;

import android.app.Application;
import android.content.Context;
import android.graphics.drawable.Drawable;
import android.net.Uri;

import com.facebook.drawee.backends.pipeline.Fresco;

import org.junit.After;
import org.junit.Before;
import org.junit.ClassRule;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TestName;
import org.junit.rules.Timeout;
import org.junit.runner.RunWith;
import org.mockito.Mockito;
import org.powermock.api.mockito.PowerMockito;
import org.powermock.core.classloader.annotations.PowerMockIgnore;
import org.powermock.core.classloader.annotations.PrepareForTest;
import org.powermock.modules.junit4.PowerMockRunner;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNotSame;
import static org.junit.Assert.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.powermock.api.mockito.PowerMockito.verifyStatic;

@RunWith(PowerMockRunner.class)
@PowerMockIgnore({"org.mockito.*"})
@PrepareForTest({Fresco.class, Glide.class, Uri.class})
public class GlideTest {
    /** Cancel test after 5 seconds. */
    @ClassRule
    public static Timeout ruleTimeout = Timeout.seconds(10);
    /** Get test method name. */
    @Rule
    public TestName ruleMethodName = new TestName();
    /** Mocked context. */
    final Context mockContext = mock(Application.class);
    /** Mocked uri instance for string parsing mostly. */
    final Uri mockUri = mock(Uri.class);

    @Before
    public void setUp() throws Exception {
        PowerMockito.mockStatic(Fresco.class);

        System.out.println("setUp   : " + ruleMethodName.getMethodName());
    }

    @After
    public void tearDown() throws Exception {
        System.out.println("tearDown: " + ruleMethodName.getMethodName());

        Mockito.framework().clearInlineMocks();
        Glide.reset();

        System.out.println();
    }

    @Test
    public void singletonInitializationOfFresco() {
        // given
        when(Fresco.hasBeenInitialized()).thenReturn(false);

        // when
        final RequestManager rm = Glide.with(mockContext);

        // then
        verifyStatic(Fresco.class);

        Fresco.hasBeenInitialized();
        Fresco.initialize(any(Context.class));

        assertNotNull("Request Manager instance NOT created", rm);
    }

    @Test
    public void eachGlideWithWeGotNewInstanceOfRequestManager() {
        // given

        // when
        final RequestManager rm1 = Glide.with(mockContext);
        final RequestManager rm2 = Glide.with(mockContext);

        // then
        assertNotSame( "Expected new instance of request manager", rm1, rm2);

        assertNotNull(Glide.getInstance());

        // context.getApplicationContext() == null, no mocked return value
        assertNull("Context is NULL", Glide.getInstance().getApplicationContext());
    }

    @Test
    public void loadImageFromProvidedUriString() throws Exception {
        // given
        PowerMockito.mockStatic(Uri.class);
        PowerMockito.when(Uri.class, "parse", anyString()).thenReturn(mockUri);

        // when
        final RequestBuilder<Drawable> rbd = Glide.with(mockContext)
                .load("file://something");

        // then
        verifyStatic(Uri.class);
        Uri.parse(anyString());

        assertNotNull("Expected request builder instance", rbd);
    }
}
