package com.dylanvann.fastimage;

import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_ERROR_EVENT;
import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_LOAD_END_EVENT;
import static com.dylanvann.fastimage.FastImageRequestListener.REACT_ON_LOAD_EVENT;

import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.PorterDuff;
import android.util.Log;

import androidx.annotation.NonNull;

import com.bumptech.glide.Glide;
import com.bumptech.glide.RequestManager;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.LayoutShadowNode;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.PixelUtil;
import com.facebook.react.uimanager.PointerEvents;
import com.facebook.react.uimanager.annotations.ReactProp;
import com.facebook.react.views.imagehelper.ResourceDrawableIdHelper;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import javax.annotation.Nullable;

class FastImageViewManager extends SimpleViewManager<FastImageViewWithUrl> {

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

    @ReactProp(name = "source")
    public void setSource(FastImageViewWithUrl view, @Nullable ReadableMap source) {
        view.setSource(source);
    }

    @ReactProp(name = "sources")
    public void setSources(FastImageViewWithUrl view, @Nullable ReadableArray sources) {
        view.setSources(sources);
    }

    @ReactProp(name = "defaultSource")
    public void setDefaultSource(FastImageViewWithUrl view, @Nullable String source) {
        view.setDefaultSource(
                ResourceDrawableIdHelper.getInstance()
                        .getResourceDrawable(view.getContext(), source));
    }

    // React Native's View manager handles pointerEvents; a SimpleViewManager
    // doesn't. Parsed here: PointerEvents.parsePointerEvents isn't in every
    // supported React Native version.
    @ReactProp(name = "pointerEvents")
    public void setPointerEvents(FastImageViewWithUrl view, @Nullable String pointerEvents) {
        view.setPointerEvents(pointerEvents == null
                ? PointerEvents.AUTO
                : PointerEvents.valueOf(pointerEvents.toUpperCase(Locale.US).replace('-', '_')));
    }

    @ReactProp(name = "tintColor", customType = "Color")
    public void setTintColor(FastImageViewWithUrl view, @Nullable Integer color) {
        if (color == null) {
            view.clearColorFilter();
        } else {
            view.setColorFilter(color, PorterDuff.Mode.SRC_IN);
        }
    }

    @ReactProp(name = "recyclingKey")
    public void setRecyclingKey(FastImageViewWithUrl view, @Nullable String recyclingKey) {
        view.setRecyclingKey(recyclingKey);
    }

    @ReactProp(name = "loopCount", defaultInt = -1)
    public void setLoopCount(FastImageViewWithUrl view, int loopCount) {
        view.setLoopCount(loopCount);
    }

    @ReactProp(name = "imageRendering")
    public void setImageRendering(FastImageViewWithUrl view, @Nullable String imageRendering) {
        view.setImageRendering(imageRendering);
    }

    @ReactProp(name = "blurRadius")
    public void setBlurRadius(FastImageViewWithUrl view, float blurRadius) {
        view.setBlurRadius(PixelUtil.toPixelFromDIP(blurRadius));
    }

    @ReactProp(name = "transitionDuration")
    public void setTransitionDuration(FastImageViewWithUrl view, int transitionDuration) {
        view.setTransitionDuration(transitionDuration);
    }

    @ReactProp(name = "transitionBetweenImages")
    public void setTransitionBetweenImages(FastImageViewWithUrl view, boolean betweenImages) {
        view.setTransitionBetweenImages(betweenImages);
    }

    @ReactProp(name = "transitionSkipOnCacheHit")
    public void setTransitionSkipOnCacheHit(FastImageViewWithUrl view, @Nullable String skipOnCacheHit) {
        view.setTransitionSkipOnCacheHit(skipOnCacheHit);
    }

    @ReactProp(name = "paused")
    public void setPaused(FastImageViewWithUrl view, boolean paused) {
        view.setPaused(paused);
    }

    // Set when the image has an onProgress (see onDownloadProgress).
    @ReactProp(name = "trackProgress")
    public void setTrackProgress(FastImageViewWithUrl view, boolean trackProgress) {
        view.setTrackProgress(trackProgress);
    }

    @ReactProp(name = "resizeMode")
    public void setResizeMode(FastImageViewWithUrl view, String resizeMode) {
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
        return MapBuilder.<String, Object>builder()
                .put(REACT_ON_LOAD_START_EVENT, MapBuilder.of("registrationName", REACT_ON_LOAD_START_EVENT))
                .put(REACT_ON_PROGRESS_EVENT, MapBuilder.of("registrationName", REACT_ON_PROGRESS_EVENT))
                .put(REACT_ON_LOAD_EVENT, MapBuilder.of("registrationName", REACT_ON_LOAD_EVENT))
                .put(REACT_ON_ERROR_EVENT, MapBuilder.of("registrationName", REACT_ON_ERROR_EVENT))
                .put(REACT_ON_LOAD_END_EVENT, MapBuilder.of("registrationName", REACT_ON_LOAD_END_EVENT))
                .build();
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

    // Legacy architecture only; the New Architecture doesn't use shadow nodes.
    @NonNull
    @Override
    public LayoutShadowNode createShadowNodeInstance() {
        return new FastImageShadowNode();
    }

    @Override
    public void updateExtraData(@NonNull FastImageViewWithUrl view, Object extraData) {
        if (extraData == FastImageShadowNode.ZERO_LAYOUT) view.onZeroLayout();
    }

    @Override
    protected void onAfterUpdateTransaction(@NonNull FastImageViewWithUrl view) {
        super.onAfterUpdateTransaction(view);
        view.onAfterUpdate(this, view.requestManager);
    }
}
