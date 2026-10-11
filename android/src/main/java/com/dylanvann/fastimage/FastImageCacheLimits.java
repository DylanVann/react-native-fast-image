package com.dylanvann.fastimage;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;

import androidx.annotation.Nullable;

import com.bumptech.glide.load.engine.cache.DiskCache;

import java.io.File;

// configureCache's maxDiskSize on Android. Glide's disk cache size can only be
// set when Glide starts, so FastImageGlideModule applies it then: the one
// saved by configureCache at runtime, or the app's manifest's
// (fastimage.MAX_DISK_SIZE meta-data), or Glide's default.
final class FastImageCacheLimits {
    private static final String PREFERENCES = "fast-image-cache-limits";
    private static final String MAX_DISK_SIZE = "maxDiskSize";
    private static final String MANIFEST_MAX_DISK_SIZE = "fastimage.MAX_DISK_SIZE";

    // The disk cache size Glide started with, in bytes (0 for no limit), or
    // -1 if FastImageGlideModule hasn't started it (not yet, or the app has
    // its own AppGlideModule instead).
    static volatile long startedMaxDiskSize = -1;

    private FastImageCacheLimits() {
    }

    // Android loads the file on its own thread the first time; reading it
    // waits for that. FastImageViewModule gets it early, off the main thread,
    // so Glide doesn't wait on the disk when it starts.
    static SharedPreferences preferences(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    // Starts loading the preferences file on a background thread, when
    // FastImage's package creates its module and view manager (before any
    // image loads).
    static void loadInBackground(final Context context) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                preferences(context);
            }
        }, "FastImageCacheLimits").start();
    }

    // Saves a runtime change (bytes, 0 for no limit), or with null removes it.
    static void saveMaxDiskSize(Context context, @Nullable Long maxDiskSize) {
        SharedPreferences.Editor editor = preferences(context).edit();
        if (maxDiskSize == null) {
            editor.remove(MAX_DISK_SIZE);
        } else {
            editor.putLong(MAX_DISK_SIZE, maxDiskSize);
        }
        editor.commit();
    }

    // The size to start Glide with: saved, or the manifest's, or Glide's
    // default. 0 for no limit.
    static long maxDiskSize(Context context) {
        SharedPreferences preferences = preferences(context);
        if (preferences.contains(MAX_DISK_SIZE)) {
            return Math.max(preferences.getLong(MAX_DISK_SIZE, 0), 0);
        }
        Long manifest = manifestMaxDiskSize(context);
        return manifest != null ? Math.max(manifest, 0) : DiskCache.Factory.DEFAULT_DISK_CACHE_SIZE;
    }

    @Nullable
    private static Long manifestMaxDiskSize(Context context) {
        try {
            ApplicationInfo info = context.getPackageManager()
                    .getApplicationInfo(context.getPackageName(), PackageManager.GET_META_DATA);
            Bundle metaData = info.metaData;
            // Bundle.get (deprecated from API 33 for parcels of unknown types):
            // the manifest's value is an Integer, a Float or a String.
            @SuppressWarnings("deprecation")
            Object value = metaData == null ? null : metaData.get(MANIFEST_MAX_DISK_SIZE);
            if (value instanceof Number) return ((Number) value).longValue();
            if (value instanceof String) return Long.parseLong(((String) value).trim());
        } catch (PackageManager.NameNotFoundException | NumberFormatException e) {
            // None.
        }
        return null;
    }

    // The bytes the disk cache (in Glide's default folder, where
    // FastImageGlideModule puts it) uses now.
    static long diskSize(Context context) {
        return size(new File(context.getCacheDir(), DiskCache.Factory.DEFAULT_DISK_CACHE_DIR));
    }

    private static long size(File file) {
        File[] files = file.listFiles();
        if (files == null) return file.isFile() ? file.length() : 0;
        long size = 0;
        for (File child : files) size += size(child);
        return size;
    }
}
