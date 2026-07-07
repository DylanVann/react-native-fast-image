package com.dylanvann.fastimage.events;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.Event;

public class FastImageErrorEvent extends Event<FastImageErrorEvent> {

    public FastImageErrorEvent(int surfaceId, int viewTag) {
        super(surfaceId, viewTag);
    }

    @NonNull
    @Override
    public String getEventName() {
        return "onFastImageError";
    }

    @Override
    protected WritableMap getEventData() {
        // Intentionally empty - matches iOS's empty error payload and avoids
        // forwarding native exception text (which can echo request URLs/hosts)
        // to JS.
        return Arguments.createMap();
    }
}
