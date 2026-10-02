package com.dylanvann.fastimage;

import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_ERROR_EVENT;
import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_LOAD_END_EVENT;
import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_LOAD_EVENT;

import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.PorterDuff;
import android.os.Build;

import androidx.annotation.NonNull;

import com.bumptech.glide.Glide;
import com.bumptech.glide.RequestManager;
import com.facebook.react.bridge.Dynamic;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.PixelUtil;
import com.facebook.react.uimanager.ViewManagerDelegate;
import com.facebook.react.viewmanagers.FastImageViewManagerDelegate;
import com.facebook.react.viewmanagers.FastImageViewManagerInterface;
import com.facebook.react.views.imagehelper.ResourceDrawableIdHelper;

import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;

import javax.annotation.Nullable;

// The FastImageView component (src/specs), with the props Codegen generates
// its interface from.
class FastImageViewManager extends SimpleViewManager<FastImageViewWithUrl>
        implements FastImageProgressListener, FastImageViewManagerInterface<FastImageViewWithUrl> {

    static final String REACT_CLASS = "FastImageView";
    static final String REACT_ON_LOAD_START_EVENT = "onFastImageLoadStart";
    static final String REACT_ON_PROGRESS_EVENT = "onFastImageProgress";
    private static final Map<String, List<FastImageViewWithUrl>> VIEWS_FOR_URLS = new WeakHashMap<>();

    private final ViewManagerDelegate<FastImageViewWithUrl> delegate = new FastImageViewManagerDelegate<>(this);

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @Override
    protected ViewManagerDelegate<FastImageViewWithUrl> getDelegate() {
        return delegate;
    }

    @NonNull
    @Override
    protected FastImageViewWithUrl createViewInstance(@NonNull ThemedReactContext reactContext) {
        // Each view keeps the RequestManager for its own Activity. A single one
        // shared by all views kept the last view's Activity alive after it was
        // destroyed, and gave views another Activity's manager (#492).
        RequestManager requestManager = null;
        if (isValidContextForGlide(reactContext)) {
            requestManager = Glide.with(reactContext);
        } else if (getActivityFromContext(reactContext) == null) {
            // Not in an Activity (e.g. a root view created with the application
            // context): load with the application context, instead of leaving
            // requestManager null and never loading (#520).
            requestManager = Glide.with(reactContext.getApplicationContext());
        }

        return new FastImageViewWithUrl(reactContext, requestManager);
    }

    @Override
    public void setSource(FastImageViewWithUrl view, Dynamic source) {
        view.setSource(source.isNull() ? null : source.asMap());
    }

    @Override
    public void setSources(FastImageViewWithUrl view, Dynamic sources) {
        view.setSources(sources.isNull() ? null : sources.asArray());
    }

    // The resolved asset's uri.
    @Override
    public void setDefaultSource(FastImageViewWithUrl view, Dynamic source) {
        view.setDefaultSource(
                ResourceDrawableIdHelper.getInstance()
                        .getResourceDrawable(view.getContext(), source.isNull() ? null : source.asString()));
    }

    @Override
    public void setTintColor(FastImageViewWithUrl view, @Nullable Integer color) {
        if (color == null) {
            view.clearColorFilter();
        } else {
            view.setColorFilter(color, PorterDuff.Mode.SRC_IN);
        }
    }

    @Override
    public void setRecyclingKey(FastImageViewWithUrl view, @Nullable String recyclingKey) {
        view.setRecyclingKey(recyclingKey);
    }

    @Override
    public void setLoopCount(FastImageViewWithUrl view, int loopCount) {
        view.setLoopCount(loopCount);
    }

    @Override
    public void setImageRendering(FastImageViewWithUrl view, @Nullable String imageRendering) {
        view.setImageRendering(imageRendering);
    }

    @Override
    public void setBlurRadius(FastImageViewWithUrl view, float blurRadius) {
        view.setBlurRadius(PixelUtil.toPixelFromDIP(blurRadius));
    }

    @Override
    public void setTransitionDuration(FastImageViewWithUrl view, double transitionDuration) {
        view.setTransitionDuration((int) transitionDuration);
    }

    @Override
    public void setTransitionBetweenImages(FastImageViewWithUrl view, boolean betweenImages) {
        view.setTransitionBetweenImages(betweenImages);
    }

    @Override
    public void setTransitionSkipOnCacheHit(FastImageViewWithUrl view, @Nullable String skipOnCacheHit) {
        view.setTransitionSkipOnCacheHit(skipOnCacheHit);
    }

    @Override
    public void setPaused(FastImageViewWithUrl view, boolean paused) {
        view.setPaused(paused);
    }

    // iOS only: Android always decodes images at about the view's size.
    @Override
    public void setDownsample(FastImageViewWithUrl view, boolean downsample) {
    }

    @Override
    public void setTrackProgress(FastImageViewWithUrl view, boolean trackProgress) {
        view.trackProgress = trackProgress;
    }

    @Override
    public void setResizeMode(FastImageViewWithUrl view, @Nullable String resizeMode) {
        // repeat fills the view with the tiled image (see setImageDrawable).
        boolean repeat = "repeat".equals(resizeMode);
        final FastImageViewWithUrl.ScaleType scaleType =
                repeat ? FastImageViewWithUrl.ScaleType.FIT_XY : FastImageViewConverter.getScaleType(resizeMode);
        view.setResizeMode(scaleType, repeat);
    }

    @Override
    public void onDropViewInstance(@NonNull FastImageViewWithUrl view) {
        // This will cancel existing requests.
        view.clearView(view.requestManager);

        // Same key as when the view was tracked (toStringUrl, not toString,
        // which differ for urls that need escaping).
        view.untrackUrl(VIEWS_FOR_URLS);

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
                // Only views with an onProgress handler.
                if (!view.trackProgress) continue;
                WritableMap event = new WritableNativeMap();
                event.putInt("loaded", (int) bytesRead);
                event.putInt("total", (int) expectedLength);
                FastImageEvents.send(view, REACT_ON_PROGRESS_EVENT, event);
            }
        }
    }

    @Override
    public float getGranularityPercentage() {
        return 0.5f;
    }

    private static boolean isValidContextForGlide(final Context context) {
        Activity activity = getActivityFromContext(context);

        if (activity == null) {
            return false;
        }

        return !isActivityDestroyed(activity);
    }

    // A view's context is the ThemedReactContext it was created with, but below
    // Android 5 (API 21) AppCompatImageView wraps it in a TintContextWrapper, so
    // it can't be cast directly (#840). Unwrap until the ReactContext.
    @Nullable
    static ReactContext getReactContext(Context context) {
        while (context instanceof ContextWrapper) {
            if (context instanceof ReactContext) {
                return (ReactContext) context;
            }
            context = ((ContextWrapper) context).getBaseContext();
        }
        return null;
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
            return activity.isFinishing() || activity.isChangingConfigurations();
        }

    }

    @Override
    protected void onAfterUpdateTransaction(@NonNull FastImageViewWithUrl view) {
        super.onAfterUpdateTransaction(view);
        view.onAfterUpdate(this, view.requestManager, VIEWS_FOR_URLS);
    }
}
