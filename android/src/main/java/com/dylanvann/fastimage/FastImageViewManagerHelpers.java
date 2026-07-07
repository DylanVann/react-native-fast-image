package com.dylanvann.fastimage;

import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import android.os.Build;

import com.facebook.react.uimanager.ThemedReactContext;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import javax.annotation.Nullable;

/**
 * Logic shared between the old-architecture and new-architecture
 * FastImageViewManager (android/src/oldarch vs android/src/newarch source-set
 * split, only one of which is ever compiled into a given build) - kept here
 * in android/src/main so both variants share one copy instead of maintaining
 * two near-identical files.
 */
final class FastImageViewManagerHelpers {

    private FastImageViewManagerHelpers() {
    }

    // Which FastImageViewWithUrl instances are currently displaying a given
    // Glide/OkHttp cache key, so a single de-duplicated request's progress
    // events fan out to every view sharing that URL.
    //
    // The outer map is written from the UI thread (register/unregister, via
    // FastImageViewWithUrl.onAfterUpdate / ViewManager.onDropViewInstance)
    // and read from OkHttp's background dispatcher thread (onProgress, via
    // FastImageOkHttpProgressGlideModule's response-body interceptor) - and
    // callers iterate the inner list while it may concurrently be
    // added/removed to from the UI thread. ConcurrentHashMap + a
    // CopyOnWriteArrayList per key make both the map and the per-key list
    // safe for that concurrent read/iterate-while-write pattern.
    static final Map<String, List<FastImageViewWithUrl>> VIEWS_FOR_URLS = new ConcurrentHashMap<>();

    static void registerViewForUrl(String key, FastImageViewWithUrl view) {
        List<FastImageViewWithUrl> viewsForKey = VIEWS_FOR_URLS.get(key);
        if (viewsForKey != null) {
            if (!viewsForKey.contains(view)) {
                viewsForKey.add(view);
            }
            return;
        }
        List<FastImageViewWithUrl> newViewsForKey = new CopyOnWriteArrayList<>();
        newViewsForKey.add(view);
        VIEWS_FOR_URLS.put(key, newViewsForKey);
    }

    static void unregisterViewForUrl(String key, FastImageViewWithUrl view) {
        List<FastImageViewWithUrl> viewsForKey = VIEWS_FOR_URLS.get(key);
        if (viewsForKey != null) {
            viewsForKey.remove(view);
            if (viewsForKey.isEmpty()) {
                VIEWS_FOR_URLS.remove(key);
            }
        }
    }

    static boolean isValidContextForGlide(final Context context) {
        Activity activity = getActivityFromContext(context);
        return activity != null && !isActivityDestroyed(activity);
    }

    @Nullable
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
                final Context wrapperBaseContext = ((ContextWrapper) baseContext).getBaseContext();
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
}
