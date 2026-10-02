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
        EventDispatcher dispatcher = UIManagerHelper.getEventDispatcherForReactTag(context, view.getId());
        if (dispatcher != null) {
            dispatcher.dispatchEvent(
                    new FastImageEvent(UIManagerHelper.getSurfaceId(view), view.getId(), name, data));
        }
    }
}
