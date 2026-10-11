package com.dylanvann.fastimage;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.UIManagerHelper;
import com.facebook.react.uimanager.events.EventDispatcher;

// Sends FastImage view events through React Native's EventDispatcher.
final class FastImageEvents {
    // The handledEvents prop's bits (see src/specs/FastImageViewNativeComponent.ts).
    static final int LOAD_START = 1;
    static final int PROGRESS = 1 << 1;
    static final int LOAD = 1 << 2;
    static final int ERROR = 1 << 3;
    static final int LOAD_END = 1 << 4;

    private FastImageEvents() {
    }

    private static int bit(String name) {
        switch (name) {
            case FastImageViewManager.REACT_ON_LOAD_START_EVENT:
                return LOAD_START;
            case FastImageViewManager.REACT_ON_PROGRESS_EVENT:
                return PROGRESS;
            case FastImageRequestListener.REACT_ON_LOAD_EVENT:
                return LOAD;
            case FastImageRequestListener.REACT_ON_ERROR_EVENT:
                return ERROR;
            case FastImageRequestListener.REACT_ON_LOAD_END_EVENT:
                return LOAD_END;
            default:
                return 0;
        }
    }

    static void send(FastImageViewWithUrl view, String name) {
        send(view, name, Arguments.createMap());
    }

    // onLoadEnd with the load's result: ok with the image's size, as onLoad
    // sent it.
    static void sendLoadEnd(FastImageViewWithUrl view, int width, int height) {
        WritableMap event = Arguments.createMap();
        event.putBoolean("ok", true);
        event.putInt("width", width);
        event.putInt("height", height);
        send(view, FastImageRequestListener.REACT_ON_LOAD_END_EVENT, event);
    }

    // onLoadEnd with the load's result: not ok, with the error onError sent.
    static void sendLoadEnd(FastImageViewWithUrl view, String error) {
        WritableMap event = Arguments.createMap();
        event.putBoolean("ok", false);
        event.putString("error", error);
        send(view, FastImageRequestListener.REACT_ON_LOAD_END_EVENT, event);
    }

    // Only the events JS has a handler for: most images have none.
    static void send(FastImageViewWithUrl view, String name, WritableMap data) {
        if (!view.handles(bit(name))) return;
        ReactContext context = FastImageViewManager.getReactContext(view.getContext());
        if (context == null) return;
        // The view's event dispatcher (Fabric, bridgeless). Deprecated from React
        // Native 0.85; its replacement, getEventDispatcher(context), isn't in 0.83.
        @SuppressWarnings("deprecation")
        EventDispatcher dispatcher = UIManagerHelper.getEventDispatcherForReactTag(context, view.getId());
        if (dispatcher != null) {
            dispatcher.dispatchEvent(new FastImageEvent(
                    UIManagerHelper.getSurfaceId(view), view.getId(), name, data));
        }
    }
}
