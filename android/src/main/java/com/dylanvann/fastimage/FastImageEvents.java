package com.dylanvann.fastimage;

import android.view.View;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.UIManagerHelper;
import com.facebook.react.uimanager.events.EventDispatcher;

// Sends FastImage view events through React Native's EventDispatcher.
final class FastImageEvents {
    private FastImageEvents() {
    }

    static void send(View view, String name) {
        send(view, name, Arguments.createMap());
    }

    static void send(View view, String name, WritableMap data) {
        ReactContext context = FastImageViewManager.getReactContext(view.getContext());
        if (context == null) return;
        EventDispatcher dispatcher = UIManagerHelper.getEventDispatcherForReactTag(context, view.getId());
        if (dispatcher != null) {
            dispatcher.dispatchEvent(
                    new FastImageEvent(UIManagerHelper.getSurfaceId(view), view.getId(), name, data));
        }
    }
}
