package com.fastimage;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;

// Expensive work FastImage does (decodes, loads, blurs, SVG renders, fade
// snapshots), one debug log line each (tag FastImageWork), in a debuggable
// app with the tag's debug level on (adb shell setprop log.tag.FastImageWork
// DEBUG): the example app's regression runner counts them per case
// (scripts/verify.mts sets it). Nothing in a release build.
final class FastImageWork {
    private static final String TAG = "FastImageWork";
    // Set from the first context (a view or the module): whether the app is
    // debuggable and the tag's debug level is on.
    private static volatile boolean enabled = false;
    private static volatile boolean initialized = false;

    private FastImageWork() {
    }

    static void init(Context context) {
        if (initialized) return;
        enabled = (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0
                && Log.isLoggable(TAG, Log.DEBUG);
        initialized = true;
    }

    static boolean enabled() {
        return enabled;
    }

    // A line: the kind, the image (its model, e.g. its url, or -), what it
    // was (e.g. a decode's sizes, or why a load started), and "main" if it
    // ran on the main thread.
    static void record(String kind, @Nullable Object image, String detail) {
        record(kind, image, detail, Looper.myLooper() == Looper.getMainLooper());
    }

    // Work done elsewhere than where it's logged: `main` says where.
    static void record(String kind, @Nullable Object image, String detail, boolean main) {
        if (!enabled) return;
        String name = image != null ? String.valueOf(image) : "-";
        // A data uri as its length: it can be the whole image.
        if (name.startsWith("data:")) name = "data:(" + name.length() + ")";
        Log.d(TAG, kind + " " + name + " " + detail + (main ? " main" : ""));
    }
}
