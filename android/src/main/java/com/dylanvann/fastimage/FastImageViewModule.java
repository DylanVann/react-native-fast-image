package com.dylanvann.fastimage;

import android.app.Activity;

import android.support.annotation.Nullable;
import com.bumptech.glide.Glide;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.Target;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;

import java.io.File;

class FastImageViewModule extends ReactContextBaseJavaModule {

    private static final String REACT_CLASS = "FastImageView";
    private static final String ERROR_LOAD_FAILED = "ERROR_LOAD_FAILED";

    private static Object urlForGlideUrl(GlideUrl glideUrl) {
        final String stringUrl = glideUrl.toString();

        // This will make this work for remote and local images. e.g.
        //    - file:///
        //    - content://
        //    - data:image/png;base64
        return stringUrl.startsWith("http") ? glideUrl : stringUrl;
    }

    FastImageViewModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

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
                    final GlideUrl glideUrl = FastImageViewConverter.getGlideUrl(source);

                    Glide
                            .with(activity.getApplicationContext())
                            .load(urlForGlideUrl(glideUrl))
                            .apply(FastImageViewConverter.getOptions(source))
                            .preload();
                }
            }
        });
    }

    @ReactMethod
    public void loadImage(final ReadableMap source, final Promise promise) {
        final Activity activity = getCurrentActivity();
        if (activity == null) return;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                final GlideUrl glideUrl = FastImageViewConverter.getGlideUrl(source);

                Glide
                        .with(activity.getApplicationContext())
                        .asFile()
                        .load(urlForGlideUrl(glideUrl))
                        .apply(FastImageViewConverter.getOptions(source))
                        .listener(new RequestListener<File>() {
                            @Override
                            public boolean onLoadFailed(@Nullable GlideException e, Object model, Target<File> target, boolean isFirstResource) {
                                promise.reject(ERROR_LOAD_FAILED, e);
                                return false;
                            }

                            @Override
                            public boolean onResourceReady(File resource, Object model, Target<File> target, DataSource dataSource, boolean isFirstResource) {
                                promise.resolve(resource.getAbsolutePath());
                                return false;
                            }
                        })
                        .submit();
            }
        });
    }
}
