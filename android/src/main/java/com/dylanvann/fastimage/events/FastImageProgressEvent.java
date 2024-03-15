package com.dylanvann.fastimage.events;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.Event;

public class FastImageProgressEvent extends Event<FastImageProgressEvent> {

  private final int mBytesRead;
  private final int mExpectedLength;

  public FastImageProgressEvent(int surfaceId, int viewTag, int bytesRead, int expectedLength) {
    super(surfaceId, viewTag);
    this.mBytesRead = bytesRead;
    this.mExpectedLength = expectedLength;
  }

  @NonNull
  @Override
  public String getEventName() {
    return "onFastImageProgress";
  }

  @Override
  protected WritableMap getEventData() {
    WritableMap eventData = Arguments.createMap();
    eventData.putInt("loaded", mBytesRead);
    eventData.putInt("total", mExpectedLength);
    return eventData;
  }

}
