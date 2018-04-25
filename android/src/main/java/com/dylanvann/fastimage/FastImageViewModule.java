package com.dylanvann.fastimage;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;

import com.bumptech.glide.Glide;
import com.bumptech.glide.Priority;
import com.bumptech.glide.load.engine.DiskCacheStrategy;
import com.bumptech.glide.load.model.GlideUrl;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;

class FastImageViewModule extends ReactContextBaseJavaModule {

    private static final String REACT_CLASS = "FastImageView";

    FastImageViewModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return REACT_CLASS;
    }

    private static Drawable TRANSPARENT_DRAWABLE = new ColorDrawable(Color.TRANSPARENT);

    @ReactMethod
    public void preload(final ReadableArray sources) {
        final Activity activity = getCurrentActivity();
        if (activity == null) return;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                for (int i = 0; i < sources.size(); i++) {
                    final ReadableMap source = sources.getMap(i);
                    final GlideUrl glideUrl = FastImageViewConverter.glideUrl(source);
                    final Priority priority = FastImageViewConverter.priority(source);
                    Glide
                            .with(activity.getApplicationContext())
                            .load(glideUrl)
                            .priority(priority)
                            .placeholder(TRANSPARENT_DRAWABLE)
                            .diskCacheStrategy(DiskCacheStrategy.SOURCE)
                            .preload();
                }
            }
        });
    }
}
