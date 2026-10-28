package com.fastimage;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;

// Expensive work FastImage does (decodes, loads, blurs, SVG renders, fade
// snapshots), one log line each (tag FastImageWork), in a debuggable app
// only: the example app's regression runner counts them per case
// (scripts/verify.mts). Nothing in a release build.
final class FastImageWork {
    private static final String TAG = "FastImageWork";
    // Set from the first context (a view or the module): whether the app is
    // debuggable.
    private static volatile boolean enabled = false;
    private static volatile boolean initialized = false;

    private FastImageWork() {
    }

    static void init(Context context) {
        if (initialized) return;
        enabled = (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        initialized = true;
    }

    static boolean enabled() {
        return enabled;
    }

    // A line: the kind, the image (its model, e.g. its url, or -), what it
    // was (e.g. a decode's sizes, or why a load started), and "main" if it
    // ran on the main thread.
    static void record(String kind, @Nullable Object image, String detail) {
        if (!enabled) return;
        boolean main = Looper.myLooper() == Looper.getMainLooper();
        String name = image != null ? String.valueOf(image) : "-";
        // A data uri as its length: it can be the whole image.
        if (name.startsWith("data:")) name = "data:(" + name.length() + ")";
        Log.i(TAG, kind + " " + name + " " + detail + (main ? " main" : ""));
    }
}
