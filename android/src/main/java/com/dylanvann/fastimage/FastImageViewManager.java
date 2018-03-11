package com.dylanvann.fastimage;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.widget.ImageView;

import com.bumptech.glide.Glide;
import com.bumptech.glide.Priority;
import com.bumptech.glide.load.engine.DiskCacheStrategy;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.resource.drawable.GlideDrawable;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.ImageViewTarget;
import com.bumptech.glide.request.target.Target;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;
import com.facebook.react.uimanager.events.RCTEventEmitter;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.annotation.Nullable;

class ImageViewWithUrl extends ImageView {
    public GlideUrl glideUrl;

    public ImageViewWithUrl(Context context) {
        super(context);
    }
}

class FastImageViewManager extends SimpleViewManager<ImageViewWithUrl> implements ProgressListener {

    private static final String REACT_CLASS = "FastImageView";
    private static final String REACT_ON_LOAD_START_EVENT = "onFastImageLoadStart";
    private static final String REACT_ON_PROGRESS_EVENT = "onFastImageProgress";
    private static final String REACT_ON_ERROR_EVENT = "onFastImageError";
    private static final String REACT_ON_LOAD_EVENT = "onFastImageLoad";
    private static final String REACT_ON_LOAD_END_EVENT = "onFastImageLoadEnd";
    private static final Drawable TRANSPARENT_DRAWABLE = new ColorDrawable(Color.TRANSPARENT);
    private static final Map<String, List<ImageViewWithUrl>> VIEWS_FOR_URLS = new HashMap<>();

    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @Override
    protected ImageViewWithUrl createViewInstance(ThemedReactContext reactContext) {
        return new ImageViewWithUrl(reactContext);
    }

    private static RequestListener<GlideUrl, GlideDrawable> LISTENER = new RequestListener<GlideUrl, GlideDrawable>() {
        @Override
        public boolean onException(
                Exception e,
                GlideUrl uri,
                Target<GlideDrawable> target,
                boolean isFirstResource
        ) {
            OkHttpProgressGlideModule.forget(uri.toStringUrl());
            if (!(target instanceof ImageViewTarget)) {
                return false;
            }
            ImageViewWithUrl view = (ImageViewWithUrl) ((ImageViewTarget) target).getView();
            ThemedReactContext context = (ThemedReactContext) view.getContext();
            RCTEventEmitter eventEmitter = context.getJSModule(RCTEventEmitter.class);
            int viewId = view.getId();
            eventEmitter.receiveEvent(viewId, REACT_ON_ERROR_EVENT, new WritableNativeMap());
            eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_END_EVENT, new WritableNativeMap());
            return false;
        }

        @Override
        public boolean onResourceReady(
                GlideDrawable resource,
                GlideUrl uri,
                Target<GlideDrawable> target,
                boolean isFromMemoryCache,
                boolean isFirstResource
        ) {
            if (!(target instanceof ImageViewTarget)) {
                return false;
            }
            ImageViewWithUrl view = (ImageViewWithUrl) ((ImageViewTarget) target).getView();
            ThemedReactContext context = (ThemedReactContext) view.getContext();
            RCTEventEmitter eventEmitter = context.getJSModule(RCTEventEmitter.class);
            int viewId = view.getId();
            
            eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_EVENT, mapFromResource(resource));
            eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_END_EVENT, mapFromResource(resource));
            return false;
        }
    };

    private static WritableMap mapFromResource(GlideDrawable resource) {
        WritableMap resourceData = new WritableNativeMap();
        resourceData.putInt("width", resource.getIntrinsicWidth());
        resourceData.putInt("height", resource.getIntrinsicHeight());

        return resourceData;
    }

    @ReactProp(name = "source")
    public void setSrc(ImageViewWithUrl view, @Nullable ReadableMap source) {
        if (source == null) {
            // Cancel existing requests.
            Glide.clear(view);
            if (view.glideUrl != null) {
                OkHttpProgressGlideModule.forget(view.glideUrl.toStringUrl());
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
        Glide.clear(view);

        String key = glideUrl.toStringUrl();
        OkHttpProgressGlideModule.expect(key, this);
        List<ImageViewWithUrl> viewsForKey = VIEWS_FOR_URLS.get(key);
        if (viewsForKey != null && !viewsForKey.contains(view)) {
            viewsForKey.add(view);
        } else if (viewsForKey == null) {
            List<ImageViewWithUrl> newViewsForKeys = new ArrayList<ImageViewWithUrl>(Arrays.asList(view));
            VIEWS_FOR_URLS.put(key, newViewsForKeys);
        }

        ThemedReactContext context = (ThemedReactContext) view.getContext();
        RCTEventEmitter eventEmitter = context.getJSModule(RCTEventEmitter.class);
        int viewId = view.getId();
        eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_START_EVENT, new WritableNativeMap());

        Glide
                .with(view.getContext().getApplicationContext())
                .load(glideUrl)
                .diskCacheStrategy(DiskCacheStrategy.ALL)
                .dontTransform()
                .priority(priority)
                .placeholder(TRANSPARENT_DRAWABLE)
                .listener(LISTENER)
                .into(view);
    }

    @ReactProp(name = "resizeMode")
    public void setResizeMode(ImageViewWithUrl view, String resizeMode) {
        final ImageViewWithUrl.ScaleType scaleType = FastImageViewConverter.scaleType(resizeMode);
        view.setScaleType(scaleType);
    }

    @Override
    public void onDropViewInstance(ImageViewWithUrl view) {
        // This will cancel existing requests.
        Glide.clear(view);
        final String key = view.glideUrl.toString();
        OkHttpProgressGlideModule.forget(key);
        List<ImageViewWithUrl> viewsForKey = VIEWS_FOR_URLS.get(key);
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
        List<ImageViewWithUrl> viewsForKey = VIEWS_FOR_URLS.get(key);
        if (viewsForKey != null) {
            for (ImageViewWithUrl view: viewsForKey) {
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
