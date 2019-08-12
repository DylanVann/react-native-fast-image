package com.bumptech.glide;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.drawee.backends.pipeline.Fresco;

import java.lang.ref.WeakReference;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * @see <a href="https://github.com/bumptech/glide/blob/master/library/src/main/java/com/bumptech/glide/Glide.java">Original</a>
 */
public class Glide {

    /** Guard of static variables. */
    private static final Object _sync = new Object();
    /** Is fresco library initialized or not. */
    private static final AtomicBoolean _isInitialized = new AtomicBoolean();
    /** Singleton instance. */
    private static volatile Glide _instance;
    /** Application context. */
    private static volatile WeakReference<Context> _context = new WeakReference<>(null);

    /** Get reference on instance of Glide facade. */
    @Nullable
    /* package */ static Glide getInstance() {
        return _instance;
    }

    /** Reset library state. Used only for unit testing. */
    @SuppressWarnings("unused")
    /* package */ static void reset() {
        synchronized (_sync) {
            _context = new WeakReference<>(null);
            _instance = null;
            _isInitialized.set(false);
        }
    }

    /** Get application context. */
    @Nullable
    @SuppressWarnings("unused")
    /* package */ Context getApplicationContext() {
        synchronized (_sync) {
            return _context.get();
        }
    }

    /**
     * Begin a load with Glide by passing in a context.
     *
     * <p>Any requests started using a context will only have the application level options applied
     * and will not be started or stopped based on lifecycle events. In general, loads should be
     * started at the level the result will be used in.
     *
     * <p>This method is appropriate for resources that will be used outside of the normal fragment or
     * activity lifecycle (For example in services, or for notification thumbnails).
     *
     * @param context Any context, will not be retained.
     * @return A RequestManager for the top level application that can be used to start a load.
     */
    @NonNull
    public static RequestManager with(@NonNull final Context context) {
        if (!_isInitialized.getAndSet(true)) {
            // we sharing Fresco library with ReactNative library, so Fresco can be initialized already
            if (!Fresco.hasBeenInitialized()) {
                Fresco.initialize(context);
            }
        }

        if (null == _instance) {
            synchronized (_sync) {
                if (null == _instance) {
                    _instance = new Glide();

                    _context = new WeakReference<>(context.getApplicationContext());
                }
            }
        }

        return new RequestManager(_instance);
    }
}
