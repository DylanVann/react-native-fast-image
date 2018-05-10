package com.dylanvann.fastimage;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;

import com.bumptech.glide.Glide;
import com.bumptech.glide.Priority;
import com.bumptech.glide.RequestManager;
import com.bumptech.glide.load.engine.DiskCacheStrategy;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.request.RequestOptions;
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

import javax.annotation.Nullable;

import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_ERROR_EVENT;
import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_LOAD_END_EVENT;
import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_LOAD_EVENT;

class FastImageViewManager extends SimpleViewManager<FastImageViewWithUrl> implements FastImageProgressListener {

    private static final String REACT_CLASS = "FastImageView";
    private static final String REACT_ON_LOAD_START_EVENT = "onFastImageLoadStart";
    private static final String REACT_ON_PROGRESS_EVENT = "onFastImageProgress";
    private static final Drawable TRANSPARENT_DRAWABLE = new ColorDrawable(Color.TRANSPARENT);
    private static final Map<String, List<FastImageViewWithUrl>> VIEWS_FOR_URLS = new HashMap<>();
    private RequestManager requestManager = null;

    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @Override
    protected FastImageViewWithUrl createViewInstance(ThemedReactContext reactContext) {
        requestManager = Glide.with(reactContext);
        return new FastImageViewWithUrl(reactContext);
    }

    @ReactProp(name = "source")
    public void setSrc(FastImageViewWithUrl view, @Nullable ReadableMap source) {
        if (source == null) {
            // Cancel existing requests.
            requestManager.clear(view);
            if (view.glideUrl != null) {
                FastImageOkHttpProgressGlideModule.forget(view.glideUrl.toStringUrl());
            }
            // Clear the image.
            view.setImageDrawable(null);
            return;
        }

        // Get the GlideUrl which contains header info.
        GlideUrl glideUrl = FastImageViewConverter.glideUrl(source);
        view.glideUrl = glideUrl;

        // Get priority.
        final Priority priority = FastImageViewConverter.priority(source);

        // Cancel existing request.
        requestManager.clear(view);

        String key = glideUrl.toStringUrl();
        FastImageOkHttpProgressGlideModule.expect(key, this);
        List<FastImageViewWithUrl> viewsForKey = VIEWS_FOR_URLS.get(key);
        if (viewsForKey != null && !viewsForKey.contains(view)) {
            viewsForKey.add(view);
        } else if (viewsForKey == null) {
            List<FastImageViewWithUrl> newViewsForKeys = new ArrayList<>(Collections.singletonList(view));
            VIEWS_FOR_URLS.put(key, newViewsForKeys);
        }

        ThemedReactContext context = (ThemedReactContext) view.getContext();
        RCTEventEmitter eventEmitter = context.getJSModule(RCTEventEmitter.class);
        int viewId = view.getId();
        eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_START_EVENT, new WritableNativeMap());

        RequestOptions options = new RequestOptions()
                .diskCacheStrategy(DiskCacheStrategy.ALL)
                .priority(priority)
                .dontTransform()
                .placeholder(TRANSPARENT_DRAWABLE);

        requestManager
                .load(glideUrl)
                .apply(options)
                .listener(new FastImageRequestListener(key))
                .into(view);
    }

    @ReactProp(name = "resizeMode")
    public void setResizeMode(FastImageViewWithUrl view, String resizeMode) {
        final FastImageViewWithUrl.ScaleType scaleType = FastImageViewConverter.scaleType(resizeMode);
        view.setScaleType(scaleType);
    }

    @Override
    public void onDropViewInstance(FastImageViewWithUrl view) {
        // This will cancel existing requests.
        requestManager.clear(view);
        final String key = view.glideUrl.toString();
        FastImageOkHttpProgressGlideModule.forget(key);
        List<FastImageViewWithUrl> viewsForKey = VIEWS_FOR_URLS.get(key);
        if (viewsForKey != null) {
            viewsForKey.remove(view);
            if (viewsForKey.size() == 0) VIEWS_FOR_URLS.remove(key);
        }
        super.onDropViewInstance(view);
    }

    @Override
    @Nullable
    public Map getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.of(
                REACT_ON_LOAD_START_EVENT,
                MapBuilder.of("registrationName", REACT_ON_LOAD_START_EVENT),
                REACT_ON_PROGRESS_EVENT,
                MapBuilder.of("registrationName", REACT_ON_PROGRESS_EVENT),
                REACT_ON_LOAD_EVENT,
                MapBuilder.of("registrationName", REACT_ON_LOAD_EVENT),
                REACT_ON_ERROR_EVENT,
                MapBuilder.of("registrationName", REACT_ON_ERROR_EVENT),
                REACT_ON_LOAD_END_EVENT,
                MapBuilder.of("registrationName", REACT_ON_LOAD_END_EVENT)
        );
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

}
