package com.bumptech.glide.util;

import android.graphics.Bitmap;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import android.text.TextUtils;
import android.util.Log;
import android.widget.ImageView;

import java.util.Locale;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;

/** Utility class. Helpers that allows to do debugging easier. */
public /* final */ class Helpers {
    /** Logger tag. */
    private static final String TAG = "glide";

    /** Compose log message with thread name. */
    @NonNull
    public static String msg(@Nullable final String message) {
        final Thread thread = Thread.currentThread();
        final String name = thread.getName();
        final String safe = TextUtils.isEmpty(message) ? "" : message;
        final String threadName = TextUtils.isEmpty(name) ? String.valueOf(thread.getId()) : name;

        return "[" + threadName + "] " + safe;
    }

    /** Compose threads factory that assign special 'prefixed' names to threads. */
    @NonNull
    public static DaemonThreadNaming withPrefix(final String prefix) {
        final String pattern = String.format(Locale.US, "%s-%s", prefix, "%d");

        return new DaemonThreadNaming(pattern);
    }

    /** Helper that assign new drawable to the imageview and at the same time try to cleanup memory. */
    public static void recycleAndSetNewDrawable(@NonNull final ImageView view, @NonNull final BitmapDrawable drawable) {
        final Drawable old = view.getDrawable();

        Log.i(TAG, "set image: WxH: " + drawable.getBitmap().getWidth() + "x" + drawable.getBitmap().getHeight());
        view.setImageDrawable(drawable);

        if (old instanceof BitmapDrawable) {
            final Bitmap bitmap = ((BitmapDrawable) old).getBitmap();

            if (!bitmap.isRecycled()) {
                bitmap.recycle();
            }
        }
    }

    /** Compose daemon-threads with a specific name. I/O operations. */
    public static class DaemonThreadNaming implements ThreadFactory {

        private final String pattern;
        private final AtomicInteger counter = new AtomicInteger();

        private DaemonThreadNaming(@NonNull final String pattern) {
            this.pattern = pattern;
        }

        @NonNull
        @Override
        public Thread newThread(@NonNull final Runnable r) {
            final String name = String.format(Locale.US, pattern, counter.incrementAndGet());

            final Thread result = new Thread(r, name);
            result.setDaemon(true);

            return result;
        }
    }
}
