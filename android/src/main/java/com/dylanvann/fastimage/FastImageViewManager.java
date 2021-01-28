package com.dylanvann.fastimage;

import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.PorterDuff;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;

import com.bumptech.glide.Glide;
import com.bumptech.glide.RequestManager;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.signature.ObjectKey;
import com.dylanvann.fastimage.custom.EtagCallback;
import com.dylanvann.fastimage.custom.EtagRequester;
import com.dylanvann.fastimage.custom.PersistEtagCallbackWrapper;
import com.dylanvann.fastimage.custom.persistence.ObjectBox;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;
import com.facebook.react.uimanager.events.RCTEventEmitter;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;

import javax.annotation.Nullable;

import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_ERROR_EVENT;
import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_LOAD_END_EVENT;
import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_LOAD_EVENT;

class FastImageViewManager extends SimpleViewManager<FastImageViewWithUrl> implements FastImageProgressListener {

    private static final String REACT_CLASS = "FastImageView";
    private static final String REACT_ON_LOAD_START_EVENT = "onFastImageLoadStart";
    private static final String REACT_ON_PROGRESS_EVENT = "onFastImageProgress";
    private static final Map<String, List<FastImageViewWithUrl>> VIEWS_FOR_URLS = new WeakHashMap<>();

    private static final int FORCE_REFRESH_IMAGE = 1;

//    private ReactApplicationContext reactContext;
//
//    public FastImageViewManager(ReactApplicationContext reactContext) {
//        this.reactContext = reactContext;
//    }

    @Nullable
    private RequestManager requestManager = null;

    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @Override
    protected FastImageViewWithUrl createViewInstance(ThemedReactContext reactContext) {
        if (isValidContextForGlide(reactContext)) {
            requestManager = Glide.with(reactContext);
        }

        return new FastImageViewWithUrl(reactContext);
    }

    @ReactProp(name = "source")
    public void setSrc(FastImageViewWithUrl view, @Nullable ReadableMap source) {
        view.source = source;

        if (source == null || !source.hasKey("uri") || isNullOrEmpty(source.getString("uri"))) {
            // Cancel existing requests.
            if (requestManager != null) {
                requestManager.clear(view);
            }

            if (view.glideUrl != null) {
                FastImageOkHttpProgressGlideModule.forget(view.glideUrl.toStringUrl());
            }
            // Clear the image.
            view.setImageDrawable(null);
            return;
        }

        load(view, source);
    }

    private void load(final FastImageViewWithUrl view, @NonNull final ReadableMap source) {
        //final GlideUrl glideUrl = FastImageViewConverter.getGlideUrl(view.getContext(), source);
        final FastImageSource imageSource = FastImageViewConverter.getImageSource(view.getContext(), source);
        final GlideUrl glideUrl = imageSource.getGlideUrl();

        // Cancel existing request.
        view.glideUrl = glideUrl;
//        if (requestManager != null) {
//            requestManager.clear(view);
//        }

        final String key = glideUrl.toStringUrl();
        FastImageOkHttpProgressGlideModule.expect(key, this);
        List<FastImageViewWithUrl> viewsForKey = VIEWS_FOR_URLS.get(key);
        if (viewsForKey != null && !viewsForKey.contains(view)) {
            viewsForKey.add(view);
        } else if (viewsForKey == null) {
            List<FastImageViewWithUrl> newViewsForKeys = new ArrayList<>(Collections.singletonList(view));
            VIEWS_FOR_URLS.put(key, newViewsForKeys);
        }

        final ThemedReactContext context = (ThemedReactContext) view.getContext();
        RCTEventEmitter eventEmitter = context.getJSModule(RCTEventEmitter.class);
        int viewId = view.getId();
        eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_START_EVENT, new WritableNativeMap());

