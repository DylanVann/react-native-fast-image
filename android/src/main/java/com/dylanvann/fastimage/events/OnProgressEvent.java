package com.dylanvann.fastimage.events;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.Event;
import com.facebook.react.uimanager.events.RCTEventEmitter;

public class OnProgressEvent extends Event {

    public static final String EVENT_NAME = "topFastImageProgress";

    private final long mBytesRead;
    private final long mExpectedLength;

    public OnProgressEvent(int viewId, long bytesRead, long expectedLength) {
        super(viewId);
        mBytesRead = bytesRead;
        mExpectedLength = expectedLength;
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
        args.putInt("loaded", (int) mBytesRead);
        args.putInt("total", (int) mExpectedLength);
        rctEventEmitter.receiveEvent(getViewTag(), getEventName(), args);
    }
}