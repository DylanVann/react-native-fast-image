package com.dylanvann.fastimage.events;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.Event;

public class FastImageLoadEvent extends Event<FastImageLoadEvent> {

    private final int width;
    private final int height;

    public FastImageLoadEvent(int surfaceId, int viewTag, int width, int height) {
        super(surfaceId, viewTag);
        this.width = width;
        this.height = height;
    }

    @NonNull
    @Override
    public String getEventName() {
        return "onFastImageLoad";
    }

    @Override
    protected WritableMap getEventData() {
        WritableMap eventData = Arguments.createMap();
        eventData.putInt("width", width);
        eventData.putInt("height", height);
        return eventData;
    }
}
