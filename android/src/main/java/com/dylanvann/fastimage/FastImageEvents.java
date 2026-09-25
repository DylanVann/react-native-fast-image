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
