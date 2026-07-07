package com.dylanvann.fastimage;

import android.app.Activity;

import com.bumptech.glide.Glide;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;

class FastImageViewModuleImplementation {

    static final String REACT_CLASS = "FastImageView";

    private final ReactApplicationContext reactContext;

    FastImageViewModuleImplementation(ReactApplicationContext reactContext) {
        this.reactContext = reactContext;
    }

    private Activity getCurrentActivity() {
        return reactContext.getCurrentActivity();
    }

    void preload(final ReadableArray sources) {
        final Activity activity = getCurrentActivity();
        if (activity == null) return;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                for (int i = 0; i < sources.size(); i++) {
                    final ReadableMap source = sources.getMap(i);
                    final FastImageSource imageSource = FastImageViewConverter.getImageSource(activity, source);

                    Glide
                            .with(activity.getApplicationContext())
                            // This will make this work for remote and local images. e.g.
                            //    - file:///
                            //    - content://
                            //    - res:/
                            //    - android.resource://
                            //    - data:image/png;base64
                            .load(
                                    imageSource.isBase64Resource() ? imageSource.getSource() :
                                    imageSource.isResource() ? imageSource.getUri() : imageSource.getGlideUrl()
                            )
                            .apply(FastImageViewConverter.getOptions(activity, imageSource, source))
                            .preload();
                }
            }
        });
    }

    void clearMemoryCache(final Promise promise) {
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

    void clearDiskCache(Promise promise) {
        final Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.resolve(null);
            return;
        }

        Glide.get(activity.getApplicationContext()).clearDiskCache();
        promise.resolve(null);
    }
}
