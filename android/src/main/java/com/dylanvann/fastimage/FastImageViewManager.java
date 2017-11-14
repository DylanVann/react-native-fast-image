package com.dylanvann.fastimage;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.widget.ImageView;

import com.bumptech.glide.Glide;
import com.bumptech.glide.Priority;
import com.bumptech.glide.RequestManager;
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
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.annotation.Nullable;

import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_ERROR_EVENT;
import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_LOAD_END_EVENT;
import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_LOAD_EVENT;

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
    private static final Drawable TRANSPARENT_DRAWABLE = new ColorDrawable(Color.TRANSPARENT);
    private static final Map<String, List<ImageViewWithUrl>> VIEWS_FOR_URLS = new HashMap<>();
    private  static RequestManager requestManager = null;

    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @Override
    protected ImageViewWithUrl createViewInstance(ThemedReactContext reactContext) {
        requestManager = Glide.with(reactContext);
        return new ImageViewWithUrl(reactContext);
    }

    @ReactProp(name = "source")
    public void setSrc(ImageViewWithUrl view, @Nullable ReadableMap source) {
        if (source == null) {
            // Cancel existing requests.
            requestManager.clear(view);
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
        requestManager.clear(view);

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

        RequestOptions options = new RequestOptions()
                .priority(priority)
                .placeholder(TRANSPARENT_DRAWABLE);

        requestManager
                .load(glideUrl)
                .apply(options)
                .listener(new FastImageRequestListener(key))
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
        requestManager.clear(view);
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
