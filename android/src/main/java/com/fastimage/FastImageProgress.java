package com.fastimage;

import android.os.Handler;
import android.os.Looper;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

// Download progress, by the key downloads are shared by
// (FastImageSharedDownloads.key): the views that get it, those with an onProgress from
// their load's onLoadStart to its onLoad or onError, and the latest step a
// download reported, until the UI thread sends it. The UI thread adds and
// removes views, and downloads report steps on their own threads: only
// used under its lock.
final class FastImageProgress {
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
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
        // has at most one step waiting at a time.
        boolean posted;
        long loaded;
        long total;
        long step;
    }

    private FastImageProgress() {
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
    // onProgress post nothing). The UI thread, where views start and end their
    // loads, picks the views that take it, and posts it behind their other
    // events (FastImageEvents.send): a view only gets it during its own load,
    // after its onLoadStart, not after its onLoad or once it loads again, and
    // progress posted during a download comes before the onLoad Glide posts
    // after it.
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
        MAIN.post(new Runnable() {
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
            Map<String, Object> event = new HashMap<>();
            event.put("loaded", (int) loaded);
            event.put("total", (int) total);
            // Downloads only report a known length (see FastImageSharedDownloads).
            event.put("progress", Math.min(1.0, Math.max(0.0, (double) loaded / total)));
            // Posted after the view's onLoadStart, which may still be waiting.
            FastImageEvents.send(view, FastImageEvents.REACT_ON_PROGRESS_EVENT, event);
        }
    }
}
