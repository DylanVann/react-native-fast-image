package com.dylanvann.fastimage;

import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_ERROR_EVENT;
import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_LOAD_END_EVENT;
import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_LOAD_EVENT;

import android.graphics.PorterDuff;

import androidx.annotation.NonNull;

import com.bumptech.glide.Glide;
import com.bumptech.glide.RequestManager;
import com.dylanvann.fastimage.events.FastImageProgressEvent;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.UIManagerHelper;
import com.facebook.react.uimanager.ViewManagerDelegate;
import com.facebook.react.uimanager.annotations.ReactProp;
import com.facebook.react.uimanager.events.EventDispatcher;
import com.facebook.react.views.imagehelper.ResourceDrawableIdHelper;
import com.facebook.react.viewmanagers.FastImageViewManagerDelegate;
import com.facebook.react.viewmanagers.FastImageViewManagerInterface;

import java.util.List;
import java.util.Map;

import javax.annotation.Nullable;

class FastImageViewManager extends SimpleViewManager<FastImageViewWithUrl> implements FastImageProgressListener, FastImageViewManagerInterface<FastImageViewWithUrl> {

    static final String REACT_CLASS = "FastImageView";
    static final String REACT_ON_LOAD_START_EVENT = "onFastImageLoadStart";
    static final String REACT_ON_PROGRESS_EVENT = "onFastImageProgress";

    private final ViewManagerDelegate<FastImageViewWithUrl> mDelegate;

    @Nullable
    private RequestManager requestManager = null;

    FastImageViewManager() {
        mDelegate = new FastImageViewManagerDelegate<>(this);
    }

    @Nullable
    @Override
    protected ViewManagerDelegate<FastImageViewWithUrl> getDelegate() {
        return mDelegate;
    }

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @NonNull
    @Override
    protected FastImageViewWithUrl createViewInstance(@NonNull ThemedReactContext reactContext) {
        if (FastImageViewManagerHelpers.isValidContextForGlide(reactContext)) {
            requestManager = Glide.with(reactContext);
        }

        return new FastImageViewWithUrl(reactContext);
    }

    @Override
    @ReactProp(name = "source")
    public void setSource(FastImageViewWithUrl view, @Nullable ReadableMap source) {
        view.setSource(source);
    }

    @Override
    @ReactProp(name = "defaultSource")
    public void setDefaultSource(FastImageViewWithUrl view, @Nullable String source) {
        view.setDefaultSource(
                ResourceDrawableIdHelper.getInstance()
                        .getResourceDrawable(view.getContext(), source));
    }

    @Override
    @ReactProp(name = "tintColor", customType = "Color")
    public void setTintColor(FastImageViewWithUrl view, @Nullable Integer color) {
        if (color == null) {
            view.clearColorFilter();
        } else {
            view.setColorFilter(color, PorterDuff.Mode.SRC_IN);
        }
    }

    @Override
    @ReactProp(name = "resizeMode")
    public void setResizeMode(FastImageViewWithUrl view, @Nullable String resizeMode) {
        final FastImageViewWithUrl.ScaleType scaleType = FastImageViewConverter.getScaleType(resizeMode);
        view.setScaleType(scaleType);
    }

    @Override
    public void onDropViewInstance(@NonNull FastImageViewWithUrl view) {
        // This will cancel existing requests.
        view.clearView(requestManager);

        if (view.glideUrl != null) {
            final String key = view.glideUrl.toStringUrl();
            FastImageOkHttpProgressGlideModule.forget(key);
            FastImageViewManagerHelpers.unregisterViewForUrl(key, view);
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
        List<FastImageViewWithUrl> viewsForKey = FastImageViewManagerHelpers.VIEWS_FOR_URLS.get(key);
        if (viewsForKey != null) {
            for (FastImageViewWithUrl view : viewsForKey) {
                ThemedReactContext context = (ThemedReactContext) view.getContext();
                EventDispatcher dispatcher = UIManagerHelper.getEventDispatcherForReactTag(context, view.getId());
                int surfaceId = UIManagerHelper.getSurfaceId(context);
                if (dispatcher != null) {
                    dispatcher.dispatchEvent(new FastImageProgressEvent(
                            surfaceId,
                            view.getId(),
                            (int) bytesRead,
                            (int) expectedLength));
                }
            }
        }
    }

    @Override
    public float getGranularityPercentage() {
        return 0.5f;
    }

    @Override
    protected void onAfterUpdateTransaction(@NonNull FastImageViewWithUrl view) {
        super.onAfterUpdateTransaction(view);
        view.onAfterUpdate(this, requestManager);
    }
}
