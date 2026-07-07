package com.dylanvann.fastimage.events;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.Event;

public class FastImageLoadEndEvent extends Event<FastImageLoadEndEvent> {

    public FastImageLoadEndEvent(int surfaceId, int viewTag) {
        super(surfaceId, viewTag);
    }

    @NonNull
    @Override
    public String getEventName() {
        return "onFastImageLoadEnd";
    }

    @Override
    protected WritableMap getEventData() {
        return Arguments.createMap();
    }
}
