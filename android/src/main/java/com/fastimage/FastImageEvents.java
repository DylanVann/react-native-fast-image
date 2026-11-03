package com.fastimage;

import android.os.Handler;
import android.os.Looper;

import java.util.HashMap;
import java.util.Map;

// Sends FastImage view events to whatever hosts the view
// (FastImageViewWithUrl.dispatchEvent).
final class FastImageEvents {
    // The handledEvents prop's bits (see src/specs/FastImageViewNativeComponent.ts).
    static final int LOAD_START = 1;
    static final int PROGRESS = 1 << 1;
    static final int LOAD = 1 << 2;
    static final int ERROR = 1 << 3;
    static final int LOAD_END = 1 << 4;

    static final String REACT_ON_LOAD_START_EVENT = "onFastImageLoadStart";
    static final String REACT_ON_PROGRESS_EVENT = "onFastImageProgress";
    static final String REACT_ON_ERROR_EVENT = "onFastImageError";
    static final String REACT_ON_LOAD_EVENT = "onFastImageLoad";
    static final String REACT_ON_LOAD_END_EVENT = "onFastImageLoadEnd";

    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private FastImageEvents() {
    }

    private static int bit(String name) {
        switch (name) {
            case REACT_ON_LOAD_START_EVENT:
                return LOAD_START;
            case REACT_ON_PROGRESS_EVENT:
                return PROGRESS;
            case REACT_ON_LOAD_EVENT:
                return LOAD;
            case REACT_ON_ERROR_EVENT:
                return ERROR;
            case REACT_ON_LOAD_END_EVENT:
                return LOAD_END;
            default:
                return 0;
        }
    }

    static void send(FastImageViewWithUrl view, String name) {
        send(view, name, new HashMap<>());
    }

    // onLoadEnd with the load's result: ok with the image's size, as onLoad
    // sent it.
    static void sendLoadEnd(FastImageViewWithUrl view, int width, int height) {
        Map<String, Object> event = new HashMap<>();
        event.put("ok", true);
        event.put("width", width);
        event.put("height", height);
        send(view, REACT_ON_LOAD_END_EVENT, event);
    }

    // onLoadEnd with the load's result: not ok, with the error onError sent.
    static void sendLoadEnd(FastImageViewWithUrl view, String error) {
        Map<String, Object> event = new HashMap<>();
        event.put("ok", false);
        event.put("error", error);
        send(view, REACT_ON_LOAD_END_EVENT, event);
    }

    // Only the events JS has a handler for: most images have none. Posted to
    // the main thread rather than dispatched here: this is called from Glide's
    // onResourceReady and onLoadFailed, and EventDispatcher calls its listeners
    // inline. Reanimated's listener flushes pending mount items, which can
    // drop this view, and the drop clears the request inside its own
    // callback, which Glide doesn't allow (it throws). Every event goes through
    // here, so they keep their order: e.g. a view's onProgress comes after its
    // onLoadStart, even from progress the UI thread had waiting before the
    // load started.
    static void send(FastImageViewWithUrl view, String name, Map<String, Object> data) {
        if (!view.handles(bit(name))) return;
        MAIN.post(() -> dispatch(view, name, data));
    }

    private static void dispatch(FastImageViewWithUrl view, String name, Map<String, Object> data) {
        if (!view.handles(bit(name))) return;
        view.dispatchEvent(name, data);
    }
}
