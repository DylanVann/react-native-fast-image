package com.dylanvann.fastimage;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.widget.ImageView;
import android.widget.ImageView.ScaleType;

import com.bumptech.glide.DrawableRequestBuilder;
import com.bumptech.glide.DrawableTypeRequest;
import com.bumptech.glide.Glide;
import com.bumptech.glide.Priority;
import com.bumptech.glide.RequestManager;
import com.bumptech.glide.load.data.DataFetcher;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.LazyHeaders;
import com.bumptech.glide.load.model.stream.StreamModelLoader;
import com.bumptech.glide.load.resource.drawable.GlideDrawable;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.ImageViewTarget;
import com.bumptech.glide.request.target.Target;
import com.bumptech.glide.signature.StringSignature;
import com.facebook.react.bridge.NoSuchKeyException;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;
import com.facebook.react.uimanager.events.RCTEventEmitter;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import javax.annotation.Nullable;

class FastImageViewManager extends SimpleViewManager<ImageView> {

    private static final String REACT_CLASS = "FastImageView";

    private static final String REACT_ON_LOAD_EVENT = "onFastImageLoad";

    private static final String REACT_ON_ERROR_EVENT = "onFastImageError";

    private static Drawable TRANSPARENT_DRAWABLE = new ColorDrawable(Color.TRANSPARENT);

    private static Map<String, Priority> REACT_PRIORITY_MAP =
            new HashMap<String, Priority>() {{
                put("low", Priority.LOW);
                put("normal", Priority.NORMAL);
                put("high", Priority.HIGH);
            }};

    private static Map<String, ImageView.ScaleType> REACT_RESIZE_MODE_MAP =
            new HashMap<String, ImageView.ScaleType>() {{
                put("contain", ScaleType.FIT_CENTER);
                put("cover", ScaleType.CENTER_CROP);
                put("stretch", ScaleType.FIT_XY);
                put("center", ScaleType.CENTER);
            }};

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

        final String uriProp = source.getString("uri");

        // Get the headers prop and add to glideUrl.
        GlideUrl glideUrl;
        try {
            final ReadableMap headersMap = source.getMap("headers");
            ReadableMapKeySetIterator headersIterator = headersMap.keySetIterator();
            LazyHeaders.Builder headersBuilder = new LazyHeaders.Builder();
            while (headersIterator.hasNextKey()) {
                String key = headersIterator.nextKey();
                String value = headersMap.getString(key);
                headersBuilder.addHeader(key, value);
            }
            LazyHeaders headers = headersBuilder.build();
            glideUrl = new GlideUrl(uriProp, headers);
        } catch (NoSuchKeyException e) {
            // If there is no headers object.
            glideUrl = new GlideUrl(uriProp);
        }

        // Get the priority prop.
        String priorityProp = "normal";
        try {
            priorityProp = source.getString("priority");
        } catch (Exception e) {
            // Noop.
        }
        final Priority priority = REACT_PRIORITY_MAP.get(priorityProp);

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
        if (resizeMode == null) resizeMode = "contain";
        final ImageView.ScaleType scaleType = REACT_RESIZE_MODE_MAP.get(resizeMode);
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
