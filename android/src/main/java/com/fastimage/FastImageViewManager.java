package com.fastimage;

import static com.fastimage.FastImageRequestListener.REACT_ON_ERROR_EVENT;
import static com.fastimage.FastImageRequestListener.REACT_ON_LOAD_END_EVENT;
import static com.fastimage.FastImageRequestListener.REACT_ON_LOAD_EVENT;

import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.PorterDuff;
import android.util.Log;

import androidx.annotation.NonNull;

import com.bumptech.glide.Glide;
import com.bumptech.glide.RequestManager;
import com.facebook.react.bridge.Dynamic;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.PixelUtil;
import com.facebook.react.uimanager.PointerEvents;
import com.facebook.react.uimanager.ViewManagerDelegate;
import com.facebook.react.uimanager.ViewProps;
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

    // Codegen's delegate leaves pointerEvents to React Native's base delegate,
    // which only sets it on Views. FastImage gives its image view "none" for
    // pointerEvents="box-none" (the image is part of the box), and React
    // Native's touch handling reads it from a ReactPointerEventsView.
    private final ViewManagerDelegate<FastImageViewWithUrl> delegate =
            new FastImageViewManagerDelegate<FastImageViewWithUrl, FastImageViewManager>(this) {
                @Override
                public void setProperty(FastImageViewWithUrl view, String propName, @Nullable Object value) {
                    if (ViewProps.POINTER_EVENTS.equals(propName)) {
                        view.setPointerEvents(PointerEvents.parsePointerEvents(
                                value instanceof String ? (String) value : null));
                        return;
                    }
                    super.setProperty(view, propName, value);
                }
            };

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
