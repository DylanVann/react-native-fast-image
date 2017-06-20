package com.dylanvann.fastimage;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.widget.ImageView;

import com.bumptech.glide.Glide;
import com.bumptech.glide.Priority;
import com.bumptech.glide.load.data.DataFetcher;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.stream.StreamModelLoader;
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

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;

import javax.annotation.Nullable;

class FastImageViewManager extends SimpleViewManager<ImageView> {

    private static final String REACT_CLASS = "FastImageView";

    private static final String REACT_ON_LOAD_EVENT = "onFastImageLoad";

    private static final String REACT_ON_ERROR_EVENT = "onFastImageError";

    private static Drawable TRANSPARENT_DRAWABLE = new ColorDrawable(Color.TRANSPARENT);

    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @Override
    protected ImageView createViewInstance(ThemedReactContext reactContext) {
        return new ImageView(reactContext);
    }

    private static RequestListener<GlideUrl, GlideDrawable> LISTENER = new RequestListener<GlideUrl, GlideDrawable>() {
        @Override
        public boolean onException(
                Exception e,
                GlideUrl uri,
                Target<GlideDrawable> target,
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
            // Clear the image.
            view.setImageDrawable(null);
            return;
        }

        // Get the GlideUrl which contains header info.
        final GlideUrl glideUrl = FastImageViewConverter.glideUrl(source);

        // Get priority.
        final Priority priority = FastImageViewConverter.priority(source);

        // Cancel existing request.
        Glide.clear(view);

        Glide
                .with(view.getContext())
                .load(glideUrl)
                .priority(priority)
                .placeholder(TRANSPARENT_DRAWABLE)
                .listener(LISTENER)
                .into(view);
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
        super.onDropViewInstance(view);
    }

    @Override
    @Nullable
    public Map getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.of(
                REACT_ON_LOAD_EVENT,
                MapBuilder.of("registrationName", REACT_ON_LOAD_EVENT),
                REACT_ON_ERROR_EVENT,
                MapBuilder.of("registrationName", REACT_ON_ERROR_EVENT)
        );
    }

    // Used to attempt to load from cache only.
    private static final StreamModelLoader<GlideUrl> cacheOnlyStreamLoader = new StreamModelLoader<GlideUrl>() {
        @Override
        public DataFetcher<InputStream> getResourceFetcher(final GlideUrl model, int width, int height) {
            return new DataFetcher<InputStream>() {
                @Override
                public InputStream loadData(Priority priority) throws Exception {
                    throw new IOException();
                }

                @Override
                public void cleanup() {

                }

                @Override
                public String getId() {
                    return model.getCacheKey();
                }

                @Override
                public void cancel() {

                }
            };
        }
    };
}
