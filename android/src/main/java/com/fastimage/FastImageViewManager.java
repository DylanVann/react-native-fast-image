package com.fastimage;

import static com.fastimage.FastImageRequestListener.REACT_ON_ERROR_EVENT;
import static com.fastimage.FastImageRequestListener.REACT_ON_LOAD_END_EVENT;
import static com.fastimage.FastImageRequestListener.REACT_ON_LOAD_EVENT;

import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.PorterDuff;
import android.util.Log;
import android.graphics.Rect;

import androidx.annotation.NonNull;

import com.bumptech.glide.Glide;
import com.bumptech.glide.RequestManager;
import com.facebook.react.bridge.ColorPropConverter;
import com.facebook.react.bridge.Dynamic;
import com.facebook.react.bridge.DynamicFromObject;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableType;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.uimanager.BackgroundStyleApplicator;
import com.facebook.react.uimanager.LengthPercentage;
import com.facebook.react.uimanager.PointerEvents;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.uimanager.Spacing;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.PixelUtil;
import com.facebook.react.uimanager.ViewManagerDelegate;
import com.facebook.react.uimanager.ViewProps;
import com.facebook.react.uimanager.style.BackgroundImageLayer;
import com.facebook.react.uimanager.style.BorderRadiusProp;
import com.facebook.react.uimanager.style.BorderStyle;
import com.facebook.react.uimanager.style.LogicalEdge;
import com.facebook.react.viewmanagers.FastImageViewManagerDelegate;
import com.facebook.react.viewmanagers.FastImageViewManagerInterface;
import com.facebook.react.views.imagehelper.ResourceDrawableIdHelper;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import javax.annotation.Nullable;

