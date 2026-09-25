package com.dylanvann.fastimage;

import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.Event;
import com.facebook.react.uimanager.events.RCTEventEmitter;

// An event for a FastImage view, sent with the EventDispatcher (see
// FastImageEvents) instead of the RCTEventEmitter JS module, which the New
// Architecture warns about on every event.
class FastImageEvent extends Event<FastImageEvent> {
    private final String name;
    private final WritableMap data;

    // Event(viewTag) works back to React Native 0.60. Without a surface id,
    // Fabric finds the view by its tag.
    @SuppressWarnings("deprecation")
    FastImageEvent(int viewTag, String name, WritableMap data) {
        super(viewTag);
        this.name = name;
        this.data = data;
    }

    @Override
    public String getEventName() {
        return name;
    }

    // Every event reaches JS, e.g. each progress update, as before.
    @Override
    public boolean canCoalesce() {
        return false;
    }

    // Overrides Event.getEventData on React Native 0.65+ (not on older ones,
    // hence no @Override).
    protected WritableMap getEventData() {
        return data;
    }

    @Override
    @SuppressWarnings("deprecation")
    public void dispatch(RCTEventEmitter rctEventEmitter) {
        rctEventEmitter.receiveEvent(getViewTag(), name, data);
    }
}
