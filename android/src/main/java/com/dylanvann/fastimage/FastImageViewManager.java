package com.dylanvann.fastimage;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.widget.ImageView;

import com.bumptech.glide.Glide;
import com.bumptech.glide.Priority;
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

import java.util.Map;

import javax.annotation.Nullable;

class FastImageViewManager extends SimpleViewManager<ImageView> implements UIProgressListener  {

    private static final String REACT_CLASS = "FastImageView";

    private static final String REACT_ON_PROGRESS_EVENT = "onFastImageProgress";

    private static final String REACT_ON_LOAD_EVENT = "onFastImageLoad";

    private static final String REACT_ON_ERROR_EVENT = "onFastImageError";

    private static Drawable TRANSPARENT_DRAWABLE = new ColorDrawable(Color.TRANSPARENT);

    private ImageView imageView;

    private GlideUrl glideUrl;

    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @Override
    protected ImageView createViewInstance(ThemedReactContext reactContext) {
        imageView = new ImageView(reactContext);
        return imageView;
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
            ImageView view = (ImageView) ((ImageViewTarget) target).getView();
            WritableMap event = new WritableNativeMap();
            ThemedReactContext context = (ThemedReactContext) view.getContext();
            RCTEventEmitter eventEmitter = context.getJSModule(RCTEventEmitter.class);
            int viewId = view.getId();
            eventEmitter.receiveEvent(viewId, REACT_ON_ERROR_EVENT, event);
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
            ImageView view = (ImageView) ((ImageViewTarget) target).getView();
            WritableMap event = new WritableNativeMap();
            ThemedReactContext context = (ThemedReactContext) view.getContext();
            RCTEventEmitter eventEmitter = context.getJSModule(RCTEventEmitter.class);
            int viewId = view.getId();
            eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_EVENT, event);
            return false;
        }
    };

    @ReactProp(name = "source")
    public void setSrc(ImageView view, @Nullable ReadableMap source) {
        if (source == null) {
            // Cancel existing requests.
            Glide.clear(view);
            OkHttpProgressGlideModule.forget(glideUrl.toStringUrl());
            // Clear the image.
            view.setImageDrawable(null);
            return;
        }

        // Get the GlideUrl which contains header info.
        glideUrl = FastImageViewConverter.glideUrl(source);

        // Get priority.
        final Priority priority = FastImageViewConverter.priority(source);

        // Cancel existing request.
        Glide.clear(view);

        String key = glideUrl.toStringUrl();
        OkHttpProgressGlideModule.expect(key, this);

        Glide
                .with(view.getContext())
                .load(glideUrl)
                .priority(priority)
                .placeholder(TRANSPARENT_DRAWABLE)
                .listener(LISTENER)
                .into(imageView);
    }

    @ReactProp(name = "resizeMode")
    public void setResizeMode(ImageView view, String resizeMode) {
        final ImageView.ScaleType scaleType = FastImageViewConverter.scaleType(resizeMode);
        view.setScaleType(scaleType);
    }

    @Override
    public void onDropViewInstance(ImageView view) {
        // This will cancel existing requests.
        Glide.clear(view);
        OkHttpProgressGlideModule.forget(glideUrl.toString());
        super.onDropViewInstance(view);
    }

    @Override
    @Nullable
    public Map getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.of(
                REACT_ON_PROGRESS_EVENT,
                MapBuilder.of("registrationName", REACT_ON_PROGRESS_EVENT),
                REACT_ON_LOAD_EVENT,
                MapBuilder.of("registrationName", REACT_ON_LOAD_EVENT),
                REACT_ON_ERROR_EVENT,
                MapBuilder.of("registrationName", REACT_ON_ERROR_EVENT)
        );
    }

    @Override
    public void onProgress(long bytesRead, long expectedLength) {
        WritableMap event = new WritableNativeMap();
        double progress = ((float) bytesRead / (float) expectedLength) * 100;
        event.putDouble("progress", progress);
        ThemedReactContext context = (ThemedReactContext) imageView.getContext();
        RCTEventEmitter eventEmitter = context.getJSModule(RCTEventEmitter.class);
        int viewId = imageView.getId();
        eventEmitter.receiveEvent(viewId, REACT_ON_PROGRESS_EVENT, event);
    }

    @Override
    public float getGranularityPercentage() {
        return 0.5f;
    }

}
