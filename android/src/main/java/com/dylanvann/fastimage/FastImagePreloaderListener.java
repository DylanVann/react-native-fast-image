package com.dylanvann.fastimage;

import androidx.annotation.Nullable;
import android.util.Log;

import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.Target;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.File;

class FastImagePreloaderListener implements RequestListener<File> {
    private static final String LOG = "[FFFastImage]";
    private static final String EVENT_PROGRESS = "fffastimage-progress";
    private static final String EVENT_COMPLETE = "fffastimage-complete";

    private final ReactApplicationContext reactContext;
    private final int id;
    private final int total;
    private int succeeded = 0;
    private int failed = 0;

    public FastImagePreloaderListener(ReactApplicationContext reactContext, int id, int totalImages) {
        this.id = id;
        this.reactContext = reactContext;
        this.total = totalImages;
    }

    @Override
    public boolean onLoadFailed(@Nullable GlideException e, Object o, Target<File> target, boolean b) {
        // o is whatever was passed to .load() = GlideURL, String, etc.
        Log.d(LOG, "Preload failed: " + o.toString());
        this.failed++;
        this.dispatchProgress(null,null);
        return false;
    }

    @Override
    public boolean onResourceReady(File file, Object o, Target<File> target, DataSource dataSource, boolean b) {
        // o is whatever was passed to .load() = GlideURL, String, etc.
        this.succeeded++;
        this.dispatchProgress(o.toString() , file.getAbsolutePath());
        return false;
    }

    private void maybeDispatchComplete() {
        if (this.failed + this.succeeded >= this.total) {
            WritableMap params = Arguments.createMap();
            params.putInt("id", this.id);
            params.putInt("finished", this.succeeded + this.failed);
            params.putInt("skipped", this.failed);
            reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(EVENT_COMPLETE, params);
        }
    }

    private void dispatchProgress(@Nullable String url,@Nullable String cachePath) {
        WritableMap params = Arguments.createMap();
        params.putInt("id", this.id);
        params.putInt("finished", this.succeeded + this.failed);
        params.putInt("total", this.total);
        params.putString("url", url);
        params.putString("cachePath", cachePath);
        reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(EVENT_PROGRESS, params);
        this.maybeDispatchComplete();
    }
}
