package com.dylanvann.fastimage.events;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.Event;
import com.facebook.react.uimanager.events.RCTEventEmitter;

public class OnLoadEvent extends Event {

    public static final String EVENT_NAME = "topFastImageLoad";

    private final int mWidth;
    private final int mHeight;

    public OnLoadEvent(int viewId, int width, int height) {
        super(viewId);
        mWidth = width;
        mHeight = height;
    }

    @Override
    public String getEventName() {
        return EVENT_NAME;
    }

    @Override
    public short getCoalescingKey() {
        // All events for a given view can be coalesced.
        return 0;
    }

    @Override
    public void dispatch(RCTEventEmitter rctEventEmitter) {
        WritableMap args = Arguments.createMap();
        args.putInt("width", mWidth);
        args.putInt("height", mHeight);
        rctEventEmitter.receiveEvent(getViewTag(), getEventName(), args);
    }
}