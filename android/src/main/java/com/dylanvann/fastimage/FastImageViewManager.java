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
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.BackgroundStyleApplicator;
import com.facebook.react.uimanager.LengthPercentage;
import com.facebook.react.uimanager.LengthPercentageType;
import com.facebook.react.uimanager.PointerEvents;
import com.facebook.react.uimanager.ViewProps;
import com.facebook.react.uimanager.annotations.ReactPropGroup;
import com.facebook.react.uimanager.style.BorderRadiusProp;
import com.facebook.react.uimanager.style.LogicalEdge;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;
import com.facebook.react.views.imagehelper.ResourceDrawableIdHelper;

import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;

import javax.annotation.Nullable;

class FastImageViewManager extends SimpleViewManager<FastImageViewWithUrl> implements FastImageProgressListener {

    static final String REACT_CLASS = "FastImageView";
    static final String REACT_ON_LOAD_START_EVENT = "onFastImageLoadStart";
    static final String REACT_ON_PROGRESS_EVENT = "onFastImageProgress";
    private static final Map<String, List<FastImageViewWithUrl>> VIEWS_FOR_URLS = new WeakHashMap<>();

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
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

    @ReactProp(name = "source")
    public void setSource(FastImageViewWithUrl view, @Nullable ReadableMap source) {
        view.setSource(source);
    }

    // A require()d image, as Image.resolveAssetSource returns it. Android
    // loads it by name from the app's drawables.
    @ReactProp(name = "defaultSource")
    public void setDefaultSource(FastImageViewWithUrl view, @Nullable ReadableMap source) {
        String uri = source != null && source.hasKey("uri") && !source.isNull("uri")
                ? source.getString("uri") : null;
        view.setDefaultSource(
                ResourceDrawableIdHelper.getInstance()
                        .getResourceDrawable(view.getContext(), uri));
    }

    @ReactProp(name = ViewProps.POINTER_EVENTS)
    public void setPointerEvents(FastImageViewWithUrl view, @Nullable String pointerEvents) {
        view.setPointerEvents(PointerEvents.parsePointerEvents(pointerEvents));
    }

    @ReactProp(name = "progressEnabled")
    public void setProgressEnabled(FastImageViewWithUrl view, boolean progressEnabled) {
        view.setProgressEnabled(progressEnabled);
    }

    @ReactProp(name = "borderColor", customType = "Color")
    public void setBorderColor(FastImageViewWithUrl view, @Nullable Integer borderColor) {
        BackgroundStyleApplicator.setBorderColor(view, LogicalEdge.ALL, borderColor);
    }

    @ReactProp(name = "borderWidth", defaultFloat = Float.NaN)
    public void setBorderWidth(FastImageViewWithUrl view, float borderWidth) {
        BackgroundStyleApplicator.setBorderWidth(
                view, LogicalEdge.ALL, Float.isNaN(borderWidth) ? null : borderWidth);
    }

    @ReactPropGroup(
            names = {
                    ViewProps.BORDER_RADIUS,
                    ViewProps.BORDER_TOP_LEFT_RADIUS,
                    ViewProps.BORDER_TOP_RIGHT_RADIUS,
                    ViewProps.BORDER_BOTTOM_RIGHT_RADIUS,
                    ViewProps.BORDER_BOTTOM_LEFT_RADIUS,
            },
            defaultFloat = Float.NaN)
    public void setBorderRadius(FastImageViewWithUrl view, int index, float borderRadius) {
        LengthPercentage radius = Float.isNaN(borderRadius)
                ? null : new LengthPercentage(borderRadius, LengthPercentageType.POINT);
        BackgroundStyleApplicator.setBorderRadius(view, BorderRadiusProp.values()[index], radius);
    }

    @ReactProp(name = "tintColor", customType = "Color")
    public void setTintColor(FastImageViewWithUrl view, @Nullable Integer color) {
        if (color == null) {
            view.clearColorFilter();
        } else {
            view.setColorFilter(color, PorterDuff.Mode.SRC_IN);
        }
    }

    @ReactProp(name = "loopCount", defaultInt = -1)
    public void setLoopCount(FastImageViewWithUrl view, int loopCount) {
        view.setLoopCount(loopCount);
    }

    @ReactProp(name = "resizeMode")
    public void setResizeMode(FastImageViewWithUrl view, String resizeMode) {
        final FastImageViewWithUrl.ScaleType scaleType = FastImageViewConverter.getScaleType(resizeMode);
        view.setResizeMode(scaleType);
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
