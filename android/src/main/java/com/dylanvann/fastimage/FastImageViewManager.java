package com.dylanvann.fastimage;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.widget.ImageView;

import com.bumptech.glide.DrawableRequestBuilder;
import com.bumptech.glide.Glide;
import com.bumptech.glide.Priority;
import com.bumptech.glide.load.Transformation;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.resource.bitmap.CenterCrop;
import com.bumptech.glide.load.resource.drawable.GlideDrawable;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.ImageViewTarget;
import com.bumptech.glide.request.target.Target;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.FloatUtil;
import com.facebook.react.uimanager.PixelUtil;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewProps;
import com.facebook.react.uimanager.annotations.ReactProp;
import com.facebook.react.uimanager.annotations.ReactPropGroup;
import com.facebook.react.uimanager.events.RCTEventEmitter;
import com.facebook.yoga.YogaConstants;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;

import javax.annotation.Nullable;

import jp.wasabeef.glide.transformations.RoundedCornersTransformation;

class ImageViewWithUrl extends ImageView {
    public GlideUrl glideUrl;
    public float borderRadius = YogaConstants.UNDEFINED;
    public float[] borderCornerRadii;
    public Priority priority;

    public ImageViewWithUrl(Context context) {
        super(context);
    }

    public void setPriority(Priority priority) {
        this.priority = priority;
    }

    public void setBorderRadius(float borderRadius) {
        this.borderRadius = borderRadius;
    }

    public void setBorderRadius(float borderRadius, int position) {
        if (borderCornerRadii == null) {
            borderCornerRadii = new float[4];
            Arrays.fill(borderCornerRadii, YogaConstants.UNDEFINED);
        }

        if (!FloatUtil.floatsEqual(borderCornerRadii[position], borderRadius)) {
            borderCornerRadii[position] = borderRadius;
        }
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
    private final Map<String, List<ImageViewWithUrl>> VIEWS_FOR_URLS = new WeakHashMap<>();
    private FIRequestListener LISTENER = new FIRequestListener();

    private RoundedCornersTransformation.CornerType[] CORNER_TYPES = {
            RoundedCornersTransformation.CornerType.TOP_LEFT,
            RoundedCornersTransformation.CornerType.TOP_RIGHT,
            RoundedCornersTransformation.CornerType.BOTTOM_RIGHT,
            RoundedCornersTransformation.CornerType.BOTTOM_LEFT
    };

    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @Override
    protected ImageViewWithUrl createViewInstance(ThemedReactContext reactContext) {
        return new ImageViewWithUrl(reactContext);
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
        view.priority = priority;
    }

    @ReactProp(name = ViewProps.RESIZE_MODE)
    public void setResizeMode(ImageViewWithUrl view, String resizeMode) {
        final ImageViewWithUrl.ScaleType scaleType = FastImageViewConverter.scaleType(resizeMode);
        view.setScaleType(scaleType);
    }


    @ReactPropGroup(names = {
            ViewProps.BORDER_RADIUS,
            ViewProps.BORDER_TOP_LEFT_RADIUS,
            ViewProps.BORDER_TOP_RIGHT_RADIUS,
            ViewProps.BORDER_BOTTOM_RIGHT_RADIUS,
            ViewProps.BORDER_BOTTOM_LEFT_RADIUS
    }, defaultFloat = YogaConstants.UNDEFINED)
    public void setBorderRadius(ImageViewWithUrl view, int index, float borderRadius) {
        float borderRadiusPX = YogaConstants.UNDEFINED;
        if (!YogaConstants.isUndefined(borderRadius)) {
            borderRadiusPX = PixelUtil.toPixelFromDIP(borderRadius);
        }
        if (index == 0) {
            view.setBorderRadius(borderRadiusPX);
        } else {
            view.setBorderRadius(borderRadiusPX, index - 1);
        }
    }

    @Override
    protected void onAfterUpdateTransaction(ImageViewWithUrl view) {
        // Cancel existing request.
        Glide.clear(view);

        String key = view.glideUrl.toStringUrl();
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

        DrawableRequestBuilder<GlideUrl> builder = Glide
                .with(view.getContext().getApplicationContext())
                .load(view.glideUrl)
                .dontTransform();

        if (!YogaConstants.isUndefined(view.borderRadius) || view.borderCornerRadii != null) {

            List<Transformation<Bitmap>> transformations = new ArrayList<>();
            transformations.add(new CenterCrop(view.getContext().getApplicationContext()));

            if (!YogaConstants.isUndefined(view.borderRadius)) {
                transformations.add(new RoundedCornersTransformation(
                        view.getContext().getApplicationContext(),
                        (int) view.borderRadius,
                        0,
                        RoundedCornersTransformation.CornerType.ALL));
            }
            if (view.borderCornerRadii != null) {
                for (int i = 0; i < view.borderCornerRadii.length; i++) {
                    if (YogaConstants.isUndefined(view.borderCornerRadii[i])) {
                        continue;
                    }
                    RoundedCornersTransformation.CornerType cornerType = CORNER_TYPES[i];
                    transformations.add(new RoundedCornersTransformation(
                            view.getContext().getApplicationContext(),
                            (int) view.borderCornerRadii[i],
                            0,
                            cornerType));
                }
            }
            Transformation[] transformationsArr = new Transformation[transformations.size()];
            builder.bitmapTransform(transformations.toArray(transformationsArr));
        }
        builder.priority(view.priority)
                .placeholder(TRANSPARENT_DRAWABLE)
                .listener(LISTENER)
                .into(view);

        super.onAfterUpdateTransaction(view);
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
            for (ImageViewWithUrl view : viewsForKey) {
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

    private static class FIRequestListener implements RequestListener<GlideUrl, GlideDrawable> {
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
            eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_EVENT, new WritableNativeMap());
            eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_END_EVENT, new WritableNativeMap());
            return false;
        }
    }
}
