package com.dylanvann.fastimage;

import android.app.Activity;
import android.util.Log;

import androidx.annotation.NonNull;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.model.GlideUrl;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.views.imagehelper.ImageSource;

class FastImageViewModule extends ReactContextBaseJavaModule {

    private static final String REACT_CLASS = "FastImageView";
    private static final String TAG = "FastImage";

    FastImageViewModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @ReactMethod
    public void preload(final ReadableArray sources) {
        final Activity activity = getCurrentActivity();
        if (activity == null) return;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                for (int i = 0; i < sources.size(); i++) {
                    final ReadableMap source = sources.getMap(i);
                    // Skip sources without a uri (Glide throws on an empty url).
                    // preload has no way to report errors, so log them.
                    if (!FastImageViewConverter.hasUri(source)) {
                        Log.w(TAG, "preload: skipping a source without a uri");
                        continue;
                    }
                    final FastImageSource imageSource = FastImageViewConverter.getImageSource(activity, source);
                    // Also skip a uri that can't be resolved (e.g. a relative path),
                    // which resolves to an empty one. The view reports it as an error.
                    if (imageSource.getUri().toString().isEmpty()) {
                        Log.w(TAG, "preload: skipping a uri that can't be resolved: " + source.getString("uri"));
                        continue;
                    }

                    Glide
                            .with(activity.getApplicationContext())
                            // Load it the way the view does, so local images
                            // (file://, content://, asset:/) work too.
                            .load(imageSource.getSourceForLoad())
                            .apply(FastImageViewConverter.getOptions(activity, imageSource, source))
                            .preload();
                }
            }
        });
    }

    @ReactMethod
    public void clearMemoryCache(final Promise promise) {
        final Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.resolve(null);
            return;
        }

        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Glide.get(activity.getApplicationContext()).clearMemory();
                promise.resolve(null);
            }
        });
    }

    @ReactMethod
    public void clearDiskCache(Promise promise) {
        final Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.resolve(null);
            return;
        }

        Glide.get(activity.getApplicationContext()).clearDiskCache();
        promise.resolve(null);
    }
}