// The FastImageView component (src/specs), with the props Codegen generates
// its interface from.
class FastImageViewManager extends SimpleViewManager<FastImageViewWithUrl>
        implements FastImageViewManagerInterface<FastImageViewWithUrl> {

    static final String REACT_CLASS = "FastImageView";
    static final String REACT_ON_LOAD_START_EVENT = "onFastImageLoadStart";
    static final String REACT_ON_PROGRESS_EVENT = "onFastImageProgress";
    static final String LOG_TAG = "FastImage";
    // Download progress, by the key downloads are shared by
    // (FastImageSharedDownloads.key): the views that get it, those with an onProgress from
    // their load's onLoadStart to its onLoad or onError, and the latest step a
    // download reported, until the UI thread sends it. The UI thread adds and
    // removes views, and downloads report steps on their own threads: only
    // used under its lock.
    private static final Map<String, Progress> PROGRESS = new HashMap<>();
    // Numbers the steps downloads report, so a view can tell those reported
    // before its load started (see FastImageViewWithUrl.takesProgress).
    private static final AtomicLong REPORTED_STEPS = new AtomicLong();
    // Whether any view gets progress (set under PROGRESS's lock), so downloads
    // can skip reporting without taking any lock.
    private static volatile boolean tracking = false;

    private static final class Progress {
        final Set<FastImageViewWithUrl> views = new LinkedHashSet<>();
        // A step waits to be sent: later ones replace it meanwhile, so a url
        // has at most one post to the UI thread at a time.
        boolean posted;
        long loaded;
        long total;
        long step;
    }

    // Codegen's delegate, plus the style props that React Native's View
    // handles itself (ReactViewManager) and its base delegate drops for other
    // views. FastImage is a single native view: they're the image's.
    private final ViewManagerDelegate<FastImageViewWithUrl> delegate =
            new FastImageViewManagerDelegate<FastImageViewWithUrl, FastImageViewManager>(this) {
                @Override
                public void setProperty(FastImageViewWithUrl view, String propName, @Nullable Object value) {
                    if (!setViewStyleProperty(view, propName, value)) {
                        super.setProperty(view, propName, value);
                    }
                }
            };

    // In BorderRadiusProp's order.
    private static final String[] BORDER_RADIUS_PROPS = {
            ViewProps.BORDER_RADIUS,
            ViewProps.BORDER_TOP_LEFT_RADIUS,
            ViewProps.BORDER_TOP_RIGHT_RADIUS,
            ViewProps.BORDER_BOTTOM_RIGHT_RADIUS,
            ViewProps.BORDER_BOTTOM_LEFT_RADIUS,
            ViewProps.BORDER_TOP_START_RADIUS,
            ViewProps.BORDER_TOP_END_RADIUS,
            ViewProps.BORDER_BOTTOM_START_RADIUS,
            ViewProps.BORDER_BOTTOM_END_RADIUS,
            ViewProps.BORDER_END_END_RADIUS,
            ViewProps.BORDER_END_START_RADIUS,
            ViewProps.BORDER_START_END_RADIUS,
            ViewProps.BORDER_START_START_RADIUS,
    };
    // In LogicalEdge's order.
    private static final String[] BORDER_WIDTH_PROPS = {
            ViewProps.BORDER_WIDTH,
            ViewProps.BORDER_LEFT_WIDTH,
            ViewProps.BORDER_RIGHT_WIDTH,
            ViewProps.BORDER_TOP_WIDTH,
            ViewProps.BORDER_BOTTOM_WIDTH,
            ViewProps.BORDER_START_WIDTH,
            ViewProps.BORDER_END_WIDTH,
    };
    private static final String[] BORDER_COLOR_PROPS = {
            ViewProps.BORDER_COLOR,
            ViewProps.BORDER_LEFT_COLOR,
            ViewProps.BORDER_RIGHT_COLOR,
            ViewProps.BORDER_TOP_COLOR,
            ViewProps.BORDER_BOTTOM_COLOR,
            ViewProps.BORDER_START_COLOR,
            ViewProps.BORDER_END_COLOR,
            ViewProps.BORDER_BLOCK_COLOR,
            ViewProps.BORDER_BLOCK_END_COLOR,
            ViewProps.BORDER_BLOCK_START_COLOR,
    };
    private static final int[] BORDER_COLOR_SPACING_TYPES = {
            Spacing.ALL,
            Spacing.LEFT,
            Spacing.RIGHT,
            Spacing.TOP,
            Spacing.BOTTOM,
            Spacing.START,
            Spacing.END,
            Spacing.BLOCK,
            Spacing.BLOCK_END,
            Spacing.BLOCK_START,
    };

    // A View style prop, as ReactViewManager sets it (borders and background
    // through BackgroundStyleApplicator, which also clips to the padding box:
    // see FastImageViewWithUrl.onDraw). Returns whether it was one.
    private static boolean setViewStyleProperty(FastImageViewWithUrl view, String propName, @Nullable Object value) {
        for (int i = 0; i < BORDER_RADIUS_PROPS.length; i++) {
            if (BORDER_RADIUS_PROPS[i].equals(propName)) {
                BackgroundStyleApplicator.setBorderRadius(
                        view,
                        BorderRadiusProp.values()[i],
                        LengthPercentage.setFromDynamic(new DynamicFromObject(value), false));
                return true;
            }
        }
        for (int i = 0; i < BORDER_WIDTH_PROPS.length; i++) {
            if (BORDER_WIDTH_PROPS[i].equals(propName)) {
                // A removed width is null, not NaN: React Native's border
                // insets (0.83 to 0.87) keep NaN, which doesn't fall back to
                // the width for every edge (borderWidth) as an unset one does.
                BackgroundStyleApplicator.setBorderWidth(
                        view,
                        LogicalEdge.values()[i],
                        value instanceof Number ? Float.valueOf(((Number) value).floatValue()) : null);
                view.updateBorderPadding();
                return true;
            }
        }
        for (int i = 0; i < BORDER_COLOR_PROPS.length; i++) {
            if (BORDER_COLOR_PROPS[i].equals(propName)) {
                BackgroundStyleApplicator.setBorderColor(
                        view,
                        LogicalEdge.fromSpacingType(BORDER_COLOR_SPACING_TYPES[i]),
                        value == null ? null : ColorPropConverter.getColor(value, view.getContext()));
                return true;
            }
        }
        switch (propName) {
            // A gradient (backgroundImage; experimental_backgroundImage until
            // React Native 0.87), drawn under the image as a View draws it.
            // Its size, position and repeat aren't: BackgroundStyleApplicator's
            // setters for them are internal to React Native.
            case "backgroundImage":
            case "experimental_backgroundImage":
                BackgroundStyleApplicator.setBackgroundImage(view, backgroundImageLayers(value, view));
                return true;
            case "borderStyle":
                BackgroundStyleApplicator.setBorderStyle(
                        view, value instanceof String ? BorderStyle.fromString((String) value) : null);
                return true;
            case ViewProps.OVERFLOW:
                view.setOverflow(value instanceof String ? (String) value : null);
                return true;
            case ViewProps.POINTER_EVENTS:
                view.setPointerEvents(
                        PointerEvents.parsePointerEvents(value instanceof String ? (String) value : null));
                return true;
            case "hitSlop":
                view.setHitSlopRect(hitSlopRect(value));
                return true;
            case "backfaceVisibility":
                view.setBackfaceVisibility(value instanceof String ? (String) value : "visible");
                return true;
            default:
                return false;
        }
    }

    // backgroundImage's layers, as ReactViewManager parses them, or null for
    // none.
    @Nullable
    private static List<BackgroundImageLayer> backgroundImageLayers(@Nullable Object value, FastImageViewWithUrl view) {
        if (!(value instanceof ReadableArray)) return null;
        ReadableArray layers = (ReadableArray) value;
        if (layers.size() == 0) return null;
        List<BackgroundImageLayer> parsed = new ArrayList<>(layers.size());
        for (int i = 0; i < layers.size(); i++) {
            BackgroundImageLayer layer = BackgroundImageLayer.Companion.parse(layers.getMap(i), view.getContext());
            if (layer != null) parsed.add(layer);
        }
        return parsed;
    }

    // hitSlop: a number for every side, or { top, left, bottom, right }, in dp.
    @Nullable
    private static Rect hitSlopRect(@Nullable Object value) {
        Dynamic hitSlop = new DynamicFromObject(value);
        if (hitSlop.getType() == ReadableType.Number) {
            int px = Math.round(PixelUtil.toPixelFromDIP(hitSlop.asDouble()));
            return new Rect(px, px, px, px);
        }
        if (hitSlop.getType() == ReadableType.Map) {
            ReadableMap map = hitSlop.asMap();
            return new Rect(px(map, "left"), px(map, "top"), px(map, "right"), px(map, "bottom"));
        }
        return null;
    }

    private static int px(ReadableMap map, String key) {
        return map.hasKey(key) && !map.isNull(key) ? Math.round(PixelUtil.toPixelFromDIP(map.getDouble(key))) : 0;
    }

    // React Native passes the layout's padding and borders together, but
    // padding doesn't inset the image: the view's padding is its border
    // widths instead (FastImageViewWithUrl.updateBorderPadding), as on iOS.
    @Override
    public void setPadding(FastImageViewWithUrl view, int left, int top, int right, int bottom) {}

    // backfaceVisibility hides the view by its opacity, as React Native's View
    // does: these keep the two in step.
    @Override
    public void setOpacity(@NonNull FastImageViewWithUrl view, float opacity) {
        view.setOpacityIfPossible(opacity);
    }

    @Override
    protected void setTransformProperty(
            @NonNull FastImageViewWithUrl view,
            @Nullable ReadableArray transforms,
            @Nullable ReadableArray transformOrigin) {
        super.setTransformProperty(view, transforms, transformOrigin);
        view.setBackfaceVisibilityDependantOpacity();
    }

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
        FastImageGlide.get(reactContext);
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
                ResourceDrawableIdHelper.getResourceDrawable(
                        view.getContext(), source.isNull() ? null : source.asString()));
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

    // Which events JS has a handler for (FastImageEvents); with onProgress,
    // the view gets its download's progress (see onDownloadProgress).
    @Override
    public void setHandledEvents(FastImageViewWithUrl view, int handledEvents) {
        view.setHandledEvents(handledEvents);
    }

    @Override
    public void setResizeMode(FastImageViewWithUrl view, @Nullable String resizeMode) {
        // repeat fills the view with the tiled image (see setImageDrawable).
        boolean repeat = "repeat".equals(resizeMode);
        final FastImageViewWithUrl.ScaleType scaleType =
                repeat ? FastImageViewWithUrl.ScaleType.FIT_XY : FastImageViewConverter.getScaleType(resizeMode);
        view.setResizeMode(scaleType, repeat, "center".equals(resizeMode));
    }

    @Override
    public void onDropViewInstance(@NonNull FastImageViewWithUrl view) {
        // Cancels its request, and nothing loads or tracks progress for it
        // any more (the progress map doesn't keep it, or its Activity).
        view.drop();

        super.onDropViewInstance(view);
    }

    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        Map<String, Object> events = new HashMap<>();
        for (String name : new String[] {
                REACT_ON_LOAD_START_EVENT,
                REACT_ON_PROGRESS_EVENT,
                REACT_ON_LOAD_EVENT,
                REACT_ON_ERROR_EVENT,
                REACT_ON_LOAD_END_EVENT,
        }) {
            Map<String, Object> event = new HashMap<>();
            event.put("registrationName", name);
            events.put(name, event);
        }
        return events;
    }

    // On the UI thread (FastImageViewWithUrl's updateProgressTracking).
    static void trackProgress(String key, FastImageViewWithUrl view) {
        synchronized (PROGRESS) {
            Progress progress = PROGRESS.get(key);
            if (progress == null) {
                progress = new Progress();
                PROGRESS.put(key, progress);
            }
            progress.views.add(view);
            tracking = true;
        }
    }

    // On the UI thread. A key's entry goes once it has no views.
    static void untrackProgress(String key, FastImageViewWithUrl view) {
        synchronized (PROGRESS) {
            Progress progress = PROGRESS.get(key);
            if (progress == null) return;
            progress.views.remove(view);
            if (progress.views.isEmpty()) PROGRESS.remove(key);
            tracking = !PROGRESS.isEmpty();
        }
    }

    // Whether any view gets progress now (a hint: a view can start loading
    // just after).
    static boolean wantsProgress() {
        return tracking;
    }

    // The latest step downloads reported (for a load that starts now).
    static long progressStep() {
        return REPORTED_STEPS.get();
    }

    // A download's progress (FastImageSharedDownloads), on its thread, which
    // only notes it if a view wants it (so downloads of images without an
    // onProgress post nothing). It's sent from the UI thread, where
    // views start and end their loads: a view only gets it during its own load,
    // not after its onLoad or once it loads again, and progress posted during
    // a download comes before the onLoad Glide posts after it.
    static void onDownloadProgress(final String key, long loaded, long total) {
        synchronized (PROGRESS) {
            Progress progress = PROGRESS.get(key);
            if (progress == null) return;
            // While a post is waiting, it keeps the furthest step: another
            // download of the key may report one behind it meanwhile. A step
            // kept keeps its number, so a load that started after it (e.g. a
            // reload, whose download reports behind it) doesn't take it.
            if (!progress.posted || (double) loaded / total >= (double) progress.loaded / progress.total) {
                progress.loaded = loaded;
                progress.total = total;
                progress.step = REPORTED_STEPS.incrementAndGet();
            }
            if (progress.posted) return;
            progress.posted = true;
        }
        UiThreadUtil.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                sendProgress(key);
            }
        });
    }

    private static void sendProgress(String key) {
        List<FastImageViewWithUrl> views;
        long loaded;
        long total;
        long step;
        synchronized (PROGRESS) {
            Progress progress = PROGRESS.get(key);
            // Sent already, or no view wants it any more.
            if (progress == null || !progress.posted) return;
            progress.posted = false;
            loaded = progress.loaded;
            total = progress.total;
            step = progress.step;
            views = new ArrayList<>(progress.views);
        }
        for (FastImageViewWithUrl view : views) {
            if (!view.takesProgress(step, loaded, total)) continue;
            WritableMap event = new WritableNativeMap();
            event.putInt("loaded", (int) loaded);
            event.putInt("total", (int) total);
            // Downloads only report a known length (see FastImageSharedDownloads).
            event.putDouble("progress", Math.min(1.0, Math.max(0.0, (double) loaded / total)));
            try {
                FastImageEvents.send(view, REACT_ON_PROGRESS_EVENT, event);
            } catch (RuntimeException e) {
                // E.g. the view's React instance is gone: progress isn't worth
                // crashing the app for.
                // (Not the key: it has the request's headers.)
                Log.w(LOG_TAG, "Couldn't send onProgress", e);
            }
        }
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
        return activity.isDestroyed() || activity.isFinishing();
    }

    @Override
    protected void onAfterUpdateTransaction(@NonNull FastImageViewWithUrl view) {
        super.onAfterUpdateTransaction(view);
        view.onAfterUpdate(this, view.requestManager);
    }
}