        if (requestManager != null) {
            final String url = imageSource.getGlideUrl().toStringUrl();
            if (!url.startsWith("http")) {
                requestManager
                        // This will make this work for remote and local images. e.g.
                        //    - file:///
                        //    - content://
                        //    - res:/
                        //    - android.resource://
                        //    - data:image/png;base64
                        .load(imageSource.getSourceForLoad())
                        .apply(FastImageViewConverter.getOptions(context, imageSource, source))
                        .listener(new FastImageRequestListener(key))
                        .into(view);
                return;
            }

            getEtag(url, new EtagCallback() {
                        @Override
                        public void onEtag(final String etag) {
                            getActivityFromContext(view.getContext()).runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    requestManager
                                            .load(url)
                                            .apply(FastImageViewConverter.getOptions(context, imageSource, source))
                                            .signature(new ObjectKey(etag))
                                            .listener(new FastImageRequestListener(key))
                                            .into(view);
                                }
                            });
                        }
                    }
            );
            refresh(view, url);
        }
    }

    /**
     * Refreshes an image. Won't do anything if etag hasn't changed.
     * When there was a new image the new image will be shown + the image
     * and etag cache will be updated.
     * @param url
     */
    private void refresh(final FastImageViewWithUrl view, final String url) {
        final String prevEtag = ObjectBox.getEtagByUrl(url);
        if (prevEtag == null) {
            //can happen on the very first request. In this case a refresh is useless anyways.
            return;
        }

        EtagRequester.requestEtag(url, new PersistEtagCallbackWrapper(url, new EtagCallback() {
                    @Override
                    public void onEtag(final String etag) {
                        getActivityFromContext(view.getContext()).runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                if (requestManager == null) {
                                    Log.e(FastImageViewManager.class.getSimpleName(), "Can't refresh as requestManager was null!");
                                    return;
                                }

                                requestManager
                                        .load(url)
                                        .thumbnail(
                                                requestManager.load(url)
                                                        .signature(new ObjectKey(prevEtag))
                                        )
                                        .signature(new ObjectKey(etag))
                                        .skipMemoryCache(true)
                                        .into(view);
                            }
                        });
                    }
                })
        );
    }

    /**
     * Returns the etag from cache. If there is no cached etag it will request
     * the server to get it, save it to the cache, and return it.
     * @param url
     * @param callback
     */
    private void getEtag(String url, EtagCallback callback) {
        String etag = ObjectBox.getEtagByUrl(url);

        if (etag == null) {
            EtagRequester.requestEtag(url, new PersistEtagCallbackWrapper(url, callback));
        } else {
            callback.onEtag(etag);
        }
    }

    @ReactProp(name = "tintColor", customType = "Color")
    public void setTintColor(FastImageViewWithUrl view, @Nullable Integer color) {
        if (color == null) {
            view.clearColorFilter();
        } else {
            view.setColorFilter(color, PorterDuff.Mode.SRC_IN);
        }
    }

    @ReactProp(name = "resizeMode")
    public void setResizeMode(FastImageViewWithUrl view, String resizeMode) {
        final FastImageViewWithUrl.ScaleType scaleType = FastImageViewConverter.getScaleType(resizeMode);
        view.setScaleType(scaleType);
    }

    @Override
    public void onDropViewInstance(@NonNull FastImageViewWithUrl view) {
        // This will cancel existing requests.
        if (requestManager != null) {
            requestManager.clear(view);
        }

        if (view.glideUrl != null) {
            final String key = view.glideUrl.toString();
            FastImageOkHttpProgressGlideModule.forget(key);
            List<FastImageViewWithUrl> viewsForKey = VIEWS_FOR_URLS.get(key);
            if (viewsForKey != null) {
                viewsForKey.remove(view);
                if (viewsForKey.size() == 0) VIEWS_FOR_URLS.remove(key);
            }
        }

        super.onDropViewInstance(view);
    }

    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.<String, Object>builder()
                .put(REACT_ON_LOAD_START_EVENT, MapBuilder.of("registrationName", REACT_ON_LOAD_START_EVENT))
                .put(REACT_ON_PROGRESS_EVENT, MapBuilder.of("registrationName", REACT_ON_PROGRESS_EVENT))
                .put(REACT_ON_LOAD_EVENT, MapBuilder.of("registrationName", REACT_ON_LOAD_EVENT))
                .put(REACT_ON_ERROR_EVENT, MapBuilder.of("registrationName", REACT_ON_ERROR_EVENT))
                .put(REACT_ON_LOAD_END_EVENT, MapBuilder.of("registrationName", REACT_ON_LOAD_END_EVENT))
                .build();
    }

    @Override
    public void onProgress(String key, long bytesRead, long expectedLength) {
        List<FastImageViewWithUrl> viewsForKey = VIEWS_FOR_URLS.get(key);
        if (viewsForKey != null) {
            for (FastImageViewWithUrl view : viewsForKey) {
                WritableMap event = new WritableNativeMap();
                event.putInt("loaded", (int) bytesRead);
                event.putInt("total", (int) expectedLength);
                ThemedReactContext context = (ThemedReactContext) view.getContext();
                RCTEventEmitter eventEmitter = context.getJSModule(RCTEventEmitter.class);
                int viewId = view.getId();
                eventEmitter.receiveEvent(viewId, REACT_ON_PROGRESS_EVENT, event);
            }
        }
    }

    @Override
    public float getGranularityPercentage() {
        return 0.5f;
    }

    private boolean isNullOrEmpty(final String url) {
        return url == null || url.trim().isEmpty();
    }


    private static boolean isValidContextForGlide(final Context context) {
        Activity activity = getActivityFromContext(context);

        if (activity == null) {
            return false;
        }

        return !isActivityDestroyed(activity);
    }

    private static Activity getActivityFromContext(final Context context) {
        if (context instanceof Activity) {
            return (Activity) context;
        }

        if (context instanceof ThemedReactContext) {
            final Context baseContext = ((ThemedReactContext) context).getBaseContext();
            if (baseContext instanceof Activity) {
                return (Activity) baseContext;
            }

            if (baseContext instanceof ContextWrapper) {
                final ContextWrapper contextWrapper = (ContextWrapper) baseContext;
                final Context wrapperBaseContext = contextWrapper.getBaseContext();
                if (wrapperBaseContext instanceof Activity) {
                    return (Activity) wrapperBaseContext;
                }
            }
        }

        return null;
    }

    private static boolean isActivityDestroyed(Activity activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
            return activity.isDestroyed() || activity.isFinishing();
        } else {
            return activity.isDestroyed() || activity.isFinishing() || activity.isChangingConfigurations();
        }
    }

    @androidx.annotation.Nullable
    @Override
    public Map<String, Integer> getCommandsMap() {
        return new HashMap<String, Integer>() {
            {
                put("forceRefreshImage", FORCE_REFRESH_IMAGE);
            }
        };
    }

    @Override
    public void receiveCommand(FastImageViewWithUrl root, int commandId, @Nullable ReadableArray args) {
        switch (commandId) {
            case FORCE_REFRESH_IMAGE: {
                if (root.source != null) {
                    final FastImageSource imageSource = FastImageViewConverter.getImageSource(root.getContext(), root.source);
                    refresh(root, imageSource.getGlideUrl().toStringUrl());
                }
                return;
            }
            default:
                throw new IllegalArgumentException(String.format(
                        "Unsupported command %s received by %s.",
                        commandId,
                        root.getClass().getSimpleName()));
        }
    }
}
