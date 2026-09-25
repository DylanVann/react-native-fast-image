package com.dylanvann.fastimage;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.Event;

// An event for a FastImage view, sent with the EventDispatcher (see
// FastImageEvents).
class FastImageEvent extends Event<FastImageEvent> {
    private final String name;
    private final WritableMap data;

    FastImageEvent(int surfaceId, int viewTag, String name, WritableMap data) {
        super(surfaceId, viewTag);
        this.name = name;
        this.data = data;
    }

    @Override
    public String getEventName() {
        return name;
    }

    // Every event reaches JS, e.g. each progress update.
    @Override
    public boolean canCoalesce() {
        return false;
    }

    @Nullable
    @Override
    protected WritableMap getEventData() {
        return data;
    }
}
