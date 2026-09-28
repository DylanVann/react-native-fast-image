package com.dylanvann.fastimage;

import android.view.View;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.UIManagerModule;
import com.facebook.react.uimanager.events.EventDispatcher;

import java.lang.reflect.Method;

// Sends FastImage view events through React Native's EventDispatcher.
final class FastImageEvents {
    // UIManagerHelper.getEventDispatcherForReactTag (React Native 0.63+, also
    // bridgeless). Looked up by reflection so older versions still compile.
    @Nullable
    private static final Method GET_EVENT_DISPATCHER = findGetEventDispatcher();

    private FastImageEvents() {
    }

    static void send(View view, String name) {
        send(view, name, Arguments.createMap());
    }

    // onLoadEnd with the load's result: ok with the image's size, as onLoad
    // sent it.
    static void sendLoadEnd(View view, int width, int height) {
        WritableMap event = Arguments.createMap();
        event.putBoolean("ok", true);
        event.putInt("width", width);
        event.putInt("height", height);
        send(view, FastImageRequestListener.REACT_ON_LOAD_END_EVENT, event);
    }

    // onLoadEnd with the load's result: not ok, with the error onError sent.
    static void sendLoadEnd(View view, String error) {
        WritableMap event = Arguments.createMap();
        event.putBoolean("ok", false);
        event.putString("error", error);
        send(view, FastImageRequestListener.REACT_ON_LOAD_END_EVENT, event);
    }

    static void send(View view, String name, WritableMap data) {
        ReactContext context = FastImageViewManager.getReactContext(view.getContext());
        if (context == null) return;
        EventDispatcher dispatcher = eventDispatcher(context, view.getId());
        if (dispatcher != null) {
            dispatcher.dispatchEvent(new FastImageEvent(view.getId(), name, data));
        }
    }

    @Nullable
    private static EventDispatcher eventDispatcher(ReactContext context, int viewTag) {
        if (GET_EVENT_DISPATCHER != null) {
            try {
                return (EventDispatcher) GET_EVENT_DISPATCHER.invoke(null, context, viewTag);
            } catch (Exception ignored) {
                // Fall back to the UIManagerModule's.
            }
        }
        UIManagerModule uiManager = context.getNativeModule(UIManagerModule.class);
        return uiManager == null ? null : uiManager.getEventDispatcher();
    }

    @Nullable
    private static Method findGetEventDispatcher() {
        try {
            return Class.forName("com.facebook.react.uimanager.UIManagerHelper")
                    .getMethod("getEventDispatcherForReactTag", ReactContext.class, int.class);
        } catch (Exception e) {
            return null;
        }
    }
}
